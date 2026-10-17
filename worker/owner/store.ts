// D1 access for the owner Worker (migrations/0002_quotation_owner.sql). Reads are plain
// SELECTs. Every change is one D1 batch (D1's documented transaction) that starts by recording
// the form token as used and then makes its changes only if that token row carries this
// attempt's id, so a replayed token, a second click or a stale version changes nothing at all.
// Each later statement acts only on rows marked with this attempt's id (`last_action`), so
// statements succeed together or not at all; `meta.changes` per statement tells which.

import type { D1Database, D1PreparedStatement } from '../../src/lib/quotation/d1.ts';
import type { QuoteValues } from '../../src/lib/quotation/owner-form.ts';

const DAY_MS = 24 * 60 * 60 * 1000;
export const LIST_LIMIT = 100;

export interface RequestRow {
  id: string;
  ref: string;
  status: 'received' | 'quoted' | 'dismissed';
  source: 'js' | 'native';
  service: string;
  plan: string;
  name: string;
  email: string;
  organization: string;
  phone: string;
  organization_type: string;
  project_need: string;
  message: string;
  flagged: number;
  created_at: number;
}

export interface QuoteRow {
  id: string;
  request_id: string;
  ref: string;
  status: string;
  version: number;
  scope_text: string;
  amount_centavos: number;
  validity_days: number;
  link_generation: number;
  expires_at: number | null;
  approved_at: number | null;
  approved_by: string | null;
  snap_name: string | null;
  snap_email: string | null;
  snap_scope: string | null;
  snap_amount_centavos: number | null;
  snap_validity_days: number | null;
  link_key_version: number | null;
  token_hash: string | null;
  /** Manual email mode (migration 0008): the link generation the owner marked as sent, and when. */
  manual_sent_generation: number | null;
  manual_sent_at: number | null;
}

export interface JobRow {
  id: string;
  status: 'queued' | 'sending' | 'retry_wait' | 'provider_accepted' | 'needs_owner' | 'cancelled';
  attempts: number;
  ambiguous: number;
  last_result: string | null;
  link_generation: number;
  resend_seq: number;
  idempotency_key: string;
  /** While `sending`: until when the runner's lease is valid (an expired lease means it stopped). */
  lease_until: number | null;
  created_at: number;
  updated_at: number;
}

export type ListRow = Pick<RequestRow, 'id' | 'ref' | 'status' | 'name' | 'organization' | 'plan' | 'flagged' | 'created_at'> & {
  quote_ref: string | null;
  quote_status: string | null;
};

/** The newest requests with their quotation status (newest first, at most LIST_LIMIT). */
export async function listRequests(db: D1Database): Promise<ListRow[]> {
  const result = await db
    .prepare(
      `SELECT r.id, r.ref, r.status, r.name, r.organization, r.plan, r.flagged, r.created_at, q.ref AS quote_ref, q.status AS quote_status
       FROM quote_requests AS r LEFT JOIN quotes AS q ON q.request_id = r.id
       ORDER BY r.created_at DESC LIMIT ?1`,
    )
    .bind(LIST_LIMIT)
    .all<ListRow>();
  return result.results;
}

/** Owner notifications and cap warnings that stopped for the owner (shown on the list page). */
export async function ownerEmailProblems(db: D1Database): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) AS n FROM email_jobs WHERE status = 'needs_owner' AND kind IN ('owner_notification', 'owner_cap_warning')")
    .first<{ n: number }>();
  return row?.n ?? 0;
}

export async function getRequest(db: D1Database, id: string): Promise<{ request: RequestRow; quote: QuoteRow | null; jobs: JobRow[] } | null> {
  const request = await db.prepare('SELECT * FROM quote_requests WHERE id = ?1').bind(id).first<RequestRow>();
  if (!request) return null;
  const quote = await db.prepare('SELECT * FROM quotes WHERE request_id = ?1').bind(id).first<QuoteRow>();
  const jobs = quote
    ? (
        await db
          .prepare(
            `SELECT id, status, attempts, ambiguous, last_result, link_generation, resend_seq, idempotency_key, lease_until, created_at, updated_at
             FROM email_jobs WHERE quote_id = ?1 AND kind = 'quotation' ORDER BY link_generation, resend_seq`,
          )
          .bind(quote.id)
          .all<JobRow>()
      ).results
    : [];
  return { request, quote, jobs };
}

export interface FormUse {
  tokenHash: string;
  tokenExpires: number;
  owner: string;
  now: number;
}

export type ChangeOutcome = 'done' | 'stale';

/** Binds exactly the parameters a statement uses (?1..?n, where n is its highest index). */
function binder(db: D1Database, params: (string | number | null)[]) {
  return (sql: string): D1PreparedStatement => {
    const highest = Math.max(0, ...[...sql.matchAll(/\?(\d+)/g)].map((match) => Number(match[1])));
    return db.prepare(sql).bind(...params.slice(0, highest));
  };
}

// ?1 attempt id, ?2 token hash, ?3 now, ?4 token expiry: shared by every change batch.
const useToken = 'INSERT INTO used_form_tokens (token_hash, attempt, used_at, expires_at) VALUES (?2, ?1, ?3, ?4) ON CONFLICT (token_hash) DO NOTHING';
const tokenIsMine = 'EXISTS (SELECT 1 FROM used_form_tokens WHERE token_hash = ?2 AND attempt = ?1)';
/** Records owner activity on the request of a quote this attempt changed (retention, §11). */
const touchRequestOf = (quoteParam: string) =>
  `UPDATE quote_requests SET last_activity_at = ?3 WHERE id = (SELECT request_id FROM quotes WHERE id = ${quoteParam} AND last_action = ?1)`;

/** The audit event, only if this attempt changed the quote (`quoteParam` holds its id). */
const event = (name: 'created' | 'saved' | 'approved' | 'revoked' | 'link_replaced' | 'resent', quoteParam: string) =>
  `INSERT INTO quote_events (id, quote_id, request_id, actor, event, version, created_at)
   SELECT ?5, id, request_id, 'owner', '${name}', version, ?3 FROM quotes WHERE id = ${quoteParam} AND last_action = ?1`;

async function run(db: D1Database, statements: D1PreparedStatement[]): Promise<ChangeOutcome> {
  const results = await db.batch(statements);
  const changes = results.map((result) => result.meta.changes);
  if (changes.every((count) => count === 1)) return 'done';
  // Statement 2 is the guarded change; everything after it depends on it. The token row
  // (statement 1) may have been recorded either way: a used token stays used.
  if (changes.slice(1).every((count) => count === 0)) return 'stale';
  throw new Error('E_OWNER_BATCH');
}

/** First draft for a request still `received`: allocates BT-Q-<year>-<seq> and marks the request quoted. */
export async function createDraft(db: D1Database, requestId: string, values: QuoteValues, use: FormUse): Promise<ChangeOutcome> {
  const attempt = crypto.randomUUID();
  const year = String(new Date(use.now).getUTCFullYear());
  const prepare = binder(db, [attempt, use.tokenHash, use.now, use.tokenExpires, crypto.randomUUID(), requestId, year, values.scope, values.amountCentavos, values.validityDays]);
  const open = `${tokenIsMine} AND EXISTS (SELECT 1 FROM quote_requests WHERE id = ?6 AND status = 'received') AND NOT EXISTS (SELECT 1 FROM quotes WHERE request_id = ?6)`;
  return run(db, [
    prepare(useToken),
    prepare(
      `INSERT INTO quote_ref_sequences (year, last_seq, last_attempt) SELECT CAST(?7 AS INTEGER), 1, ?1 WHERE ${open}
       ON CONFLICT (year) DO UPDATE SET last_seq = last_seq + 1, last_attempt = ?1`,
    ),
    prepare(
      `INSERT INTO quotes (id, request_id, ref, ref_year, ref_seq, status, version, scope_text, amount_centavos, currency, validity_days,
         last_action, link_generation, created_at, updated_at)
       SELECT ?1, ?6, 'BT-Q-' || ?7 || '-' || printf('%04d', seq.last_seq), seq.year, seq.last_seq, 'draft', 1, ?8, ?9, 'PHP', ?10, ?1, 0, ?3, ?3
       FROM quote_ref_sequences AS seq WHERE seq.year = CAST(?7 AS INTEGER) AND seq.last_attempt = ?1`,
    ),
    prepare(`UPDATE quote_requests SET status = 'quoted', updated_at = ?3, last_activity_at = ?3 WHERE id = ?6 AND EXISTS (SELECT 1 FROM quotes WHERE id = ?1 AND last_action = ?1)`),
    prepare(event('created', '?1')),
  ]);
}

/** Saves a draft only if it is still a draft at the version the form showed. */
export async function saveDraft(db: D1Database, quoteId: string, version: number, values: QuoteValues, use: FormUse): Promise<ChangeOutcome> {
  const attempt = crypto.randomUUID();
  const prepare = binder(db, [attempt, use.tokenHash, use.now, use.tokenExpires, crypto.randomUUID(), quoteId, version, values.scope, values.amountCentavos, values.validityDays]);
  return run(db, [
    prepare(useToken),
    prepare(
      `UPDATE quotes SET scope_text = ?8, amount_centavos = ?9, validity_days = ?10, version = version + 1, last_action = ?1, updated_at = ?3
       WHERE id = ?6 AND status = 'draft' AND version = ?7 AND ${tokenIsMine}`,
    ),
    prepare(event('saved', '?6')),
    prepare(touchRequestOf('?6')),
  ]);
}

/**
 * Approval (§7): freezes the snapshot the confirmation page showed, records the link hash and
 * expiry, and queues exactly one quotation email job, only if the quote is still the draft at the
 * confirmed version. Nothing is sent: no sender exists in this checkpoint.
 */
export async function approveQuote(
  db: D1Database,
  input: { quoteId: string; version: number; linkKeyVersion: number; linkGeneration: number; tokenHash: string; use: FormUse; queueEmail: boolean },
): Promise<ChangeOutcome> {
  const { use } = input;
  const attempt = crypto.randomUUID();
  const prepare = binder(db, [
    attempt, // ?1
    use.tokenHash, // ?2
    use.now, // ?3
    use.tokenExpires, // ?4
    crypto.randomUUID(), // ?5 event id
    input.quoteId, // ?6
    input.version, // ?7
    input.linkKeyVersion, // ?8
    input.linkGeneration, // ?9
    input.tokenHash, // ?10 customer-link hash
    use.owner, // ?11
    DAY_MS, // ?12
    crypto.randomUUID(), // ?13 job id
  ]);
  return run(db, [
    prepare(useToken),
    prepare(
      `UPDATE quotes SET status = 'approved', version = version + 1, last_action = ?1, link_key_version = ?8, link_generation = ?9,
         token_hash = ?10, expires_at = ?3 + validity_days * ?12, approved_at = ?3, approved_by = ?11,
         snap_name = (SELECT name FROM quote_requests WHERE id = quotes.request_id),
         snap_email = (SELECT email FROM quote_requests WHERE id = quotes.request_id),
         snap_scope = scope_text, snap_amount_centavos = amount_centavos, snap_validity_days = validity_days, updated_at = ?3
       WHERE id = ?6 AND status = 'draft' AND version = ?7 AND link_generation = ?9 - 1 AND ${tokenIsMine}`,
    ),
    // The link's history record (checkpoint 4): only its hash, generation and key version.
    prepare(
      `INSERT INTO quote_links (token_hash, quote_id, link_generation, link_key_version, created_at)
       SELECT ?10, id, ?9, ?8, ?3 FROM quotes WHERE id = ?6 AND last_action = ?1`,
    ),
    // Automatic email mode only: one quotation email job. In manual mode none is created; the owner
    // prepares the invitation on the owner page and sends it from their own email account.
    ...(input.queueEmail
      ? [
          prepare(
            `INSERT INTO email_jobs (id, kind, request_id, quote_id, link_generation, resend_seq, idempotency_key, status, next_attempt_at, created_at, updated_at)
       SELECT ?13, 'quotation', request_id, id, link_generation, 0, 'bt-q-' || id || '-g' || link_generation || '-s0', 'queued', ?3, ?3, ?3
       FROM quotes WHERE id = ?6 AND last_action = ?1`,
          ),
        ]
      : []),
    prepare(event('approved', '?6')),
    prepare(touchRequestOf('?6')),
  ]);
}

/**
 * Explicit owner resend (§7, "Explicit resend after the window"): a new job with the next
 * resend_seq, hence a new idempotency key, for the same link generation. Only for the latest job of
 * the current link generation of an approved, unexpired quotation whose job stopped for the owner,
 * at the version the confirmation page showed. resend_seq restarts at 0 for each generation, so
 * "latest" is compared within the generation only. Nothing is ever resent automatically under a new key.
 */
export async function resendQuotation(
  db: D1Database,
  input: { jobId: string; quoteId: string; version: number; use: FormUse },
): Promise<ChangeOutcome> {
  const { use } = input;
  const prepare = binder(db, [crypto.randomUUID(), use.tokenHash, use.now, use.tokenExpires, crypto.randomUUID(), input.jobId, input.quoteId, input.version, crypto.randomUUID()]);
  return run(db, [
    prepare(useToken),
    prepare(
      `INSERT INTO email_jobs (id, kind, request_id, quote_id, link_generation, resend_seq, idempotency_key, status, next_attempt_at, created_at, updated_at)
       SELECT ?5, 'quotation', j.request_id, j.quote_id, j.link_generation, j.resend_seq + 1,
         'bt-q-' || j.quote_id || '-g' || j.link_generation || '-s' || (j.resend_seq + 1), 'queued', ?3, ?3, ?3
       FROM email_jobs AS j JOIN quotes AS q ON q.id = j.quote_id
       WHERE j.id = ?6 AND j.quote_id = ?7 AND j.kind = 'quotation' AND j.status = 'needs_owner'
         AND q.status = 'approved' AND q.version = ?8 AND q.expires_at > ?3 AND j.link_generation = q.link_generation
         AND NOT EXISTS (SELECT 1 FROM email_jobs AS later WHERE later.quote_id = j.quote_id AND later.kind = 'quotation'
           AND later.link_generation = j.link_generation AND later.resend_seq > j.resend_seq)
         AND ${tokenIsMine}`,
    ),
    prepare(
      `INSERT INTO quote_events (id, quote_id, request_id, actor, event, version, created_at)
       SELECT ?9, id, request_id, 'owner', 'resent', version, ?3 FROM quotes WHERE id = ?7 AND EXISTS (SELECT 1 FROM email_jobs WHERE id = ?5)`,
    ),
    prepare(`UPDATE quote_requests SET last_activity_at = ?3 WHERE id = (SELECT request_id FROM email_jobs WHERE id = ?5)`),
  ]);
}

// ---- Lifecycle actions (local completion; §5, §17) ---------------------------------------------
// Each is one batch: the single-use form token, then ONE guarded change (statement 2) that applies
// only at the version the confirmation page showed, then statements that act only if that change
// was this attempt's (marker). Statement 2 decides the outcome; the others may affect 0..n rows.

async function runGuarded(db: D1Database, statements: D1PreparedStatement[]): Promise<ChangeOutcome> {
  const results = await db.batch(statements);
  return results[1]?.meta.changes === 1 ? 'done' : 'stale';
}
const quoteMarker = `EXISTS (SELECT 1 FROM quotes WHERE id = ?6 AND last_action = ?1)`;

/**
 * Revoke the customer's link (§4, §5): the quotation becomes `revoked` and its links stop working
 * at once; quotation emails not yet handed to the provider are cancelled. An email already being
 * sent (claimed) or already accepted by the provider cannot be recalled; its link no longer works.
 */
export async function revokeQuote(db: D1Database, input: { quoteId: string; version: number; use: FormUse }): Promise<ChangeOutcome> {
  const { use } = input;
  const prepare = binder(db, [crypto.randomUUID(), use.tokenHash, use.now, use.tokenExpires, crypto.randomUUID(), input.quoteId, input.version]);
  return runGuarded(db, [
    prepare(useToken),
    prepare(
      `UPDATE quotes SET status = 'revoked', revoked_at = ?3, token_hash = NULL, version = version + 1, last_action = ?1, updated_at = ?3
       WHERE id = ?6 AND status IN ('approved', 'emailed') AND version = ?7 AND ${tokenIsMine}`,
    ),
    prepare(`UPDATE quote_links SET revoked_at = ?3 WHERE quote_id = ?6 AND revoked_at IS NULL AND ${quoteMarker}`),
    prepare(
      `UPDATE email_jobs SET status = 'cancelled', last_result = 'E_REVOKED', updated_at = ?3
       WHERE quote_id = ?6 AND kind = 'quotation' AND status IN ('queued', 'retry_wait') AND ${quoteMarker}`,
    ),
    prepare(event('revoked', '?6')),
    prepare(touchRequestOf('?6')),
  ]);
}

/**
 * New link and resend (§4 "New link", §5 revoked -> approved): the next link generation for the
 * same approved snapshot. The content and expiry stay exactly as approved (the snapshot is
 * immutable), so a replacement is possible only before the quotation expires. Older links then say
 * "superseded" (or "revoked" if they were revoked); unsent emails for older links are cancelled;
 * one new quotation email job is queued under a new key.
 */
export async function replaceLink(
  db: D1Database,
  input: { quoteId: string; version: number; linkKeyVersion: number; linkGeneration: number; tokenHash: string; use: FormUse; queueEmail: boolean },
): Promise<ChangeOutcome> {
  const { use } = input;
  const prepare = binder(db, [
    crypto.randomUUID(), // ?1
    use.tokenHash, // ?2
    use.now, // ?3
    use.tokenExpires, // ?4
    crypto.randomUUID(), // ?5 event id
    input.quoteId, // ?6
    input.version, // ?7
    input.linkKeyVersion, // ?8
    input.linkGeneration, // ?9
    input.tokenHash, // ?10
    crypto.randomUUID(), // ?11 job id
  ]);
  return runGuarded(db, [
    prepare(useToken),
    prepare(
      `UPDATE quotes SET status = 'approved', revoked_at = NULL, link_key_version = ?8, link_generation = ?9, token_hash = ?10,
         version = version + 1, last_action = ?1, updated_at = ?3
       WHERE id = ?6 AND status IN ('approved', 'emailed', 'revoked') AND version = ?7 AND link_generation = ?9 - 1 AND expires_at > ?3 AND ${tokenIsMine}`,
    ),
    prepare(
      `INSERT INTO quote_links (token_hash, quote_id, link_generation, link_key_version, created_at)
       SELECT ?10, id, ?9, ?8, ?3 FROM quotes WHERE id = ?6 AND last_action = ?1`,
    ),
    prepare(
      `UPDATE email_jobs SET status = 'cancelled', last_result = 'E_LINK_REPLACED', updated_at = ?3
       WHERE quote_id = ?6 AND kind = 'quotation' AND link_generation < ?9 AND status IN ('queued', 'retry_wait', 'needs_owner') AND ${quoteMarker}`,
    ),
    ...(input.queueEmail
      ? [
          prepare(
            `INSERT INTO email_jobs (id, kind, request_id, quote_id, link_generation, resend_seq, idempotency_key, status, next_attempt_at, created_at, updated_at)
       SELECT ?11, 'quotation', request_id, id, link_generation, 0, 'bt-q-' || id || '-g' || link_generation || '-s0', 'queued', ?3, ?3, ?3
       FROM quotes WHERE id = ?6 AND last_action = ?1`,
          ),
        ]
      : []),
    prepare(event('link_replaced', '?6')),
    prepare(touchRequestOf('?6')),
  ]);
}

/**
 * Manual email mode: the owner records that they sent the invitation for the CURRENT link from their
 * own email account ("Marked sent by owner"). Only while that link works (not revoked, not expired)
 * and not already marked for this generation, at the version the confirmation page showed. It does
 * not change the quotation's version, status or anything the customer sees or needs.
 */
export async function markInvitationSent(db: D1Database, input: { quoteId: string; version: number; use: FormUse }): Promise<ChangeOutcome> {
  const { use } = input;
  const prepare = binder(db, [crypto.randomUUID(), use.tokenHash, use.now, use.tokenExpires, input.quoteId, input.version]);
  return runGuarded(db, [
    prepare(useToken),
    prepare(
      `UPDATE quotes SET manual_sent_generation = link_generation, manual_sent_at = ?3, last_action = ?1, updated_at = ?3
       WHERE id = ?5 AND version = ?6 AND token_hash IS NOT NULL AND expires_at > ?3 AND status IN ('approved', 'emailed', 'accepted', 'declined')
         AND manual_sent_generation IS NOT link_generation AND ${tokenIsMine}`,
    ),
    prepare(touchRequestOf('?5')),
  ]);
}

/**
 * Manual email mode: no job is ever dispatched again. One batch (D1's transaction):
 * 1. retires jobs left `sending` by a runner whose lease has EXPIRED (a live lease is left alone),
 *    with the sender's own recovery rules (sender.ts): the open attempt is closed first,
 *    E_LEASE_EXPIRED if it had recorded a send intent (it may have reached the provider), else
 *    E_LEASE_EXPIRED_BEFORE_SEND; the job becomes `cancelled` (E_MANUAL_MODE) and ambiguous only if
 *    that attempt recorded an intent; earlier ambiguity is never cleared. Each statement acts only
 *    on rows that are still `sending` with that same expired lease, so a newer state is never
 *    overwritten;
 * 2. cancels jobs still waiting (`queued`, `retry_wait`). Everything is kept as history.
 */
export async function cancelPendingEmail(db: D1Database, now: number, limit = 100): Promise<number> {
  const expired = `SELECT lease_id FROM email_jobs WHERE status = 'sending' AND lease_until < ?1`;
  const [, retired, waiting] = await db.batch([
    db
      .prepare(
        `UPDATE email_attempts SET finished_at = ?1,
           outcome = CASE WHEN send_intent_at IS NOT NULL THEN 'E_LEASE_EXPIRED' ELSE 'E_LEASE_EXPIRED_BEFORE_SEND' END
         WHERE finished_at IS NULL AND id IN (${expired})`,
      )
      .bind(now),
    db
      .prepare(
        `UPDATE email_jobs SET status = 'cancelled', last_result = 'E_MANUAL_MODE', lease_id = NULL, lease_until = NULL, updated_at = ?1,
           ambiguous = CASE WHEN EXISTS (SELECT 1 FROM email_attempts a WHERE a.id = email_jobs.lease_id AND a.send_intent_at IS NOT NULL) THEN 1 ELSE ambiguous END
         WHERE status = 'sending' AND lease_until < ?1`,
      )
      .bind(now),
    db
      .prepare(
        `UPDATE email_jobs SET status = 'cancelled', last_result = 'E_MANUAL_MODE', updated_at = ?1
         WHERE rowid IN (SELECT rowid FROM email_jobs WHERE status IN ('queued', 'retry_wait') LIMIT ?2)`,
      )
      .bind(now, limit),
  ]);
  return (retired?.meta.changes ?? 0) + (waiting?.meta.changes ?? 0);
}

/** Dismiss a request that has no quotation (§5 received -> dismissed). It stays until retention deletes it. */
export async function dismissRequest(db: D1Database, input: { requestId: string; use: FormUse }): Promise<ChangeOutcome> {
  const { use } = input;
  const prepare = binder(db, [crypto.randomUUID(), use.tokenHash, use.now, use.tokenExpires, input.requestId]);
  return runGuarded(db, [
    prepare(useToken),
    prepare(
      `UPDATE quote_requests SET status = 'dismissed', updated_at = ?3, last_activity_at = ?3, last_action = ?1
       WHERE id = ?5 AND status = 'received' AND NOT EXISTS (SELECT 1 FROM quotes WHERE request_id = ?5) AND ${tokenIsMine}`,
    ),
  ]);
}

/** A send that a runner holds right now (§17: deletion waits for it; an email being sent cannot be stopped). */
const sendInFlight = `EXISTS (SELECT 1 FROM email_jobs WHERE request_id = ?5 AND status = 'sending' AND lease_until > ?3)`;

/**
 * Everything the application holds for one request (§17), deleted in one batch AFTER `guard` (the
 * statement that marks the request with this attempt's id ?1) succeeded: simulated outcomes,
 * events, links, email jobs (attempt history follows by trigger), the quotation, then the request.
 * Parameters: ?1 attempt id, ?3 now, ?5 request id. Shared by the owner's Delete and retention.
 */
export function deletionSql(guard: string): string[] {
  const marker = `EXISTS (SELECT 1 FROM quote_requests WHERE id = ?5 AND last_action = ?1)`;
  const quotesOf = `(SELECT id FROM quotes WHERE request_id = ?5)`;
  return [
    guard,
    `DELETE FROM simulated_checkouts WHERE quote_id IN ${quotesOf} AND ${marker}`,
    `DELETE FROM quote_events WHERE request_id = ?5 AND ${marker}`,
    `DELETE FROM quote_links WHERE quote_id IN ${quotesOf} AND ${marker}`,
    `DELETE FROM email_jobs WHERE request_id = ?5 AND ${marker}`,
    `DELETE FROM quotes WHERE request_id = ?5 AND ${marker}`,
    `DELETE FROM quote_requests WHERE id = ?5 AND last_action = ?1`,
  ];
}
/** The retention guard (exported for query-plan tests). */
export const purgeGuardSql = `UPDATE quote_requests SET last_action = ?1 WHERE id = ?5 AND last_activity_at < ?4 AND NOT ${sendInFlight}`;
function deletionStatements(prepare: (sql: string) => D1PreparedStatement, guard: string): D1PreparedStatement[] {
  return deletionSql(guard).map((sql) => prepare(sql));
}

export type DeleteOutcome = ChangeOutcome | 'sending';

/**
 * Owner "Delete request" (§17), at the quotation version (or 0 without one) the confirmation showed.
 * Refused while an email for the request is being sent (a claimed job with a live lease).
 */
export async function deleteRequest(db: D1Database, input: { requestId: string; version: number; use: FormUse }): Promise<DeleteOutcome> {
  const { use } = input;
  const prepare = binder(db, [crypto.randomUUID(), use.tokenHash, use.now, use.tokenExpires, input.requestId, input.version]);
  const versionMatches = `((?6 = 0 AND NOT EXISTS (SELECT 1 FROM quotes WHERE request_id = ?5)) OR EXISTS (SELECT 1 FROM quotes WHERE request_id = ?5 AND version = ?6))`;
  const results = await db.batch([
    prepare(useToken),
    ...deletionStatements(prepare, `UPDATE quote_requests SET last_action = ?1 WHERE id = ?5 AND ${versionMatches} AND NOT ${sendInFlight} AND ${tokenIsMine}`),
  ]);
  if (results[1]?.meta.changes === 1) return 'done';
  const inFlight = await db.prepare(`SELECT 1 AS x FROM email_jobs WHERE request_id = ?1 AND status = 'sending' AND lease_until > ?2`).bind(input.requestId, use.now).first();
  return inFlight ? 'sending' : 'stale';
}

/** Retention (§11): deletes one request whose last activity is before `cutoff`, unless a send is in flight. */
export async function purgeRequest(db: D1Database, requestId: string, now: number, cutoff: number): Promise<boolean> {
  const prepare = binder(db, [crypto.randomUUID(), null, now, cutoff, requestId]);
  const results = await db.batch(deletionStatements(prepare, purgeGuardSql));
  return results[0]?.meta.changes === 1;
}

/** Whether a send for this request is in flight now (for the owner's confirmation page). */
export async function sendInProgress(db: D1Database, requestId: string, now: number): Promise<boolean> {
  return !!(await db.prepare(`SELECT 1 AS x FROM email_jobs WHERE request_id = ?1 AND status = 'sending' AND lease_until > ?2`).bind(requestId, now).first());
}
