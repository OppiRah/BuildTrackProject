// The owner Worker's request handling (docs/PROPOSAL_QUOTATION_WORKFLOW.md §2.1, §5, §7, §16).
//
// Order for every request:
//   configuration (fails closed with 503) -> Cloudflare Access JWT for the one owner email
//   (anything else gets 404) -> route and method (GET/HEAD read-only; POST for changes).
// Every POST must also have: the exact owner Origin (and same-origin Sec-Fetch-Site when sent),
// a form-encoded body under 32 KB with exactly the expected fields, and a signed single-use form
// token bound to this owner, action, target and version. The change itself is one D1 batch
// (store.ts) that succeeds only if the quote is still at that version.
//
// Pages: list -> request (draft form) -> confirmation -> approve. Email mode (EMAIL_MODE):
// - manual (the release mode; anything but "resend"): approval creates the customer link and no email
//   job; the request page then prepares the invitation (mailto, copyable text, the link), rebuilt
//   here from the link key and checked against the stored hash, for the owner to send from their own
//   email account; "Mark as manually sent" records the owner's statement. Resend is not offered.
// - resend (retained, not released): approval queues one quotation email job for the sender.

import { plans } from '../../src/config/pricing.ts';
import { verifyAccessJwt, validTeamDomain, type AccessKeySource } from '../../src/lib/quotation/access-jwt.ts';
import { readBody } from '../../src/lib/quotation/body.ts';
import type { D1Database } from '../../src/lib/quotation/d1.ts';
import { parseFormEncoded } from '../../src/lib/quotation/intake.ts';
import { buildInvitation, manualEmailMode } from '../../src/lib/quotation/invitation.ts';
import { log } from '../../src/lib/quotation/log.ts';
import {
  formatAmount,
  importHmacKey,
  issueFormToken,
  quoteLimits,
  sha256Hex,
  validateQuote,
  verifyFormToken,
  type FormTokenBinding,
  type OwnerAction,
} from '../../src/lib/quotation/owner-form.ts';
import { currentLinkKey, quoteLinkToken } from '../../src/lib/quotation/quote-link.ts';
import {
  confirmPage,
  detailPage,
  listPage,
  messagePage,
  notFound,
  ownerPage,
  REFERRER_POLICY,
  lifecycleAllowed,
  lifecycleConfirmPage,
  markSentAllowed,
  markSentConfirmPage,
  OWNER_SCRIPT,
  resendable,
  resendConfirmPage,
  type Lifecycle,
  type DraftForm,
  type InvitationView,
} from './pages.ts';
import {
  approveQuote,
  createDraft,
  getRequest,
  listRequests,
  deleteRequest,
  dismissRequest,
  markInvitationSent,
  ownerEmailProblems,
  replaceLink,
  resendQuotation,
  revokeQuote,
  sendInProgress,
  saveDraft,
  type QuoteRow,
  type RequestRow,
} from './store.ts';

export interface OwnerEnv {
  DB?: D1Database;
  WORKFLOW_ENABLED?: string;
  /** Exact origin of the owner Worker, e.g. "https://buildtrack-owner.sunnydelacruz.workers.dev". */
  OWNER_ORIGIN?: string;
  /** The one address allowed in (must match the Access JWT's email). */
  OWNER_EMAIL?: string;
  /** "<team>.cloudflareaccess.com" */
  ACCESS_TEAM_DOMAIN?: string;
  /** The Access application's AUD tag. */
  ACCESS_AUD?: string;
  /** Secret: 32+ random bytes, base64. Signs owner form tokens only. */
  OWNER_FORM_KEY?: string;
  /** Selects QUOTE_LINK_KEY_V<n> (a secret, §4) for new customer links. */
  QUOTE_LINK_KEY_CURRENT?: string;
  [secret: `QUOTE_LINK_KEY_V${number}`]: string | undefined;
  /** "resend": automatic email (retained, not the release mode). Anything else, including unset: manual. */
  EMAIL_MODE?: string;
  /** Canonical origin of the public site, for the customer links in prepared invitations. */
  PUBLIC_ORIGIN?: string;
}

const MAX_BODY_BYTES = 32 * 1024;
const ID = '([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})';
const routes = {
  list: /^\/$/,
  detail: new RegExp(`^/requests/${ID}$`),
  confirm: new RegExp(`^/requests/${ID}/confirm$`),
  draft: new RegExp(`^/requests/${ID}/draft$`),
  approve: new RegExp(`^/requests/${ID}/approve$`),
  resend: new RegExp(`^/requests/${ID}/resend$`),
  markSent: new RegExp(`^/requests/${ID}/mark-sent$`),
  lifecycle: new RegExp(`^/requests/${ID}/(revoke|new-link|dismiss|delete)$`),
  script: /^\/owner\.js$/,
};
const draftFields = ['form_token', 'version', 'scope', 'amount', 'validity_days'];
const approveFields = ['form_token', 'version'];

const methodNotAllowed = (allow: string) => ownerPage(405, 'Method not allowed', '<h1>Method not allowed</h1>', { Allow: allow });
const seeOther = (location: string) =>
  new Response(null, { status: 303, headers: { Location: location, 'Cache-Control': 'no-store', 'Referrer-Policy': REFERRER_POLICY, 'X-Robots-Tag': 'noindex' } });
const expiredForm = (requestId: string) =>
  messagePage(403, 'This form can no longer be used', 'It expired, was already submitted, or belongs to an earlier version of this quotation. Nothing was changed.', {
    href: `/requests/${requestId}`,
    label: 'Open the request again',
  });
const changedMeanwhile = (requestId: string) =>
  messagePage(409, 'Nothing was changed by this submission', 'The quotation was already saved, approved or changed from another page. Open the request to see its current state.', {
    href: `/requests/${requestId}`,
    label: 'Open the request',
  });

interface Context {
  db: D1Database;
  owner: string;
  formKey: CryptoKey;
  env: OwnerEnv;
  now: number;
  /** Manual email mode (the release mode). */
  manual: boolean;
  originAllowed: OwnerOriginCheck;
}

/** Exact field set from a strict form-encoded body, or null. */
function formFields(text: string, expected: string[]): Record<string, string> | null {
  const entries = parseFormEncoded(text);
  if (!entries || entries.length !== expected.length) return null;
  const fields: Record<string, string> = {};
  for (const [name, value] of entries) {
    if (!expected.includes(name) || name in fields) return null;
    fields[name] = value;
  }
  return fields;
}

/** The URL when `value` is exactly one canonical serialized origin (as browsers send it in `Origin`); otherwise null. */
export function canonicalOrigin(value: string | undefined): URL | null {
  if (!value || value === 'null') return null;
  try {
    const url = new URL(value);
    return url.origin === value ? url : null; // rejects credentials, any path, query, fragment or non-canonical form
  } catch {
    return null;
  }
}

/** Decides whether a configured OWNER_ORIGIN is acceptable. */
export type OwnerOriginCheck = (value: string | undefined) => boolean;

/**
 * The deployed rule, with no exception: OWNER_ORIGIN must be a canonical HTTPS origin (scheme,
 * host and optional non-default port; no credentials, path, query or fragment). Anything else,
 * including HTTP on a loopback host, leaves the owner Worker unconfigured (503). Only the test-only
 * wrapper (tests/worker/owner-test-worker.ts) passes a looser check, for loopback HTTP tests.
 */
export const validOwnerOrigin: OwnerOriginCheck = (value) => canonicalOrigin(value)?.protocol === 'https:';

const versionOf = (text: string) => (/^(0|[1-9]\d{0,8})$/.test(text) ? Number(text) : null);

/** The binding a draft form uses: create (no quote yet) or save (the draft's id and version). */
const draftBinding = (owner: string, request: RequestRow, quote: QuoteRow | null, version: number): FormTokenBinding =>
  quote ? { owner, action: 'save', target: quote.id, version } : { owner, action: 'create', target: request.id, version: 0 };

function prefill(request: RequestRow): { amount: string; note: string | null } {
  const plan = plans.find((item) => item.id === request.plan);
  if (!plan?.amountPhp) return { amount: '', note: null };
  return {
    amount: String(plan.amountPhp),
    note: `Prefilled from the proposed ${plan.name} price (${formatAmount(plan.amountPhp * 100)} per ${plan.billingPeriod ?? 'period'}); change it as needed.`,
  };
}

async function draftFormFor(ctx: Context, request: RequestRow, quote: QuoteRow | null): Promise<DraftForm | null> {
  if (quote && quote.status !== 'draft') return null;
  const binding = draftBinding(ctx.owner, request, quote, quote?.version ?? 0);
  const fill = prefill(request);
  return {
    token: await issueFormToken(ctx.formKey, binding, ctx.now),
    version: binding.version,
    scope: quote?.scope_text ?? '',
    amount: quote ? formatAmount(quote.amount_centavos).slice(1) : fill.amount,
    validity: String(quote?.validity_days ?? quoteLimits.validityDefault),
    errors: {},
    prefillNote: quote ? null : fill.note,
  };
}

/**
 * Manual email mode: the invitation for the quotation's CURRENT link, rebuilt in this authenticated
 * request from the link key version and generation recorded at approval (quote-link.ts), and used
 * only if its hash equals the stored token_hash. The token is never stored or logged; the page that
 * shows it is no-store. Returns why not, when no working link can be prepared.
 */
async function invitationFor(ctx: Context, request: RequestRow, quote: QuoteRow): Promise<InvitationView | null> {
  if (quote.status === 'draft') return null;
  const unavailable = (reason: string): InvitationView => ({ kind: 'unavailable', reason });
  if (!quote.token_hash)
    return unavailable(quote.status === 'revoked' ? 'The customer’s link was revoked. Create a new link to prepare a fresh invitation.' : 'This quotation has no working customer link.');
  if ((quote.expires_at ?? 0) <= ctx.now) return unavailable('The customer’s link has expired, so no invitation can be prepared. A changed or renewed quotation needs a new request.');
  if (!ctx.originAllowed(ctx.env.PUBLIC_ORIGIN)) return unavailable('The public site address (PUBLIC_ORIGIN) is not configured, so the customer link cannot be prepared.');
  const secret = quote.link_key_version ? (ctx.env as Record<string, unknown>)[`QUOTE_LINK_KEY_V${quote.link_key_version}`] : undefined;
  const key = await importHmacKey(typeof secret === 'string' ? secret : undefined, ['sign']);
  if (!key || !quote.link_key_version) return unavailable('The key for this link is no longer configured. Create a new link to prepare a fresh invitation.');
  const token = await quoteLinkToken({ key, version: quote.link_key_version }, quote.id, quote.link_generation);
  if ((await sha256Hex(token)) !== quote.token_hash) return unavailable('The rebuilt link does not match the approved link (the link key changed). Create a new link.');
  return {
    kind: 'ready',
    invitation: buildInvitation(
      ctx.env.PUBLIC_ORIGIN!,
      {
        quoteRef: quote.ref,
        requestRef: request.ref,
        name: quote.snap_name ?? '',
        email: quote.snap_email ?? '',
        scope: quote.snap_scope ?? '',
        amountCentavos: quote.snap_amount_centavos ?? 0,
        expiresAt: quote.expires_at!,
      },
      token,
    ),
  };
}

async function readForm(request: Request, ctx: Context, expected: string[]): Promise<Record<string, string> | Response> {
  if (request.headers.get('Origin') !== ctx.env.OWNER_ORIGIN) return refuse(403, 'E_ORIGIN');
  const site = request.headers.get('Sec-Fetch-Site');
  if (site !== null && site !== 'same-origin') return refuse(403, 'E_ORIGIN');
  if ((request.headers.get('Content-Type') ?? '').split(';')[0]!.trim().toLowerCase() !== 'application/x-www-form-urlencoded')
    return refuse(415, 'E_MEDIA_TYPE');
  const body = await readBody(request, MAX_BODY_BYTES);
  if (!('text' in body)) return refuse(body.tooLarge ? 413 : 400, 'E_BODY');
  return formFields(body.text, expected) ?? refuse(400, 'E_BODY_SHAPE');
}

function refuse(status: number, code: `E_${string}`): Response {
  log('owner_refused', { route: 'owner', status, code });
  return messagePage(status, 'Request not accepted', 'This request did not come from an owner page in the expected form. Nothing was changed.', {
    href: '/',
    label: 'Open the request list',
  });
}

async function verifiedToken(ctx: Context, token: string, binding: FormTokenBinding): Promise<{ tokenHash: string; tokenExpires: number } | null> {
  const expires = await verifyFormToken(ctx.formKey, token, binding, ctx.now);
  return expires === null ? null : { tokenHash: await sha256Hex(token), tokenExpires: expires };
}

async function postDraft(request: Request, ctx: Context, requestId: string): Promise<Response> {
  const fields = await readForm(request, ctx, draftFields);
  if (fields instanceof Response) return fields;
  const found = await getRequest(ctx.db, requestId);
  if (!found) return notFound();
  const { request: row, quote, jobs } = found;
  const version = versionOf(fields.version!);
  if (version === null) return refuse(400, 'E_BODY_SHAPE');
  const binding = draftBinding(ctx.owner, row, quote, version);
  const used = await verifiedToken(ctx, fields.form_token!, binding);
  if (!used) {
    log('owner_refused', { route: 'owner', status: 403, code: 'E_FORM_TOKEN', action: binding.action });
    return expiredForm(row.id);
  }
  const checked = validateQuote({ scope: fields.scope!, amount: fields.amount!, validity_days: fields.validity_days! });
  if ('errors' in checked) {
    // Nothing was written, so the same binding gets a fresh token and the owner's input is kept.
    const form: DraftForm = {
      token: await issueFormToken(ctx.formKey, binding, ctx.now),
      version,
      scope: fields.scope!,
      amount: fields.amount!,
      validity: fields.validity_days!,
      errors: checked.errors,
      prefillNote: null,
    };
    return detailPage(422, row, quote, jobs, form, ctx.now, { manual: ctx.manual, invitation: null });
  }
  const use = { ...used, owner: ctx.owner, now: ctx.now };
  const outcome = quote ? await saveDraft(ctx.db, quote.id, version, checked.values, use) : await createDraft(ctx.db, row.id, checked.values, use);
  log(outcome === 'done' ? 'owner_changed' : 'owner_refused', { route: 'owner', action: binding.action, status: outcome === 'done' ? 303 : 409 });
  return outcome === 'done' ? seeOther(`/requests/${row.id}/confirm`) : changedMeanwhile(row.id);
}

async function postApprove(request: Request, ctx: Context, requestId: string): Promise<Response> {
  const fields = await readForm(request, ctx, approveFields);
  if (fields instanceof Response) return fields;
  const found = await getRequest(ctx.db, requestId);
  if (!found?.quote) return notFound();
  const { quote } = found;
  const version = versionOf(fields.version!);
  if (version === null) return refuse(400, 'E_BODY_SHAPE');
  const action: OwnerAction = 'approve';
  const used = await verifiedToken(ctx, fields.form_token!, { owner: ctx.owner, action, target: quote.id, version });
  if (!used) {
    log('owner_refused', { route: 'owner', status: 403, code: 'E_FORM_TOKEN', action });
    return expiredForm(requestId);
  }
  const linkKey = await currentLinkKey(ctx.env as Record<string, unknown>);
  if (!linkKey) throw new Error('E_LINK_KEY');
  const linkGeneration = quote.link_generation + 1;
  const outcome = await approveQuote(ctx.db, {
    quoteId: quote.id,
    version,
    linkKeyVersion: linkKey.version,
    linkGeneration,
    tokenHash: await sha256Hex(await quoteLinkToken(linkKey, quote.id, linkGeneration)),
    use: { ...used, owner: ctx.owner, now: ctx.now },
    queueEmail: !ctx.manual,
  });
  log(outcome === 'done' ? 'owner_changed' : 'owner_refused', { route: 'owner', action, status: outcome === 'done' ? 303 : 409 });
  return outcome === 'done' ? seeOther(`/requests/${requestId}`) : changedMeanwhile(requestId);
}

async function postResend(request: Request, ctx: Context, requestId: string): Promise<Response> {
  const fields = await readForm(request, ctx, approveFields);
  if (fields instanceof Response) return fields;
  if (ctx.manual) return changedMeanwhile(requestId); // no automatic email in manual mode
  const found = await getRequest(ctx.db, requestId);
  if (!found?.quote) return notFound();
  const job = found.jobs[found.jobs.length - 1];
  const version = versionOf(fields.version!);
  if (version === null) return refuse(400, 'E_BODY_SHAPE');
  const action: OwnerAction = 'resend';
  const used = job ? await verifiedToken(ctx, fields.form_token!, { owner: ctx.owner, action, target: job.id, version }) : null;
  if (!job || !used) {
    log('owner_refused', { route: 'owner', status: 403, code: 'E_FORM_TOKEN', action });
    return expiredForm(requestId);
  }
  const outcome = await resendQuotation(ctx.db, { jobId: job.id, quoteId: found.quote.id, version, use: { ...used, owner: ctx.owner, now: ctx.now } });
  log(outcome === 'done' ? 'owner_changed' : 'owner_refused', { route: 'owner', action, status: outcome === 'done' ? 303 : 409 });
  return outcome === 'done' ? seeOther(`/requests/${requestId}`) : changedMeanwhile(requestId);
}

/** "Mark as manually sent" (manual email mode): the owner's own record; it changes nothing the customer needs. */
async function postMarkSent(request: Request, ctx: Context, requestId: string): Promise<Response> {
  const fields = await readForm(request, ctx, approveFields);
  if (fields instanceof Response) return fields;
  if (!ctx.manual) return notFound();
  const found = await getRequest(ctx.db, requestId);
  if (!found?.quote) return notFound();
  const version = versionOf(fields.version!);
  if (version === null) return refuse(400, 'E_BODY_SHAPE');
  const action: OwnerAction = 'mark_sent';
  const used = await verifiedToken(ctx, fields.form_token!, { owner: ctx.owner, action, target: found.quote.id, version });
  if (!used) {
    log('owner_refused', { route: 'owner', status: 403, code: 'E_FORM_TOKEN', action });
    return expiredForm(requestId);
  }
  const outcome = await markInvitationSent(ctx.db, { quoteId: found.quote.id, version, use: { ...used, owner: ctx.owner, now: ctx.now } });
  log(outcome === 'done' ? 'owner_changed' : 'owner_refused', { route: 'owner', action, status: outcome === 'done' ? 303 : 409 });
  return outcome === 'done' ? seeOther(`/requests/${requestId}`) : changedMeanwhile(requestId);
}

const lifecycleAction: Record<Lifecycle, OwnerAction> = { revoke: 'revoke', 'new-link': 'replace', dismiss: 'dismiss', delete: 'delete' };

/** What a lifecycle form token is bound to: the quotation and its version, or the request. */
function lifecycleBinding(kind: Lifecycle, owner: string, request: RequestRow, quote: QuoteRow | null, version: number): FormTokenBinding | null {
  const action = lifecycleAction[kind];
  if (kind === 'revoke' || kind === 'new-link') return quote ? { owner, action, target: quote.id, version } : null;
  return { owner, action, target: request.id, version };
}
const shownVersion = (kind: Lifecycle, quote: QuoteRow | null) => (kind === 'dismiss' ? 0 : (quote?.version ?? 0));

async function postLifecycle(request: Request, ctx: Context, requestId: string, kind: Lifecycle): Promise<Response> {
  const fields = await readForm(request, ctx, approveFields);
  if (fields instanceof Response) return fields;
  const found = await getRequest(ctx.db, requestId);
  if (!found) return notFound();
  const version = versionOf(fields.version!);
  if (version === null) return refuse(400, 'E_BODY_SHAPE');
  const action = lifecycleAction[kind];
  const binding = lifecycleBinding(kind, ctx.owner, found.request, found.quote, version);
  const used = binding ? await verifiedToken(ctx, fields.form_token!, binding) : null;
  if (!used) {
    log('owner_refused', { route: 'owner', status: 403, code: 'E_FORM_TOKEN', action });
    return expiredForm(requestId);
  }
  const use = { ...used, owner: ctx.owner, now: ctx.now };
  let outcome: 'done' | 'stale' | 'sending';
  if (kind === 'revoke') outcome = await revokeQuote(ctx.db, { quoteId: found.quote!.id, version, use });
  else if (kind === 'new-link') {
    const linkKey = await currentLinkKey(ctx.env as Record<string, unknown>);
    if (!linkKey) throw new Error('E_LINK_KEY');
    const linkGeneration = found.quote!.link_generation + 1;
    outcome = await replaceLink(ctx.db, {
      quoteId: found.quote!.id,
      version,
      linkKeyVersion: linkKey.version,
      linkGeneration,
      tokenHash: await sha256Hex(await quoteLinkToken(linkKey, found.quote!.id, linkGeneration)),
      use,
      queueEmail: !ctx.manual,
    });
  } else if (kind === 'dismiss') outcome = await dismissRequest(ctx.db, { requestId, use });
  else outcome = await deleteRequest(ctx.db, { requestId, version, use });
  log(outcome === 'done' ? 'owner_changed' : 'owner_refused', { route: 'owner', action, status: outcome === 'done' ? 303 : 409 });
  if (outcome === 'sending') {
    return messagePage(409, 'Nothing was deleted', 'An email for this request is being sent right now. Try again in about two minutes.', { href: `/requests/${requestId}`, label: 'Open the request' });
  }
  if (outcome === 'stale') return changedMeanwhile(requestId);
  return seeOther(kind === 'delete' ? '/' : `/requests/${requestId}`);
}

async function route(request: Request, ctx: Context): Promise<Response> {
  const { pathname } = new URL(request.url);
  const read = request.method === 'GET' || request.method === 'HEAD';
  const post = request.method === 'POST';
  let match: RegExpExecArray | null;

  if (routes.list.test(pathname)) return read ? listPage(await listRequests(ctx.db), await ownerEmailProblems(ctx.db), ctx.manual) : methodNotAllowed('GET, HEAD');
  if (routes.script.test(pathname)) {
    if (!read) return methodNotAllowed('GET, HEAD');
    return new Response(OWNER_SCRIPT, {
      headers: { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': REFERRER_POLICY },
    });
  }
  if ((match = routes.detail.exec(pathname))) {
    if (!read) return methodNotAllowed('GET, HEAD');
    const found = await getRequest(ctx.db, match[1]!);
    if (!found) return notFound();
    const invitation = ctx.manual && found.quote ? await invitationFor(ctx, found.request, found.quote) : null;
    return detailPage(200, found.request, found.quote, found.jobs, await draftFormFor(ctx, found.request, found.quote), ctx.now, { manual: ctx.manual, invitation });
  }
  if ((match = routes.confirm.exec(pathname))) {
    if (!read) return methodNotAllowed('GET, HEAD');
    const found = await getRequest(ctx.db, match[1]!);
    if (!found) return notFound();
    if (!found.quote || found.quote.status !== 'draft') return seeOther(`/requests/${found.request.id}`);
    const token = await issueFormToken(ctx.formKey, { owner: ctx.owner, action: 'approve', target: found.quote.id, version: found.quote.version }, ctx.now);
    return confirmPage(found.request, found.quote, token, ctx.now, ctx.manual);
  }
  if ((match = routes.draft.exec(pathname))) return post ? postDraft(request, ctx, match[1]!) : methodNotAllowed('POST');
  if ((match = routes.approve.exec(pathname))) return post ? postApprove(request, ctx, match[1]!) : methodNotAllowed('POST');
  if ((match = routes.lifecycle.exec(pathname))) {
    const kind = match[2] as Lifecycle;
    if (post) return postLifecycle(request, ctx, match[1]!, kind);
    if (!read) return methodNotAllowed('GET, HEAD, POST');
    const found = await getRequest(ctx.db, match[1]!);
    if (!found) return notFound();
    if (!lifecycleAllowed(kind, found.request, found.quote, ctx.now)) return seeOther(`/requests/${found.request.id}`);
    const version = shownVersion(kind, found.quote);
    const binding = lifecycleBinding(kind, ctx.owner, found.request, found.quote, version)!;
    const token = await issueFormToken(ctx.formKey, binding, ctx.now);
    const inFlight = kind === 'delete' && (await sendInProgress(ctx.db, found.request.id, ctx.now));
    return lifecycleConfirmPage(kind, found.request, found.quote, token, version, { sendInFlight: inFlight, manual: ctx.manual });
  }
  if ((match = routes.resend.exec(pathname))) {
    if (post) return postResend(request, ctx, match[1]!);
    if (!read) return methodNotAllowed('GET, HEAD, POST');
    const found = await getRequest(ctx.db, match[1]!);
    if (!found) return notFound();
    const job = found.quote && !ctx.manual ? resendable(found.quote, found.jobs, ctx.now) : null;
    if (!found.quote || !job) return seeOther(`/requests/${found.request.id}`);
    const token = await issueFormToken(ctx.formKey, { owner: ctx.owner, action: 'resend', target: job.id, version: found.quote.version }, ctx.now);
    return resendConfirmPage(found.request, found.quote, job, found.jobs, token);
  }
  if ((match = routes.markSent.exec(pathname))) {
    if (post) return postMarkSent(request, ctx, match[1]!);
    if (!read) return methodNotAllowed('GET, HEAD, POST');
    const found = await getRequest(ctx.db, match[1]!);
    if (!found) return notFound();
    if (!ctx.manual || !found.quote || !markSentAllowed(found.quote, ctx.now)) return seeOther(`/requests/${found.request.id}`);
    const token = await issueFormToken(ctx.formKey, { owner: ctx.owner, action: 'mark_sent', target: found.quote.id, version: found.quote.version }, ctx.now);
    return markSentConfirmPage(found.request, found.quote, token);
  }
  return notFound();
}

/**
 * The owner Worker's required configuration, shared by the pages and the scheduled email run:
 * the origin first (no key or D1 use when it is unacceptable), then the workflow switch, D1, the
 * owner email, Access settings, the form key and the current link key. Reads no data.
 */
export async function ownerConfigured(env: OwnerEnv, originAllowed: OwnerOriginCheck = validOwnerOrigin): Promise<boolean> {
  return (
    originAllowed(env.OWNER_ORIGIN) &&
    env.WORKFLOW_ENABLED === 'on' &&
    !!env.DB &&
    !!env.OWNER_EMAIL &&
    validTeamDomain(env.ACCESS_TEAM_DOMAIN) &&
    !!env.ACCESS_AUD &&
    !!(await importHmacKey(env.OWNER_FORM_KEY)) &&
    !!(await currentLinkKey(env as Record<string, unknown>))
  );
}

/**
 * Handles one owner request. `keys` supplies Access's signing keys: the deployed entry
 * (index.ts) always passes the team domain's published certs; tests pass local keys.
 */
export async function handleOwner(
  request: Request,
  env: OwnerEnv,
  keys: AccessKeySource,
  now = Date.now(),
  originAllowed: OwnerOriginCheck = validOwnerOrigin,
): Promise<Response> {
  try {
    // The origin is checked first: an unacceptable value gets 503 before any key, Access or D1 use.
    if (!(await ownerConfigured(env, originAllowed))) {
      log('unavailable', { route: 'owner', status: 503 });
      return messagePage(503, 'Owner pages unavailable', 'The owner pages are switched off or not configured.');
    }
    const owner = await verifyAccessJwt(
      request.headers.get('Cf-Access-Jwt-Assertion'),
      { teamDomain: env.ACCESS_TEAM_DOMAIN!, audience: env.ACCESS_AUD!, ownerEmail: env.OWNER_EMAIL! },
      keys,
      now,
    );
    if (!owner) {
      log('owner_denied', { route: 'owner', status: 404 });
      return notFound();
    }
    return await route(request, { db: env.DB!, owner, formKey: (await importHmacKey(env.OWNER_FORM_KEY))!, env, now, manual: manualEmailMode(env), originAllowed });
  } catch {
    log('error', { route: 'owner', code: 'E_OWNER' });
    return messagePage(500, 'Something went wrong', 'Nothing was changed by this request unless the request page shows otherwise. Try again.', { href: '/', label: 'Open the request list' });
  }
}
