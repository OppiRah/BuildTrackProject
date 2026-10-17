// Customer quotation API, public Worker (docs/PROPOSAL_QUOTATION_WORKFLOW.md §4, §5, §8, §16, §18):
//   POST /api/quote/view      { token }                                   -> the approved quotation
//   POST /api/quote/accept    { token, version }                          -> accept, explicitly
//   POST /api/quote/decline   { token, version }                          -> decline, explicitly
//   POST /api/quote/simulate  { token, version, method, outcome, attempt_id } -> record a SIMULATED outcome
// Every request: POST only; Content-Type application/json; the exact public Origin (and
// same-origin Sec-Fetch-Site when sent); a strict flat JSON body with exactly the expected
// fields; a per-client limit of 30 per hour; the token validated against the stored link hash
// and the quotation's state on the server, every time. Viewing never changes anything. No
// cookies or sessions: the token in the body is the only credential; no CORS headers are ever
// sent. Tokens, names and addresses are never logged; responses never echo the token.
//
// Authorization is checked by a read (to answer clearly), again INSIDE each write, so nothing
// changes if the link was revoked or superseded, the quotation changed state or version, or it
// expired in between, and once more by the single SELECT that produces every response's data
// (authorizedSnapshot): what a response reveals is exactly what was authorized at that moment. The write's time is read afresh just before the write
// (after any intervening await), and "expired" means expires_at <= that time.
// Accept and decline are one conditional UPDATE plus an event keyed to that update; a repeat or
// concurrent request finds the decision already made and gets the same result. Simulated outcomes
// need an accepted quotation, are idempotent per attempt_id (the same attempt with the same method
// and outcome returns the original result; a different method or outcome is a 409 conflict),
// are labelled simulated, and never change the quotation's status (there is no "paid" state).

import { clientIdentity } from '../../src/lib/quotation/client-identity.ts';
import { readBody } from '../../src/lib/quotation/body.ts';
import {
  checkoutMethods,
  checkoutOutcomes,
  firstName,
  LINK_TOKEN,
  linkMessages,
  UUID_V4,
  type CheckoutMethod,
  type CheckoutOutcome,
  type LinkProblem,
  type QuoteView,
} from '../../src/lib/quotation/customer.ts';
import type { D1Database } from '../../src/lib/quotation/d1.ts';
import { parseFlatJsonObject } from '../../src/lib/quotation/intake.ts';
import { importIntakeKey, keyedHash } from '../../src/lib/quotation/intake-keys.ts';
import { log } from '../../src/lib/quotation/log.ts';
import { sha256Hex } from '../../src/lib/quotation/owner-form.ts';
import { json } from './http.ts';
import type { IntakeEnv } from './intake.ts';

type Action = 'view' | 'accept' | 'decline' | 'simulate';
const fieldsFor: Record<Action, string[]> = {
  view: ['token'],
  accept: ['token', 'version'],
  decline: ['token', 'version'],
  simulate: ['token', 'version', 'method', 'outcome', 'attempt_id'],
};
const MAX_BODY_BYTES = 1024;
export const quoteLimits = { perClientPerHour: 30, simulationsPerQuote: 20 };

const messages = {
  unavailable: 'Quotations cannot be opened right now. Please try again later.',
  shape: 'This request was not in the format the quotation page sends.',
  origin: 'This request did not come from the BuildTrack quotation page.',
  rateLimited: 'Too many requests from this connection. Please wait an hour and try again.',
  changed: 'This quotation is no longer as shown. Reload the page to see its current state.',
  notAccepted: 'A simulated checkout is only available after you accept the quotation.',
  decided: 'This quotation has already been answered.',
  limit: 'This quotation has reached the number of simulated checkouts this demonstration allows.',
  conflict: 'This simulated checkout was already recorded with a different choice. Start the simulated checkout again.',
};

/** The write-time authorization every mutation repeats inside its own statement (?T token hash, ?N write time). */
const linkStillValid = (q: string, token: string, now: string) =>
  `${q}.token_hash = ${token} AND ${q}.revoked_at IS NULL AND ${q}.expires_at > ${now}
   AND EXISTS (SELECT 1 FROM quote_links AS l WHERE l.token_hash = ${token} AND l.quote_id = ${q}.id AND l.revoked_at IS NULL AND l.link_generation = ${q}.link_generation)`;

export interface QuoteHooks {
  /** Test-only: awaited between the authorization read and the write (tests/worker/e2e-test-worker.ts). */
  beforeWrite?: (action: 'accept' | 'decline' | 'simulate') => Promise<void>;
  /** Test-only: awaited just before the response snapshot is read. */
  beforeRead?: (action: Action) => Promise<void>;
}

interface Row {
  id: string;
  request_id: string;
  ref: string;
  status: string;
  version: number;
  link_generation: number;
  token_hash: string | null;
  expires_at: number | null;
  revoked_at: number | null;
  snap_name: string | null;
  snap_scope: string | null;
  snap_amount_centavos: number | null;
  request_ref: string;
  link_generation_of_token: number;
  link_revoked_at: number | null;
}

/** The quotation behind a token, or why the link cannot be used. Reads only; changes nothing. */
async function resolve(db: D1Database, tokenHash: string, now: number): Promise<Row | LinkProblem> {
  const row = await db
    .prepare(
      `SELECT q.id, q.request_id, q.ref, q.status, q.version, q.link_generation, q.token_hash, q.expires_at, q.revoked_at,
         q.snap_name, q.snap_scope, q.snap_amount_centavos, r.ref AS request_ref,
         l.link_generation AS link_generation_of_token, l.revoked_at AS link_revoked_at
       FROM quote_links AS l JOIN quotes AS q ON q.id = l.quote_id JOIN quote_requests AS r ON r.id = q.request_id
       WHERE l.token_hash = ?1`,
    )
    .bind(tokenHash)
    .first<Row>();
  if (!row) return 'invalid';
  if (row.link_revoked_at !== null || row.revoked_at !== null || row.status === 'revoked') return 'revoked';
  if (row.link_generation_of_token < row.link_generation || row.token_hash !== tokenHash) return 'superseded';
  if (row.status === 'expired' || !row.expires_at || row.expires_at <= now) return 'expired';
  if (!['approved', 'emailed', 'accepted', 'declined'].includes(row.status)) return 'invalid';
  return row;
}

/**
 * The response's authorization snapshot (checkpoint 4 review): everything a response tells the link
 * holder about the quotation — the view, its simulated-result history and, for a checkout, the
 * stored result of this attempt — comes from this ONE SELECT, which also requires, at `now`, that
 * the presented link is the quotation's current one, unrevoked, of the current generation, and
 * unexpired. A single statement reads one consistent database state, so no data is ever read
 * outside the authorization that admits it. null: the link does not authorize anything at `now`.
 */
interface Snapshot {
  id: string;
  status: 'approved' | 'emailed' | 'accepted' | 'declined';
  version: number;
  view: QuoteView;
  /** This request's attempt, if one is recorded (checkout only). */
  attempt: { method: CheckoutMethod; outcome: CheckoutOutcome } | null;
}
async function authorizedSnapshot(db: D1Database, tokenHash: string, now: number, attemptId: string | null = null): Promise<Snapshot | null> {
  const row = await db
    .prepare(
      `SELECT q.id, q.ref, q.status, q.version, q.expires_at, q.snap_name, q.snap_scope, q.snap_amount_centavos, r.ref AS request_ref,
         CASE WHEN q.status = 'accepted'
           THEN (SELECT json_group_array(json_array(s.method, s.outcome, s.created_at)) FROM simulated_checkouts AS s WHERE s.quote_id = q.id)
           ELSE '[]' END AS simulations,
         (SELECT json_array(a.method, a.outcome) FROM simulated_checkouts AS a WHERE a.quote_id = q.id AND a.attempt_id = ?3) AS attempt
       FROM quotes AS q JOIN quote_requests AS r ON r.id = q.request_id
       WHERE q.status IN ('approved', 'emailed', 'accepted', 'declined') AND ${linkStillValid('q', '?1', '?2')}`,
    )
    .bind(tokenHash, now, attemptId)
    .first<{
      id: string;
      ref: string;
      status: Snapshot['status'];
      version: number;
      expires_at: number;
      snap_name: string | null;
      snap_scope: string | null;
      snap_amount_centavos: number | null;
      request_ref: string;
      simulations: string;
      attempt: string | null;
    }>();
  if (!row) return null;
  const simulations = (JSON.parse(row.simulations) as [CheckoutMethod, CheckoutOutcome, number][])
    .map(([method, outcome, at]) => ({ method, outcome, at }))
    .sort((a, b) => a.at - b.at);
  const attempt = row.attempt ? (JSON.parse(row.attempt) as [CheckoutMethod, CheckoutOutcome]) : null;
  return {
    id: row.id,
    status: row.status,
    version: row.version,
    attempt: attempt ? { method: attempt[0], outcome: attempt[1] } : null,
    view: {
      status: row.status === 'accepted' ? 'accepted' : row.status === 'declined' ? 'declined' : 'open',
      reference: row.ref,
      requestReference: row.request_ref,
      firstName: firstName(row.snap_name ?? ''),
      scope: row.snap_scope ?? '',
      amountCentavos: row.snap_amount_centavos ?? 0,
      version: row.version,
      expiresAt: row.expires_at,
      simulations,
    },
  };
}

const problem = (kind: LinkProblem) => json(kind === 'invalid' ? 404 : 410, { error: kind, message: linkMessages[kind] });

/** When the snapshot authorizes nothing: say why (the reason only; no quotation data). */
async function refusal(db: D1Database, tokenHash: string, now: number): Promise<Response> {
  const kind = await resolve(db, tokenHash, now);
  // A link valid again a moment later (a race) is still refused here; the page can ask again.
  return typeof kind === 'string' ? problem(kind) : json(409, { error: 'changed', message: messages.changed });
}

/** One conditional decision (accept or decline) and its event, in one batch; true if this request made it. */
async function decide(db: D1Database, row: Row, tokenHash: string, version: number, decision: 'accepted' | 'declined', now: number): Promise<boolean> {
  const attempt = crypto.randomUUID();
  const at = decision === 'accepted' ? 'accepted_at' : 'declined_at';
  const [update] = await db.batch([
    db
      .prepare(
        `UPDATE quotes SET status = ?4, ${at} = ?3, version = version + 1, last_action = ?5, updated_at = ?3
         WHERE id = ?1 AND status IN ('approved', 'emailed') AND version = ?6 AND ${linkStillValid('quotes', '?2', '?3')}`,
      )
      .bind(row.id, tokenHash, now, decision, attempt, version),
    db
      .prepare(
        `INSERT INTO quote_events (id, quote_id, request_id, actor, event, version, created_at)
         SELECT ?2, id, request_id, 'customer', ?3, version, ?4 FROM quotes WHERE id = ?1 AND last_action = ?5`,
      )
      .bind(row.id, crypto.randomUUID(), decision, now, attempt),
    // Retention (§11): a decision this request made is activity; a repeat that changed nothing is not.
    db
      .prepare('UPDATE quote_requests SET last_activity_at = ?2 WHERE id = (SELECT request_id FROM quotes WHERE id = ?1 AND last_action = ?3)')
      .bind(row.id, now, attempt),
  ]);
  return update?.meta.changes === 1;
}

export async function handleQuote(
  request: Request,
  env: IntakeEnv,
  action: Action,
  time: number | (() => number) = () => Date.now(),
  hooks: QuoteHooks = {},
): Promise<Response> {
  const route = 'quote' as const;
  const clock = typeof time === 'number' ? () => time : time;
  const now = clock();
  try {
    const key = await importIntakeKey(env.INTAKE_HMAC_KEY, env.INTAKE_HMAC_KEY_VERSION);
    if (env.WORKFLOW_ENABLED !== 'on' || !env.PUBLIC_ORIGIN || !env.DB || !key) {
      log('unavailable', { route, status: 503 });
      return json(503, { error: 'unavailable', message: messages.unavailable });
    }
    const db = env.DB;
    if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' }, { Allow: 'POST' });
    const site = request.headers.get('Sec-Fetch-Site');
    if (request.headers.get('Origin') !== env.PUBLIC_ORIGIN || (site !== null && site !== 'same-origin')) {
      log('quote_action', { route, action, status: 403, code: 'E_ORIGIN' });
      return json(403, { error: 'forbidden', message: messages.origin });
    }
    if ((request.headers.get('Content-Type') ?? '').split(';')[0]!.trim().toLowerCase() !== 'application/json') {
      return json(415, { error: 'unsupported_media_type', message: messages.shape });
    }
    const body = await readBody(request, MAX_BODY_BYTES);
    const entries = 'text' in body ? parseFlatJsonObject(body.text) : null;
    const expected = fieldsFor[action];
    const fields = entries && entries.length === expected.length ? Object.fromEntries(entries) : null;
    if (!fields || !expected.every((name) => typeof fields[name] === 'string') || !LINK_TOKEN.test(fields.token!)) {
      log('quote_action', { route, action, status: 400, code: 'E_BODY_SHAPE' });
      return json(400, { error: 'bad_request', message: messages.shape });
    }
    const identity = clientIdentity(request.headers.get('CF-Connecting-IP'));
    if (!identity) return json(503, { error: 'unidentified', message: messages.unavailable });
    // Per-client limit (§4): one conditional upsert; refusing writes nothing.
    const hour = new Date(now).toISOString().slice(0, 13);
    const counted = await db
      .prepare(
        `INSERT INTO client_counters (key_hash, bucket, count, created_at) VALUES (?1, ?2, 1, ?3)
         ON CONFLICT (key_hash, bucket) DO UPDATE SET count = count + 1 WHERE count < ?4`,
      )
      .bind(await keyedHash(key, 'quote-client-v1', identity), `qh:${hour}`, now, quoteLimits.perClientPerHour)
      .run();
    if (counted.meta.changes !== 1) {
      log('quote_action', { route, action, status: 429, code: 'E_RATE' });
      return json(429, { error: 'rate_limited', message: messages.rateLimited }, { 'Retry-After': '3600' });
    }

    const tokenHash = await sha256Hex(fields.token!);
    const resolved = await resolve(db, tokenHash, now);
    if (typeof resolved === 'string') {
      log('quote_action', { route, action, status: resolved === 'invalid' ? 404 : 410, code: `E_LINK_${resolved.toUpperCase()}` });
      return problem(resolved);
    }
    const row = resolved;

    if (action === 'accept' || action === 'decline') {
      const version = /^[1-9]\d{0,8}$/.test(fields.version!) ? Number(fields.version) : null;
      if (version === null) return json(400, { error: 'bad_request', message: messages.shape });
      const decision = action === 'accept' ? 'accepted' : 'declined';
      await hooks.beforeWrite?.(action);
      const made = await decide(db, row, tokenHash, version, decision, clock()); // time read afresh at the write
      await hooks.beforeRead?.(action);
      const readAt = clock();
      const snapshot = await authorizedSnapshot(db, tokenHash, readAt);
      if (!snapshot) return refusal(db, tokenHash, readAt);
      // Idempotent: the same decision already made (by this or a concurrent request) is a success.
      if (!made && snapshot.status !== decision) {
        const decided = snapshot.status === 'accepted' || snapshot.status === 'declined';
        log('quote_action', { route, action, status: 409, code: decided ? 'E_DECIDED' : 'E_VERSION' });
        return json(409, { error: decided ? 'decided' : 'changed', message: decided ? messages.decided : messages.changed, view: snapshot.view });
      }
      log('quote_action', { route, action, status: 200, code: made ? 'E_NONE' : 'E_REPEAT' });
      return json(200, { view: snapshot.view, repeated: !made });
    }

    if (action === 'simulate') {
      const method = fields.method as CheckoutMethod;
      const outcome = fields.outcome as CheckoutOutcome;
      const version = /^[1-9]\d{0,8}$/.test(fields.version!) ? Number(fields.version) : null;
      if (!checkoutMethods.includes(method) || !checkoutOutcomes.includes(outcome) || !UUID_V4.test(fields.attempt_id!) || version === null) {
        return json(400, { error: 'bad_request', message: messages.shape });
      }
      if (row.status !== 'accepted') {
        log('quote_action', { route, action, status: 409, code: 'E_NOT_ACCEPTED' });
        return json(409, { error: 'not_accepted', message: messages.notAccepted });
      }
      await hooks.beforeWrite?.(action);
      const writeAt = clock(); // read afresh at the write
      // Recorded only if, at this moment, the link is still current and unrevoked, the quotation
      // still accepted, at the version the customer was shown, and unexpired, and the cap not reached.
      const rowId = crypto.randomUUID();
      await db.batch([
        db
          .prepare(
            `INSERT INTO simulated_checkouts (id, quote_id, attempt_id, method, outcome, created_at, simulated)
             SELECT ?1, q.id, ?3, ?4, ?5, ?6, 1 FROM quotes AS q
             WHERE q.id = ?2 AND q.status = 'accepted' AND q.version = ?9 AND ${linkStillValid('q', '?8', '?6')}
               AND (SELECT COUNT(*) FROM simulated_checkouts WHERE quote_id = ?2) < ?7
             ON CONFLICT (quote_id, attempt_id) DO NOTHING`,
          )
          .bind(rowId, row.id, fields.attempt_id, method, outcome, writeAt, quoteLimits.simulationsPerQuote, tokenHash, version),
        // Retention (§11): only a newly recorded outcome is activity (capped per quotation, and only before expiry).
        db
          .prepare('UPDATE quote_requests SET last_activity_at = ?3 WHERE id = (SELECT request_id FROM quotes WHERE id = ?1) AND EXISTS (SELECT 1 FROM simulated_checkouts WHERE id = ?2)')
          .bind(row.id, rowId, writeAt),
      ]);
      // The answer (including the stored result of an earlier identical attempt) comes only from the
      // authorization snapshot read now: never for a link revoked, superseded or expired since, and
      // never at a version other than the one requested.
      await hooks.beforeRead?.(action);
      const readAt = clock();
      const snapshot = await authorizedSnapshot(db, tokenHash, readAt, fields.attempt_id!);
      if (!snapshot) {
        log('quote_action', { route, action, status: 410, code: 'E_SNAPSHOT' });
        return refusal(db, tokenHash, readAt);
      }
      if (snapshot.status !== 'accepted') return json(409, { error: 'not_accepted', message: messages.notAccepted });
      if (snapshot.version !== version) {
        log('quote_action', { route, action, status: 409, code: 'E_VERSION' });
        return json(409, { error: 'changed', message: messages.changed, view: snapshot.view });
      }
      const recorded = snapshot.attempt;
      if (!recorded) return json(409, { error: 'limit', message: messages.limit });
      if (recorded.method !== method || recorded.outcome !== outcome) {
        log('quote_action', { route, action, status: 409, code: 'E_ATTEMPT_CONFLICT' });
        return json(409, { error: 'conflict', message: messages.conflict });
      }
      log('quote_action', { route, action, status: 200 });
      // The stored result for this attempt (a repeat returns the first answer), always labelled simulated.
      return json(200, { simulated: true, method: recorded.method, outcome: recorded.outcome, view: snapshot.view });
    }

    await hooks.beforeRead?.(action);
    const readAt = clock();
    const snapshot = await authorizedSnapshot(db, tokenHash, readAt);
    if (!snapshot) return refusal(db, tokenHash, readAt);
    log('quote_action', { route, action, status: 200 });
    return json(200, { view: snapshot.view });
  } catch {
    log('error', { route, code: 'E_QUOTE' });
    return json(500, { error: 'server_error' });
  }
}
