// Server-rendered owner pages (docs/PROPOSAL_QUOTATION_WORKFLOW.md §2.1, §16): native forms and no
// external resources. Every interpolated value goes through escapeHtml. One same-origin script
// (/owner.js, served by the owner Worker behind Access) only adds the copy buttons of the manual
// invitation; everything works without it.

import { plans } from '../../src/config/pricing.ts';
import { customerRoutes } from '../../src/config/quotation.ts';
import { services } from '../../src/config/services.ts';
import { escapeHtml } from '../../src/lib/quotation/escape.ts';
import { formatAmount, quoteLimits, type QuoteErrors } from '../../src/lib/quotation/owner-form.ts';
import type { Invitation } from '../../src/lib/quotation/invitation.ts';
import type { JobRow, ListRow, QuoteRow, RequestRow } from './store.ts';
import { LIST_LIMIT } from './store.ts';

// Referrer-Policy is same-origin, not no-referrer: under no-referrer, Chromium sent `Origin: null`
// on these pages' native form submissions (observed in the local owner tests), and every owner POST
// must carry the exact owner Origin (§16). same-origin still sends no referrer to any other site.
export const REFERRER_POLICY = 'same-origin';
const headers: Record<string, string> = {
  'Cache-Control': 'no-store',
  'Referrer-Policy': REFERRER_POLICY,
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-Robots-Tag': 'noindex',
  'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  'Content-Type': 'text/html; charset=utf-8',
};

const e = escapeHtml;
const DAY_MS = 24 * 60 * 60 * 1000;
const when = (ms: number) => `${new Date(ms).toISOString().slice(0, 16).replace('T', ' ')} UTC`;
const planName = (id: string) => plans.find((plan) => plan.id === id)?.name ?? (id || 'Not selected');
const serviceName = (id: string) => services.find((service) => service.id === id)?.name ?? (id || 'Not selected');

export function ownerPage(status: number, title: string, body: string, extra: Record<string, string> = {}): Response {
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${e(title)} | BuildTrack owner</title>
<style>
  body { margin: 0; font: 1rem/1.6 system-ui, sans-serif; color: #14213d; background: #f5f7fa; }
  header { background: #14213d; color: #fff; padding: 0.75rem 1rem; }
  header a { color: #fff; }
  main { max-width: 52rem; margin: 0 auto; padding: 1.5rem 1rem 3rem; }
  h1 { font-size: 1.6rem; line-height: 1.2; }
  a { color: #0b4f9c; font-weight: 600; }
  a:focus-visible, button:focus-visible, input:focus-visible, textarea:focus-visible { outline: 3px solid #f5b400; outline-offset: 2px; }
  .notice { border-left: 4px solid #f5b400; background: #fff8e1; padding: 0.75rem 1rem; }
  .errors { border-left: 4px solid #b3261e; background: #fdecea; padding: 0.75rem 1rem; }
  .table-wrap { overflow-x: auto; }
  table { border-collapse: collapse; width: 100%; background: #fff; }
  th, td { text-align: left; padding: 0.5rem; border-bottom: 1px solid #d6dbe3; vertical-align: top; }
  dl { display: grid; grid-template-columns: minmax(8rem, 14rem) 1fr; gap: 0.25rem 1rem; background: #fff; padding: 1rem; }
  dt { font-weight: 600; }
  dd { margin: 0; overflow-wrap: anywhere; }
  .text { white-space: pre-wrap; }
  label { display: block; font-weight: 600; margin-top: 1rem; }
  .hint { color: #4a5568; font-size: 0.9rem; margin: 0.25rem 0; }
  .field-error { color: #b3261e; font-weight: 600; margin: 0.25rem 0; }
  textarea, input { font: inherit; padding: 0.5rem; border: 1px solid #7a8699; border-radius: 4px; max-width: 100%; box-sizing: border-box; }
  textarea { width: 100%; min-height: 10rem; }
  button { font: inherit; font-weight: 700; padding: 0.6rem 1.2rem; border: 0; border-radius: 4px; background: #14213d; color: #fff; cursor: pointer; margin-top: 1rem; }
  .actions { display: flex; flex-wrap: wrap; gap: 1rem; align-items: center; }
  .actions button { margin-top: 0; }
  .button-link { display: inline-block; font-weight: 700; padding: 0.6rem 1.2rem; border-radius: 4px; background: #14213d; color: #fff; text-decoration: none; }
  .invitation { background: #fff; border: 1px solid #d6dbe3; border-radius: 6px; padding: 1rem; }
  .invitation input { width: 100%; }
  .ok { border-left: 4px solid #1b6e3c; background: #e8f5ec; padding: 0.75rem 1rem; }
  @media (max-width: 40rem) { dl { grid-template-columns: 1fr; } dt { margin-top: 0.5rem; } }
</style>
</head>
<body>
<header><a href="/">BuildTrack owner: quotation requests</a></header>
<main>
${body}
</main>
<script src="/owner.js" defer></script>
</body>
</html>`;
  return new Response(html, { status, headers: { ...headers, ...extra } });
}

export const notFound = () => ownerPage(404, 'Not found', '<h1>Not found</h1>');

export function messagePage(status: number, title: string, text: string, link?: { href: string; label: string }): Response {
  return ownerPage(status, title, `<h1>${e(title)}</h1><p>${e(text)}</p>${link ? `<p><a href="${e(link.href)}">${e(link.label)}</a></p>` : ''}`);
}

const statusLabel = (row: { status: string; quote_status: string | null; quote_ref: string | null }) =>
  row.quote_status ? `Quotation ${row.quote_ref}: ${row.quote_status}` : row.status === 'received' ? 'Received, no quotation yet' : row.status;

export function listPage(rows: ListRow[], ownerEmailProblems = 0, manual = false): Response {
  const body = rows.length
    ? `<div class="table-wrap"><table>
<caption class="hint">Newest first${rows.length === LIST_LIMIT ? `; showing the newest ${LIST_LIMIT}` : ''}.</caption>
<thead><tr><th scope="col">Reference</th><th scope="col">Received</th><th scope="col">Name</th><th scope="col">Organization</th><th scope="col">Plan</th><th scope="col">Status</th></tr></thead>
<tbody>
${rows
  .map(
    (row) =>
      `<tr><td><a href="/requests/${e(row.id)}">${e(row.ref)}</a></td><td>${e(when(row.created_at))}</td><td>${e(row.name)}</td><td>${e(row.organization)}</td><td>${e(planName(row.plan))}</td><td>${e(statusLabel(row))}${row.flagged ? ' (owner notification skipped: daily cap)' : ''}</td></tr>`,
  )
  .join('\n')}
</tbody></table></div>`
    : '<p>No quotation requests yet.</p>';
  const problems = ownerEmailProblems
    ? `<p class="notice">${ownerEmailProblems} owner notification or cap-warning email${ownerEmailProblems === 1 ? '' : 's'} could not be sent automatically. New requests are still listed here.</p>\n`
    : '';
  const inbox = manual
    ? '<p class="notice">This page is the request inbox: check it for new requests. BuildTrack sends no notification emails in this release, and no email is sent to customers automatically.</p>\n'
    : '';
  return ownerPage(200, 'Quotation requests', `<h1>Quotation requests</h1>\n${inbox}${problems}${body}`);
}

function requestDetails(request: RequestRow): string {
  const rows: [string, string][] = [
    ['Reference', request.ref],
    ['Received', when(request.created_at)],
    ['Sent from', request.source === 'js' ? 'Quotation form' : 'Quotation form without JavaScript'],
    ['Name', request.name],
    ['Email', request.email],
    ['Organization', request.organization],
    ['Phone', request.phone || 'Not given'],
    ['Organization type', request.organization_type],
    ['Service', serviceName(request.service)],
    ['Plan', planName(request.plan)],
    ['Project need', request.project_need],
    ['Message', request.message || 'None'],
  ];
  return `<h2>Request</h2>
<dl>
${rows.map(([label, value]) => `<dt>${e(label)}</dt><dd class="text">${e(value)}</dd>`).join('\n')}
</dl>
${request.flagged ? '<p class="notice">This request arrived after the daily owner-notification cap, so no notification was queued for it.</p>' : ''}`;
}

export interface DraftForm {
  token: string;
  version: number;
  scope: string;
  amount: string;
  validity: string;
  errors: QuoteErrors;
  /** Explains where a prefilled amount came from. */
  prefillNote: string | null;
}

const fieldLabels: Record<keyof QuoteErrors, string> = { scope: 'Scope', amount: 'Amount', validity_days: 'Validity' };

function draftForm(request: RequestRow, quote: QuoteRow | null, form: DraftForm): string {
  const errors = Object.entries(form.errors) as [keyof QuoteErrors, string][];
  const described = (field: keyof QuoteErrors, hint: string) =>
    `aria-describedby="${hint}${form.errors[field] ? ` ${field}-error` : ''}"${form.errors[field] ? ' aria-invalid="true"' : ''}`;
  const fieldError = (field: keyof QuoteErrors) => (form.errors[field] ? `<p class="field-error" id="${field}-error">${e(form.errors[field]!)}</p>` : '');
  return `<h2>${quote ? `Draft quotation ${e(quote.ref)}` : 'Prepare a quotation'}</h2>
${
  errors.length
    ? `<div class="errors" role="alert"><p><strong>Nothing was saved. Fix the following:</strong></p><ul>${errors
        .map(([field, message]) => `<li><a href="#${field}">${e(fieldLabels[field])}: ${e(message)}</a></li>`)
        .join('')}</ul></div>`
    : ''
}
<form method="post" action="/requests/${e(request.id)}/draft">
<input type="hidden" name="form_token" value="${e(form.token)}">
<input type="hidden" name="version" value="${form.version}">
<label for="scope">Scope</label>
<p class="hint" id="scope-hint">What the quotation covers, as the customer will read it (${quoteLimits.scopeMin} to ${quoteLimits.scopeMax} characters).</p>
${fieldError('scope')}
<textarea id="scope" name="scope" required maxlength="${quoteLimits.scopeMax}" ${described('scope', 'scope-hint')}>${e(form.scope)}</textarea>
<label for="amount">Amount (PHP)</label>
<p class="hint" id="amount-hint">Pesos, for example 7990 or 7,990.50; from ₱1 to ₱10,000,000.${form.prefillNote ? ` ${e(form.prefillNote)}` : ''}</p>
${fieldError('amount')}
<input id="amount" name="amount" required inputmode="decimal" value="${e(form.amount)}" ${described('amount', 'amount-hint')}>
<label for="validity_days">Validity (days)</label>
<p class="hint" id="validity_days-hint">How long the customer's link works after approval: ${quoteLimits.validityMin} to ${quoteLimits.validityMax} days.</p>
${fieldError('validity_days')}
<input id="validity_days" name="validity_days" required inputmode="numeric" value="${e(form.validity)}" ${described('validity_days', 'validity_days-hint')}>
<div class="actions"><button type="submit">Save draft and review</button>${
    quote && !errors.length ? `<a href="/requests/${e(request.id)}/confirm">Review and approve the saved draft</a>` : ''
  }</div>
</form>
<p class="hint">Saving changes nothing for the customer. Nothing is approved or emailed until you confirm on the next page.</p>`;
}

/** What the owner can rely on for a job; "accepted" is never presented as delivered. */
export function jobLabel(job: JobRow, now = Date.now()): string {
  const tries = `${job.attempts} attempt${job.attempts === 1 ? '' : 's'}`;
  switch (job.status) {
    case 'queued':
      return 'Waiting to be sent.';
    case 'sending':
      // A lease that has expired belongs to a runner that stopped; nothing is being sent now.
      if (job.lease_until !== null && job.lease_until <= now)
        return job.ambiguous
          ? `Stopped (${tries}). An earlier attempt may already have reached the email provider; the outcome is unknown.`
          : `Stopped (${tries}): the last attempt did not finish and may or may not have reached the email provider. It is closed at the next scheduled run.`;
      return `Being sent now (${tries}).`;
    case 'retry_wait':
      return job.ambiguous
        ? `Retrying automatically (${tries}). An earlier attempt may already have reached the email provider; retries reuse the same key, so the provider should not send it twice.`
        : `Retrying automatically (${tries}); the email provider has not accepted it yet.`;
    case 'provider_accepted':
      return 'Accepted by the email provider. This does not confirm that it reached the inbox.';
    case 'needs_owner':
      return job.ambiguous
        ? `Outcome unknown (${tries}): the email provider may have accepted it. Check the provider's dashboard before sending again.`
        : `Not sent (${tries}; ${notSentReason(job.last_result)}).`;
    case 'cancelled':
      // Cancelling stops further attempts only; an earlier attempt's unknown outcome stays unknown.
      return job.ambiguous
        ? `Further attempts cancelled (${tries}). An earlier attempt may already have reached the email provider; whether it was sent is unknown.`
        : 'Cancelled; not sent.';
  }
}

function notSentReason(code: string | null): string {
  if (code === 'E_WINDOW_CLOSED') return 'automatic retries stopped';
  if (code === 'E_PAYLOAD_CHANGED') return 'its content would have changed';
  if (code === 'E_IDEMPOTENCY_CONFLICT' || code?.startsWith('E_REJECTED')) return 'the email provider refused it';
  return 'it needs your attention';
}

/**
 * Whether the customer may already hold a copy: any earlier attempt for this quotation, under any
 * key, may have reached the provider (ambiguous). Used for the resend warning; authorization
 * stays bound to the latest job and the quotation version.
 */
export const duplicateRisk = (jobs: JobRow[]) => jobs.some((job) => job.ambiguous === 1);

/** One overall statement for the quotation email, consistent with the per-job labels. */
export function emailSummary(jobs: JobRow[]): string {
  if (jobs.some((job) => job.status === 'provider_accepted'))
    return 'The email provider accepted the quotation email. That does not confirm that it reached the customer’s inbox.';
  if (duplicateRisk(jobs))
    return 'Unknown whether the customer received the quotation email: an attempt may have reached the email provider. Check the provider’s dashboard.';
  if (jobs.some((job) => job.attempts > 0)) return 'Not sent: the email provider has not accepted the quotation email.';
  return `No email has been sent yet: the quotation email is waiting in the queue.${
    customerRoutes.ready ? '' : ' Quotation emails are held until the customer quotation page is ready.'
  }`;
}

/** The latest quotation job, if the owner may confirm a resend of it. */
export function resendable(quote: QuoteRow, jobs: JobRow[], now: number): JobRow | null {
  const latest = jobs[jobs.length - 1];
  return latest && latest.status === 'needs_owner' && quote.status === 'approved' && (quote.expires_at ?? 0) > now ? latest : null;
}

/**
 * The email section: the main statement and job list describe the CURRENT link generation only.
 * Emails for earlier generations (replaced links) are listed separately as history: an older link's
 * acceptance says nothing about whether the current link reached the customer.
 */
/** What the owner page shows about email for an approved quotation in manual mode. */
export type InvitationView = { kind: 'ready'; invitation: Invitation } | { kind: 'unavailable'; reason: string };

/** Whether "Mark as manually sent" applies now (the POST checks the same again in its batch). */
export const markSentAllowed = (quote: QuoteRow, now: number) =>
  !!quote.token_hash &&
  (quote.expires_at ?? 0) > now &&
  ['approved', 'emailed', 'accepted', 'declined'].includes(quote.status) &&
  quote.manual_sent_generation !== quote.link_generation;

function manualInvitation(quote: QuoteRow, view: InvitationView | null, requestId: string, now: number): string {
  const marked =
    quote.manual_sent_at !== null && quote.manual_sent_generation === quote.link_generation
      ? `<p class="ok">Marked sent by owner on ${e(when(quote.manual_sent_at))}. This is your own record: it does not confirm that the email was delivered or read.</p>`
      : '<p>Not marked as sent. After you send the invitation from your email application, you can record that here (optional; the customer’s link works either way).</p>';
  if (!view || view.kind === 'unavailable') {
    return `<h3>Customer invitation</h3>\n<p class="notice">${e(view?.reason ?? 'No invitation can be prepared for this quotation.')}</p>`;
  }
  const inv = view.invitation;
  return `<h3>Customer invitation (you send it)</h3>
<p class="notice"><strong>BuildTrack does not send this email.</strong> Prepare it, review it, and press Send in your own email application (for example Gmail). Opening or copying it does not send or deliver anything.</p>
${marked}
<div class="invitation">
<div class="actions">
<a class="button-link" href="${e(inv.mailto)}">Prepare email</a>
<button type="button" data-copy="invitation-text" data-copied="Email text copied. Paste it into a new email to ${e(inv.to)}, review it, and press Send there. Nothing has been sent." hidden>Copy email text</button>
<button type="button" data-copy="invitation-link" data-copied="Quotation link copied. Nothing has been sent." hidden>Copy quotation link</button>
</div>
<p class="hint">“Prepare email” opens a new message in your email application with everything filled in. If it does not open, copy the text instead.</p>
<p class="hint" id="copy-status" role="status" aria-live="polite"></p>
<label for="invitation-to">To</label>
<input id="invitation-to" type="text" readonly value="${e(inv.to)}">
<label for="invitation-subject">Subject</label>
<input id="invitation-subject" type="text" readonly value="${e(inv.subject)}">
<label for="invitation-text">Email text</label>
<textarea id="invitation-text" readonly rows="14">${e(inv.text)}</textarea>
<label for="invitation-link">Quotation link (the customer’s private link; share it only with this customer)</label>
<input id="invitation-link" type="text" readonly value="${e(inv.link)}">
</div>
${markSentAllowed(quote, now) ? `<p><a href="/requests/${e(requestId)}/mark-sent">Mark as manually sent…</a></p>` : ''}`;
}

function approvedSummary(quote: QuoteRow, jobs: JobRow[], requestId: string, now: number, manual = false, invitation: InvitationView | null = null): string {
  if (manual) {
    return `<h2>Quotation ${e(quote.ref)}: ${e(quote.status)}</h2>
<dl>
<dt>Recipient</dt><dd>${e(quote.snap_name ?? '')} &lt;${e(quote.snap_email ?? '')}&gt;</dd>
<dt>Scope</dt><dd class="text">${e(quote.snap_scope ?? '')}</dd>
<dt>Amount</dt><dd>${e(formatAmount(quote.snap_amount_centavos ?? 0))}</dd>
<dt>Approved</dt><dd>${e(when(quote.approved_at ?? 0))} by ${e(quote.approved_by ?? '')}</dd>
<dt>Link expires</dt><dd>${e(when(quote.expires_at ?? 0))} (${quote.snap_validity_days} days after approval)</dd>
</dl>
${manualInvitation(quote, invitation, requestId, now)}${
      jobs.length
        ? `
<h3>Automatic email records (history)</h3>
<p class="hint">Recorded before manual email mode; kept as history. None of these will be sent.</p>
<ul>${jobs.map((job) => `<li>Link ${job.link_generation}, ${job.resend_seq ? `resend ${job.resend_seq}` : 'first send'}: ${e(jobLabel(job, now))}</li>`).join('')}</ul>`
        : ''
    }`;
  }
  return automaticEmailSummary(quote, jobs, requestId, now);
}

function automaticEmailSummary(quote: QuoteRow, jobs: JobRow[], requestId: string, now: number): string {
  const current = jobs.filter((job) => job.link_generation === quote.link_generation);
  const earlier = jobs.filter((job) => job.link_generation !== quote.link_generation);
  const item = (job: JobRow, prefix = '') =>
    `<li>${prefix}${job.resend_seq ? `Resend ${job.resend_seq}` : 'First send'}, queued ${e(when(job.created_at))}: ${e(jobLabel(job, now))}${
      job.last_result && job.status !== 'provider_accepted' ? ` <span class="hint">(${e(job.last_result)})</span>` : ''
    }</li>`;
  return `<h2>Quotation ${e(quote.ref)}: ${e(quote.status)}</h2>
<dl>
<dt>Recipient</dt><dd>${e(quote.snap_name ?? '')} &lt;${e(quote.snap_email ?? '')}&gt;</dd>
<dt>Scope</dt><dd class="text">${e(quote.snap_scope ?? '')}</dd>
<dt>Amount</dt><dd>${e(formatAmount(quote.snap_amount_centavos ?? 0))}</dd>
<dt>Approved</dt><dd>${e(when(quote.approved_at ?? 0))} by ${e(quote.approved_by ?? '')}</dd>
<dt>Link expires</dt><dd>${e(when(quote.expires_at ?? 0))} (${quote.snap_validity_days} days after approval)</dd>
</dl>
<h3>Quotation email${earlier.length ? ' (current link)' : ''}</h3>
<ul>${current.map((job) => item(job)).join('')}</ul>
<p class="notice">${e(emailSummary(current))}</p>
${resendable(quote, jobs, now) ? `<p><a href="/requests/${e(requestId)}/resend">Send the quotation email again…</a></p>` : ''}${
    earlier.length
      ? `
<h3>Earlier links (history)</h3>
<p class="hint">These emails carried a link that has since been replaced and no longer works. They say nothing about the current link's email.</p>
<ul>${earlier.map((job) => item(job, `Link ${job.link_generation}, `)).join('')}</ul>`
      : ''
  }`;
}

export function detailPage(
  status: number,
  request: RequestRow,
  quote: QuoteRow | null,
  jobs: JobRow[],
  form: DraftForm | null,
  now = Date.now(),
  mode: { manual: boolean; invitation: InvitationView | null } = { manual: false, invitation: null },
): Response {
  const title = `Request ${request.ref}`;
  const quotation =
    quote && quote.status !== 'draft' ? approvedSummary(quote, jobs, request.id, now, mode.manual, mode.invitation) : form ? draftForm(request, quote, form) : '';
  return ownerPage(status, title, `<p><a href="/">All requests</a></p>\n<h1>${e(title)}</h1>\n${quotation}\n${requestDetails(request)}\n${lifecycleLinks(request, quote, now, mode.manual)}`);
}

// ---- Lifecycle actions (local completion; §5, §17) -------------------------------------------
export type Lifecycle = 'revoke' | 'new-link' | 'dismiss' | 'delete';

/** Which lifecycle actions apply now (the confirmation pages and POSTs check the same again). */
export function lifecycleAllowed(kind: Lifecycle, request: RequestRow, quote: QuoteRow | null, now: number): boolean {
  switch (kind) {
    case 'revoke':
      return !!quote && (quote.status === 'approved' || quote.status === 'emailed');
    case 'new-link':
      return !!quote && ['approved', 'emailed', 'revoked'].includes(quote.status) && (quote.expires_at ?? 0) > now;
    case 'dismiss':
      return !quote && request.status === 'received';
    case 'delete':
      return true;
  }
}

const lifecycleLabels: Record<Lifecycle, string> = {
  revoke: 'Revoke the customer’s link…',
  'new-link': 'Create a new link and send again…',
  dismiss: 'Dismiss this request…',
  delete: 'Delete this request and everything stored for it…',
};

const manualLifecycleLabels: Record<Lifecycle, string> = { ...lifecycleLabels, 'new-link': 'Create a new link (then send a fresh invitation)…' };

function lifecycleLinks(request: RequestRow, quote: QuoteRow | null, now: number, manual = false): string {
  const kinds = (['revoke', 'new-link', 'dismiss', 'delete'] as const).filter((kind) => lifecycleAllowed(kind, request, quote, now));
  const labels = manual ? manualLifecycleLabels : lifecycleLabels;
  return `<h2>Other actions</h2>
<ul>${kinds.map((kind) => `<li><a href="/requests/${e(request.id)}/${kind}">${e(labels[kind])}</a></li>`).join('')}</ul>`;
}

/** The explicit confirmation for a lifecycle action: what it affects, what it cannot undo. */
export function lifecycleConfirmPage(
  kind: Lifecycle,
  request: RequestRow,
  quote: QuoteRow | null,
  token: string,
  version: number,
  options: { sendInFlight?: boolean; manual?: boolean } = {},
): Response {
  const quoteLine = quote
    ? `<dt>Quotation</dt><dd>${e(quote.ref)} (${e(quote.status)})${quote.snap_amount_centavos !== null ? `, ${e(formatAmount(quote.snap_amount_centavos))}` : ''}</dd>
<dt>Recipient</dt><dd>${e(quote.snap_name ?? request.name)} &lt;${e(quote.snap_email ?? request.email)}&gt;</dd>
${quote.expires_at ? `<dt>Link valid until</dt><dd>${e(when(quote.expires_at))}</dd>` : ''}`
    : '<dt>Quotation</dt><dd>None</dd>';
  const details = `<dl>
<dt>Request</dt><dd>${e(request.ref)}, received ${e(when(request.created_at))}</dd>
${quoteLine}
</dl>`;
  const content: Record<Lifecycle, { title: string; body: string; button: string }> = {
    revoke: {
      title: `Revoke the customer’s link for ${quote?.ref ?? ''}?`,
      body: `<ul>
<li>Every link for this quotation stops working at once; the customer sees that BuildTrack withdrew it.</li>
<li>Quotation emails not yet handed to the email provider are cancelled.</li>
<li>An email already sent, or being sent at this moment, cannot be recalled. Its link will not work.</li>
<li>You can later create a new link (before the quotation expires) to send it again.</li>
</ul>`,
      button: 'Revoke link',
    },
    'new-link': {
      title: `Send ${quote?.ref ?? ''} again with a new link?`,
      body: `<ul>
<li>The approved scope, amount and expiry stay exactly as approved; only the link is new.</li>
<li>Older links stop working (the customer is told a newer link was sent); unsent emails with older links are cancelled.</li>
<li>One new quotation email is queued. If an earlier email already reached the customer, they will have two emails; only the newest link works.</li>
</ul>`,
      button: 'Create new link and queue email',
    },
    dismiss: {
      title: `Dismiss request ${request.ref}?`,
      body: `<ul>
<li>The request is marked dismissed; no quotation can be prepared for it.</li>
<li>Nothing is emailed. It is kept until the 90-day retention deletes it, or until you delete it.</li>
</ul>`,
      button: 'Dismiss request',
    },
    delete: {
      title: `Delete request ${request.ref} and everything stored for it?`,
      body: `<p>Deleted now, permanently, by BuildTrack: the request, its quotation, customer links, simulated checkout results, events, email jobs and their attempt history. Unsent emails will never be sent. Customer links stop working.</p>
<p><strong>Not deleted by this, because BuildTrack does not control it:</strong> emails already sent (in the recipients’ mailboxes and in the email provider’s records, kept for the period the provider sets) and the database’s automatic point-in-time recovery copies (kept by Cloudflare for up to 7 days on the free plan).</p>`,
      button: 'Delete permanently',
    },
  };
  if (options.manual) {
    content.revoke.body = `<ul>
<li>Every link for this quotation stops working at once; the customer sees that BuildTrack withdrew it.</li>
<li>BuildTrack cannot recall an invitation you already sent from your email account. Its link will not work.</li>
<li>You can later create a new link (before the quotation expires) and send a fresh invitation.</li>
</ul>`;
    content['new-link'] = {
      title: `Create a new link for ${quote?.ref ?? ''}?`,
      body: `<ul>
<li>The approved scope, amount and expiry stay exactly as approved; only the link is new.</li>
<li>Older links stop working at once (the customer is told a newer link was sent).</li>
<li>BuildTrack sends nothing: afterwards, prepare the new invitation on the request page and send it from your email application. Earlier invitations you sent still arrive, but their links no longer work.</li>
</ul>`,
      button: 'Create new link',
    };
    content.delete.body = `<p>Deleted now, permanently, by BuildTrack: the request, its quotation, customer links, simulated checkout results, events and any email records. Customer links stop working.</p>
<p><strong>Not deleted by this, because BuildTrack does not control it:</strong> invitations you sent from your own email account (in your Sent folder and the customer’s mailbox) and the database’s automatic point-in-time recovery copies (kept by Cloudflare for up to 7 days on the free plan).</p>`;
  }
  const c = content[kind];
  const form = options.sendInFlight
    ? `<p class="errors">An email for this request is being sent right now. Nothing can be deleted until that attempt finishes. Try again in about two minutes.</p>
<p><a href="/requests/${e(request.id)}">Go back</a></p>`
    : `<form method="post" action="/requests/${e(request.id)}/${kind}">
<input type="hidden" name="form_token" value="${e(token)}">
<input type="hidden" name="version" value="${version}">
<div class="actions"><button type="submit">${e(c.button)}</button><a href="/requests/${e(request.id)}">Cancel and go back</a></div>
</form>`;
  return ownerPage(200, c.title, `<h1>${e(c.title)}</h1>\n${details}\n${c.body}\n${form}`);
}

export function confirmPage(request: RequestRow, quote: QuoteRow, token: string, now: number, manual = false): Response {
  const intro = manual
    ? 'Check every detail. Approving freezes exactly what is shown here and creates the customer’s private link. BuildTrack sends no email: afterwards you prepare the invitation on the request page and send it from your own email application.'
    : 'Check every detail. Approving freezes exactly what is shown here and queues one quotation email to this recipient.';
  const notice = manual
    ? 'BuildTrack is an academic project; the quotation asks for no payment.'
    : 'In this build no email is sent: the email job is only queued. BuildTrack is an academic project; the quotation asks for no payment.';
  const body = `<h1>Approve quotation ${e(quote.ref)}?</h1>
<p>${e(intro)}</p>
<dl>
<dt>Recipient</dt><dd>${e(request.name)} &lt;${e(request.email)}&gt;</dd>
<dt>Request</dt><dd>${e(request.ref)}</dd>
<dt>Scope</dt><dd class="text">${e(quote.scope_text)}</dd>
<dt>Amount</dt><dd>${e(formatAmount(quote.amount_centavos))}</dd>
<dt>Validity</dt><dd>${quote.validity_days} days after approval (if approved now, until ${e(when(now + quote.validity_days * DAY_MS))})</dd>
</dl>
<p class="notice">${e(notice)}</p>
<form method="post" action="/requests/${e(request.id)}/approve">
<input type="hidden" name="form_token" value="${e(token)}">
<input type="hidden" name="version" value="${quote.version}">
<div class="actions"><button type="submit">${manual ? 'Approve quotation' : 'Approve and queue email'}</button><a href="/requests/${e(request.id)}">Cancel and go back to the draft</a></div>
</form>`;
  return ownerPage(200, `Approve ${quote.ref}`, body);
}

export function resendConfirmPage(request: RequestRow, quote: QuoteRow, job: JobRow, jobs: JobRow[], token: string): Response {
  const body = `<h1>Send quotation ${e(quote.ref)} again?</h1>
<p>${e(jobLabel(job))}</p>
${
  duplicateRisk(jobs)
    ? '<p class="errors"><strong>The customer may receive two copies.</strong> An earlier attempt for this quotation may have been accepted by the email provider, and this send uses a new key, so the provider cannot recognise it as the same email.</p>'
    : ''
}
<dl>
<dt>Recipient</dt><dd>${e(quote.snap_name ?? '')} &lt;${e(quote.snap_email ?? '')}&gt;</dd>
<dt>Quotation</dt><dd>${e(quote.ref)}, ${e(formatAmount(quote.snap_amount_centavos ?? 0))}, link valid until ${e(when(quote.expires_at ?? 0))}</dd>
</dl>
<p>The same approved content and the same customer link are sent again as a new email.</p>
<form method="post" action="/requests/${e(request.id)}/resend">
<input type="hidden" name="form_token" value="${e(token)}">
<input type="hidden" name="version" value="${quote.version}">
<div class="actions"><button type="submit">Send again</button><a href="/requests/${e(request.id)}">Cancel and go back</a></div>
</form>`;
  return ownerPage(200, `Send ${quote.ref} again`, body);
}

/** "Mark as manually sent" (manual email mode): an explicit, single-use confirmation. */
export function markSentConfirmPage(request: RequestRow, quote: QuoteRow, token: string): Response {
  const body = `<h1>Mark the invitation for ${e(quote.ref)} as sent?</h1>
<p>Record that you sent the invitation for the current link to ${e(quote.snap_name ?? '')} &lt;${e(quote.snap_email ?? '')}&gt; from your own email account.</p>
<p class="notice">This is only your own record (“Marked sent by owner”). It does not confirm that the email was delivered or read, and the customer’s link works whether or not you mark it.</p>
<form method="post" action="/requests/${e(request.id)}/mark-sent">
<input type="hidden" name="form_token" value="${e(token)}">
<input type="hidden" name="version" value="${quote.version}">
<div class="actions"><button type="submit">Mark as sent</button><a href="/requests/${e(request.id)}">Cancel and go back</a></div>
</form>`;
  return ownerPage(200, `Mark ${quote.ref} as sent`, body);
}

/** The owner pages' only script: copy buttons for the prepared invitation. Copying sends nothing. */
export const OWNER_SCRIPT = `// BuildTrack owner pages: copy buttons for the manual invitation. Copying never sends anything.
for (const button of document.querySelectorAll('[data-copy]')) {
  button.hidden = false;
  button.addEventListener('click', async () => {
    const field = document.getElementById(button.dataset.copy);
    const status = document.getElementById('copy-status');
    let copied = false;
    try {
      await navigator.clipboard.writeText(field.value);
      copied = true;
    } catch {
      field.focus();
      field.select();
      try { copied = document.execCommand('copy'); } catch { copied = false; }
    }
    if (status) status.textContent = copied ? button.dataset.copied : 'The browser blocked copying. The text is selected: press Ctrl+C (or Cmd+C) to copy it. Nothing has been sent.';
  });
}
`;
