// Durable email-job runner for the owner Worker (docs/PROPOSAL_QUOTATION_WORKFLOW.md §7, §18,
// checkpoint 3). Called from the owner Worker's scheduled handler with an injected transport.
//
// One run:
// 1. Queues at most one cap-warning job per UTC day (idempotency key bt-cap-<day>, UNIQUE).
// 2. Recovers expired leases: a `sending` job whose runner vanished may or may not have been
//    accepted, so it becomes due again and is retried with the same key and payload. It is marked
//    ambiguous only if its open attempt had recorded a send intent (it may have called the
//    provider); an attempt that crashed before that point was certainly not sent. The open attempt
//    record is closed in the same batch (E_LEASE_EXPIRED, or E_LEASE_EXPIRED_BEFORE_SEND).
// 3. Stops automatic retries 20 hours after a job's first attempt (`needs_owner`), inside the
//    provider's 24-hour idempotency window, so no retry can ever go out under an expired key.
// 4. Claims due jobs one at a time: a conditional UPDATE ... RETURNING sets a fresh lease (only
//    one runner can win a job) and, in the same batch, records the attempt (email_attempts).
//    Quotation jobs are claimed only when the customer routes are ready (config/quotation.ts).
// 5. Renders the payload from immutable sources. The first attempt freezes recipient, template
//    version and payload hash; a later attempt whose payload differs is not sent (`needs_owner`).
// 6. Send boundary (time is read afresh for each step): the attempt records a send intent only
//    if this runner still holds an unexpired lease; then, with no further await, the clock is read
//    again and the 20-hour deadline, the quotation's expiry and enough lease time for the call are
//    checked. If a check fails, the transport is not invoked: the attempt is closed with that
//    reason and the job is stopped or rescheduled, atomically and only while this runner still owns
//    it (its existing ambiguity, from earlier real attempts, is kept as it is). Otherwise the
//    transport is invoked, and provider_called_at is recorded when the attempt is closed. A stale
//    runner therefore never knowingly starts a send. The database check and the HTTP request still
//    cannot be one atomic step (a runner can stall or crash between them); such a crash leaves a
//    send intent without an outcome, which recovery treats as ambiguous, and the provider's
//    idempotency key remains the separate safeguard against a duplicate in that gap.
// 7. Records the classified outcome on the job and the attempt: accepted -> `provider_accepted`
//    (not delivery); ambiguous -> retry, marked ambiguous; rate-limited -> retry; rejected ->
//    `needs_owner`.
// Nothing here logs or stores addresses, subjects, bodies, link tokens or provider messages.

import type { D1Database } from '../../src/lib/quotation/d1.ts';
import { capWarning, ownerNotification, quotationEmail, TEMPLATE_VERSION, type Sender } from '../../src/lib/quotation/email-templates.ts';
import type { EmailMessage, EmailTransport, SendResult } from '../../src/lib/quotation/email-transport.ts';
import { log } from '../../src/lib/quotation/log.ts';
import { sha256Hex } from '../../src/lib/quotation/owner-form.ts';
import { quoteLinkToken, type LinkKey } from '../../src/lib/quotation/quote-link.ts';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

export const sendPolicy = {
  /** A claimed job belongs to its runner this long. */
  leaseMs: 2 * MINUTE,
  /** Provider call timeout; shorter than the lease. */
  timeoutMs: 30 * 1000,
  /** No automatic attempt after this long from the first attempt (the provider keeps keys 24 hours). */
  windowMs: 20 * HOUR,
  /** Delay after attempt n (1-based); later attempts wait `laterMs`. */
  backoffMs: [1 * MINUTE, 5 * MINUTE, 15 * MINUTE, 30 * MINUTE],
  laterMs: HOUR,
  /** Jobs claimed per run, to stay within Workers Free CPU limits. */
  batch: 10,
};

export const retryDelay = (attempts: number) => sendPolicy.backoffMs[attempts - 1] ?? sendPolicy.laterMs;

type JobKind = 'owner_notification' | 'owner_cap_warning' | 'quotation';

interface ClaimedJob {
  id: string;
  kind: JobKind;
  request_id: string | null;
  quote_id: string | null;
  link_generation: number | null;
  idempotency_key: string;
  attempts: number;
  first_attempt_at: number;
  payload_sha256: string | null;
  to_address: string | null;
  template_version: string | null;
}

export interface SenderSetup {
  db: D1Database;
  transport: EmailTransport;
  sender: Sender;
  /** The customer-link key for a recorded key version, or null if it is no longer configured. */
  linkKey: (version: number) => Promise<LinkKey | null>;
  /** Read afresh for every decision (tests control it). */
  clock: () => number;
  /** Quotation jobs are claimed only when true (customer routes ready). */
  quotationEmailsReady: boolean;
}

export interface RunSummary {
  capWarningsQueued: number;
  leasesRecovered: number;
  windowClosed: number;
  claimed: number;
  outcomes: Record<string, number>;
}

/** Fixed refusal codes, stored in `last_result` and logged; never provider text. */
type Stop = { stop: `E_${string}`; status: 'needs_owner' | 'cancelled' };

interface Rendered {
  message: EmailMessage;
  /** The quotation's expiry, rechecked at the send boundary; null for owner emails. */
  expiresAt: number | null;
}

async function render(setup: SenderSetup, job: ClaimedJob): Promise<Rendered | Stop> {
  const { db, sender } = setup;
  const now = setup.clock();
  if (job.kind === 'owner_notification') {
    const request = await db.prepare('SELECT id, ref, created_at FROM quote_requests WHERE id = ?1').bind(job.request_id).first<{ id: string; ref: string; created_at: number }>();
    return request ? { message: ownerNotification(sender, request), expiresAt: null } : { stop: 'E_SOURCE_MISSING', status: 'needs_owner' };
  }
  if (job.kind === 'owner_cap_warning') {
    const day = /^bt-cap-(\d{4}-\d{2}-\d{2})$/.exec(job.idempotency_key)?.[1];
    const row = day ? await db.prepare('SELECT cap_reached_at FROM intake_daily WHERE day = ?1').bind(day).first<{ cap_reached_at: number | null }>() : null;
    return day && row?.cap_reached_at ? { message: capWarning(sender, day, row.cap_reached_at), expiresAt: null } : { stop: 'E_SOURCE_MISSING', status: 'needs_owner' };
  }
  const quote = await db
    .prepare(
      `SELECT q.id, q.ref, q.status, q.link_key_version, q.link_generation, q.token_hash, q.expires_at, q.snap_name, q.snap_email,
         q.snap_scope, q.snap_amount_centavos, r.ref AS request_ref
       FROM quotes AS q JOIN quote_requests AS r ON r.id = q.request_id WHERE q.id = ?1`,
    )
    .bind(job.quote_id)
    .first<{
      id: string;
      ref: string;
      status: string;
      link_key_version: number | null;
      link_generation: number;
      token_hash: string | null;
      expires_at: number | null;
      snap_name: string | null;
      snap_email: string | null;
      snap_scope: string | null;
      snap_amount_centavos: number | null;
      request_ref: string;
    }>();
  if (!quote) return { stop: 'E_SOURCE_MISSING', status: 'needs_owner' };
  if (quote.status !== 'approved' && quote.status !== 'emailed') return { stop: 'E_QUOTE_NOT_OPEN', status: 'cancelled' };
  if (quote.link_generation !== job.link_generation || !quote.token_hash) return { stop: 'E_LINK_CHANGED', status: 'cancelled' };
  if (!quote.expires_at || quote.expires_at <= now) return { stop: 'E_QUOTE_EXPIRED', status: 'needs_owner' };
  const key = quote.link_key_version ? await setup.linkKey(quote.link_key_version) : null;
  if (!key) return { stop: 'E_LINK_KEY_MISSING', status: 'needs_owner' };
  const token = await quoteLinkToken(key, quote.id, quote.link_generation);
  // The rebuilt link must be the one approved: a changed or wrong key never produces a dead link.
  if ((await sha256Hex(token)) !== quote.token_hash) return { stop: 'E_LINK_MISMATCH', status: 'needs_owner' };
  const message = quotationEmail(
    sender,
    {
      quoteRef: quote.ref,
      requestRef: quote.request_ref,
      name: quote.snap_name ?? '',
      email: quote.snap_email ?? '',
      scope: quote.snap_scope ?? '',
      amountCentavos: quote.snap_amount_centavos ?? 0,
      expiresAt: quote.expires_at,
    },
    token,
  );
  return { message, expiresAt: quote.expires_at };
}

/**
 * Statements that end this runner's attempt, both only while this runner still owns the job (one
 * transaction): the attempt record first (outcome, and when the transport was actually invoked),
 * then the job. If ownership was lost, neither changes, so a newer runner's evidence stands.
 */
function finishStatements(
  db: D1Database,
  job: ClaimedJob,
  lease: string,
  now: number,
  set: Record<string, string | number | null>,
  outcome: string,
  calledAt: number | null,
) {
  const columns = Object.keys(set);
  const sql = `UPDATE email_jobs SET ${columns.map((column, i) => `${column} = ?${i + 4}`).join(', ')}, lease_id = NULL, lease_until = NULL, updated_at = ?3
    WHERE id = ?1 AND lease_id = ?2 AND status = 'sending'`;
  return [
    db
      .prepare(
        `UPDATE email_attempts SET finished_at = ?3, outcome = ?4, provider_called_at = ?5 WHERE id = ?2 AND job_id = ?1 AND finished_at IS NULL
         AND EXISTS (SELECT 1 FROM email_jobs WHERE id = ?1 AND lease_id = ?2 AND status = 'sending')`,
      )
      .bind(job.id, lease, now, outcome, calledAt),
    db.prepare(sql).bind(job.id, lease, now, ...columns.map((column) => set[column]!)),
  ];
}

/** Ends this runner's attempt; false if the lease was lost meanwhile (another runner owns the job). */
async function finish(db: D1Database, job: ClaimedJob, lease: string, now: number, set: Record<string, string | number | null>, calledAt: number | null = null): Promise<boolean> {
  const [, jobResult] = await db.batch(finishStatements(db, job, lease, now, set, String(set.last_result), calledAt));
  return jobResult?.meta.changes === 1;
}

async function processJob(setup: SenderSetup, id: string): Promise<string> {
  const { db, clock } = setup;
  const lease = crypto.randomUUID();
  const claimedAt = clock();
  const [claim] = await db.batch([
    db
      .prepare(
        `UPDATE email_jobs SET status = 'sending', lease_id = ?2, lease_until = ?3 + ?4, attempts = attempts + 1,
           first_attempt_at = COALESCE(first_attempt_at, ?3), updated_at = ?3
         WHERE id = ?1 AND status IN ('queued', 'retry_wait') AND next_attempt_at <= ?3 AND (first_attempt_at IS NULL OR first_attempt_at > ?3 - ?5)
           AND (kind <> 'quotation' OR ?6 = 1)
         RETURNING id, kind, request_id, quote_id, link_generation, idempotency_key, attempts, first_attempt_at, lease_until, payload_sha256, to_address, template_version`,
      )
      .bind(id, lease, claimedAt, sendPolicy.leaseMs, sendPolicy.windowMs, setup.quotationEmailsReady ? 1 : 0),
    // The attempt record, in the same transaction as the claim.
    db
      .prepare('INSERT INTO email_attempts (id, job_id, attempt, started_at) SELECT ?2, id, attempts, ?3 FROM email_jobs WHERE id = ?1 AND lease_id = ?2')
      .bind(id, lease, claimedAt),
  ]);
  const job = claim?.results[0] as unknown as (ClaimedJob & { lease_until: number }) | undefined;
  if (!job) return 'not_claimed';
  const fields = { route: 'owner' as const, kind: job.kind, attempt: job.attempts };
  const stopWith = async (status: 'needs_owner' | 'cancelled', code: `E_${string}`) => {
    const ok = await finish(db, job, lease, clock(), { status, last_result: code });
    log('email_job', { ...fields, code: ok ? code : 'E_LEASE_LOST' });
    return ok ? status : 'lease_lost';
  };

  const rendered = await render(setup, job);
  if ('stop' in rendered) return stopWith(rendered.status, rendered.stop);
  const { message } = rendered;
  const hash = await sha256Hex(JSON.stringify([TEMPLATE_VERSION, message.from, message.to, message.subject, message.text]));
  if (job.payload_sha256 === null) {
    const frozen = await db
      .prepare('UPDATE email_jobs SET payload_sha256 = ?3, to_address = ?4, template_version = ?5 WHERE id = ?1 AND lease_id = ?2 AND payload_sha256 IS NULL')
      .bind(job.id, lease, hash, message.to, TEMPLATE_VERSION)
      .run();
    if (frozen.meta.changes !== 1) {
      log('email_job', { ...fields, code: 'E_LEASE_LOST' });
      return 'lease_lost';
    }
  } else if (job.payload_sha256 !== hash || job.to_address !== message.to || job.template_version !== TEMPLATE_VERSION) {
    // Never send different content under a key the provider may already hold (§7).
    return stopWith('needs_owner', 'E_PAYLOAD_CHANGED');
  }

  // ---- Send boundary --------------------------------------------------------------------
  const deadline = job.first_attempt_at + sendPolicy.windowMs;
  const beforeMark = clock();
  if (beforeMark >= deadline) return stopWith('needs_owner', 'E_WINDOW_CLOSED');
  if (rendered.expiresAt !== null && rendered.expiresAt <= beforeMark) return stopWith('needs_owner', 'E_QUOTE_EXPIRED');
  // Durable send intent, written only while this runner holds an unexpired lease.
  const marked = await db
    .prepare(
      `UPDATE email_attempts SET send_intent_at = ?3 WHERE id = ?2 AND job_id = ?1 AND finished_at IS NULL
       AND EXISTS (SELECT 1 FROM email_jobs WHERE id = ?1 AND lease_id = ?2 AND status = 'sending' AND lease_until > ?3)`,
    )
    .bind(job.id, lease, beforeMark)
    .run();
  if (marked.meta.changes !== 1) {
    log('email_job', { ...fields, code: 'E_LEASE_LOST' });
    return 'lease_lost';
  }
  // No await between this final check and the call: deadline, expiry, and lease time for the whole call.
  // A failed check skips the call knowingly: the attempt is closed with its reason and the job is
  // stopped or rescheduled (stopWith/finish only change anything while this runner owns the job),
  // without adding ambiguity; the provider was not called.
  const callAt = clock();
  if (callAt >= deadline) return stopWith('needs_owner', 'E_WINDOW_CLOSED');
  if (rendered.expiresAt !== null && rendered.expiresAt <= callAt) return stopWith('needs_owner', 'E_QUOTE_EXPIRED');
  if (callAt + sendPolicy.timeoutMs >= job.lease_until) {
    // Too little lease left to finish the call: do not start it; the next run tries again.
    const ok = await finish(db, job, lease, clock(), { status: 'retry_wait', next_attempt_at: clock(), last_result: 'E_LEASE_TOO_SHORT' });
    log('email_job', { ...fields, code: ok ? 'E_LEASE_TOO_SHORT' : 'E_LEASE_LOST' });
    return ok ? 'skipped' : 'lease_lost';
  }

  // The runner waits for the transport. The timer aborts the signal after timeoutMs: the Resend
  // transport passes it to fetch, which then rejects (E_TIMEOUT), but aborting only stops waiting
  // on our side; the provider may still have received and processed the request, hence ambiguous.
  // A transport that ignored the signal would keep the runner waiting; its lease would then expire
  // and the job would be recovered as ambiguous (a send intent is recorded).
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), sendPolicy.timeoutMs);
  let result: SendResult;
  try {
    result = await setup.transport.send(message, job.idempotency_key, controller.signal);
  } catch {
    result = { outcome: 'ambiguous', code: controller.signal.aborted ? 'E_TIMEOUT' : 'E_TRANSPORT' };
  } finally {
    clearTimeout(timer);
  }

  const doneAt = clock();
  let ok: boolean;
  if (result.outcome === 'accepted') {
    // One batch: the job's acceptance, the attempt record and, for a quotation, approved -> emailed,
    // only if this runner's job update applied. `emailed` means accepted by the provider, not delivered.
    // Only a job for the quotation's current link generation marks it emailed: an older generation's
    // send that was already in flight when the link was replaced keeps its own acceptance record,
    // but says nothing about the replacement link's email (which may still need a resend).
    const [, accepted] = await db.batch([
      ...finishStatements(db, job, lease, doneAt, { status: 'provider_accepted', provider_message_id: result.messageId, last_result: 'OK_ACCEPTED' }, 'OK_ACCEPTED', callAt),
      db
        .prepare(
          `UPDATE quotes SET status = 'emailed', emailed_at = ?2, updated_at = ?2 WHERE id = ?1 AND status = 'approved' AND link_generation = ?4
           AND EXISTS (SELECT 1 FROM email_jobs WHERE id = ?3 AND status = 'provider_accepted' AND updated_at = ?2 AND kind = 'quotation')`,
        )
        .bind(job.quote_id, doneAt, job.id, job.link_generation),
    ]);
    ok = accepted?.meta.changes === 1;
  } else if (result.outcome === 'rejected') {
    ok = await finish(db, job, lease, doneAt, { status: 'needs_owner', last_result: result.code }, callAt);
  } else {
    const delay = Math.max(retryDelay(job.attempts), result.outcome === 'rate_limited' ? (result.retryAfterMs ?? 0) : 0);
    const next = doneAt + delay;
    const ambiguous: Record<string, number> = result.outcome === 'ambiguous' ? { ambiguous: 1 } : {};
    ok =
      next > deadline
        ? await finish(db, job, lease, doneAt, { status: 'needs_owner', last_result: 'E_WINDOW_CLOSED', ...ambiguous }, callAt)
        : await finish(db, job, lease, doneAt, { status: 'retry_wait', next_attempt_at: next, last_result: result.code, ...ambiguous }, callAt);
  }
  const code = result.outcome === 'accepted' ? 'E_NONE' : result.code;
  log('email_job', { ...fields, code: ok ? code : 'E_LEASE_LOST' });
  return ok ? result.outcome : 'lease_lost';
}

/** Queues today's and yesterday's cap warnings, if the cap was reached and none exists yet. */
async function queueCapWarnings(db: D1Database, now: number): Promise<number> {
  let queued = 0;
  for (const day of [new Date(now).toISOString().slice(0, 10), new Date(now - 24 * HOUR).toISOString().slice(0, 10)]) {
    const result = await db
      .prepare(
        `INSERT INTO email_jobs (id, kind, resend_seq, idempotency_key, status, next_attempt_at, created_at, updated_at)
         SELECT ?1, 'owner_cap_warning', 0, 'bt-cap-' || day, 'queued', ?2, ?2, ?2 FROM intake_daily WHERE day = ?3 AND cap_reached_at IS NOT NULL
         ON CONFLICT (idempotency_key) DO NOTHING`,
      )
      .bind(crypto.randomUUID(), now, day)
      .run();
    queued += result.meta.changes;
  }
  return queued;
}

export async function runSender(setup: SenderSetup): Promise<RunSummary> {
  const { db, clock } = setup;
  const capWarningsQueued = await queueCapWarnings(db, clock());
  const recoveredAt = clock();
  // Close the vanished runners' attempt records, then make their jobs due again. A job becomes
  // ambiguous only if its open attempt recorded a send intent (the runner may have called the
  // provider); earlier ambiguity is never cleared.
  const [, recovered] = await db.batch([
    db
      .prepare(
        `UPDATE email_attempts SET finished_at = ?1,
           outcome = CASE WHEN send_intent_at IS NOT NULL THEN 'E_LEASE_EXPIRED' ELSE 'E_LEASE_EXPIRED_BEFORE_SEND' END
         WHERE finished_at IS NULL AND id IN (SELECT lease_id FROM email_jobs WHERE status = 'sending' AND lease_until < ?1)`,
      )
      .bind(recoveredAt),
    db
      .prepare(
        `UPDATE email_jobs SET status = 'retry_wait', lease_id = NULL, lease_until = NULL, next_attempt_at = ?1, updated_at = ?1,
           ambiguous = CASE WHEN EXISTS (SELECT 1 FROM email_attempts a WHERE a.id = email_jobs.lease_id AND a.send_intent_at IS NOT NULL) THEN 1 ELSE ambiguous END,
           last_result = CASE WHEN EXISTS (SELECT 1 FROM email_attempts a WHERE a.id = email_jobs.lease_id AND a.send_intent_at IS NOT NULL)
             THEN 'E_LEASE_EXPIRED' ELSE 'E_LEASE_EXPIRED_BEFORE_SEND' END
         WHERE status = 'sending' AND lease_until < ?1`,
      )
      .bind(recoveredAt),
  ]);
  const closedAt = clock();
  const closed = await db
    .prepare(
      `UPDATE email_jobs SET status = 'needs_owner', last_result = 'E_WINDOW_CLOSED', updated_at = ?1
       WHERE status IN ('queued', 'retry_wait') AND first_attempt_at IS NOT NULL AND first_attempt_at <= ?1 - ?2`,
    )
    .bind(closedAt, sendPolicy.windowMs)
    .run();
  const due = await db
    .prepare(
      `SELECT id FROM email_jobs WHERE status IN ('queued', 'retry_wait') AND next_attempt_at <= ?1 AND (kind <> 'quotation' OR ?3 = 1)
       ORDER BY next_attempt_at LIMIT ?2`,
    )
    .bind(clock(), sendPolicy.batch, setup.quotationEmailsReady ? 1 : 0)
    .all<{ id: string }>();
  const outcomes: Record<string, number> = {};
  for (const { id } of due.results) {
    const outcome = await processJob(setup, id);
    outcomes[outcome] = (outcomes[outcome] ?? 0) + 1;
  }
  const summary = {
    capWarningsQueued,
    leasesRecovered: recovered?.meta.changes ?? 0,
    windowClosed: closed.meta.changes,
    claimed: due.results.length - (outcomes.not_claimed ?? 0),
    outcomes,
  };
  log('email_run', { route: 'owner', claimed: summary.claimed, recovered: summary.leasesRecovered });
  return summary;
}
