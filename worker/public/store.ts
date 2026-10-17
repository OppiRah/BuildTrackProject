// D1 access for the public Worker's intake (migrations/0001_quotation_intake.sql).
//
// Ordinary refusals cost a few row reads and no writes: `readQuota` checks the client's counters
// and the one-row daily total before anything is written. A request that passes is then stored by
// a single D1 batch (D1's documented transaction: sequential, rolled back entirely if any statement
// fails) that reserves the client's day and hour slots and the global daily slot, stores the
// request, counts and queues its owner notification, and undoes the reservations only if this
// attempt's request row was not created (a concurrent duplicate or a limit reached in a race).
// Every statement is a primary-key or single-index lookup: none scans earlier requests, so the
// cost of a save does not grow with history (plans checked in tests/quotation-store-plan.test.ts).
// Each reservation is a conditional upsert that records this attempt's id in `last_attempt`; later
// statements in the same batch proceed only if that marker shows the earlier step succeeded.
// A failed batch therefore leaves no quota consumed and no partial rows.

import type { D1Database, D1PreparedStatement } from '../../src/lib/quotation/d1.ts';
import type { IntakeSource } from '../../src/lib/quotation/intake.ts';
import type { InquiryValues } from '../../src/lib/inquiry-validate.ts';

export const limits = {
  /** New requests per client identity (client-identity.ts) per UTC hour and per UTC day. */
  perHour: 5,
  perDay: 20,
  /** New requests stored per UTC day across all clients: a safety ceiling, refused with 503 beyond it. */
  requestsPerDay: 200,
  /** Owner notifications per UTC day; later requests are stored and flagged instead. */
  notificationsPerDay: 30,
  /** Window in which an identical no-JS resubmission from the same client is a duplicate. */
  nativeDedupeMs: 30 * 60 * 1000,
  /** Counter rows are deleted this long after creation. */
  counterRetentionMs: 48 * 60 * 60 * 1000,
  /** Daily totals (no personal data) are kept this long, for the owner's cap warning. */
  dailyRetentionMs: 8 * 24 * 60 * 60 * 1000,
  /** Rows deleted per cleanup statement, to keep each scheduled run small. */
  purgeBatch: 500,
};

const utcDay = (now: number) => new Date(now).toISOString().slice(0, 10);
const utcHour = (now: number) => new Date(now).toISOString().slice(0, 13);

export interface PreviousRequest {
  reference: string;
  payloadHash: string;
  /** Keyed hash of the submitting client's identity (not per day). */
  clientHash: string;
  hashKeyVersion: string;
}

type Row = { ref: string; payload_hash: string; client_hash: string; hash_key_version: string };
const previous = (row: Row | null | undefined): PreviousRequest | null =>
  row
    ? { reference: row.ref, payloadHash: row.payload_hash, clientHash: row.client_hash, hashKeyVersion: row.hash_key_version }
    : null;
const PREVIOUS_COLUMNS = 'ref, payload_hash, client_hash, hash_key_version';

/** The earlier request with this JSON submission id, or this no-JS de-duplication key inside its window. */
export async function findPrevious(
  db: D1Database,
  key: { submissionId: string } | { dedupeKey: string; now: number },
): Promise<PreviousRequest | null> {
  if ('submissionId' in key) {
    return previous(
      await db.prepare(`SELECT ${PREVIOUS_COLUMNS} FROM quote_requests WHERE submission_id = ?1`).bind(key.submissionId).first<Row>(),
    );
  }
  return previous(
    await db
      .prepare(
        `SELECT ${PREVIOUS_COLUMNS} FROM quote_requests WHERE dedupe_key = ?1 AND created_at > ?2 ORDER BY created_at DESC LIMIT 1`,
      )
      .bind(key.dedupeKey, key.now - limits.nativeDedupeMs)
      .first<Row>(),
  );
}

export type QuotaState = 'available' | 'client-limited' | 'daily-cap';

/**
 * Read-only pre-check (three single-row primary-key lookups): the client's limits first, then the
 * global daily cap. The store batch enforces both again, so this only avoids writes for ordinary refusals.
 */
export async function readQuota(db: D1Database, clientKey: string, now: number): Promise<QuotaState> {
  const row = await db
    .prepare(
      `SELECT (SELECT count FROM client_counters WHERE key_hash = ?1 AND bucket = ?2) AS day_count,
              (SELECT count FROM client_counters WHERE key_hash = ?1 AND bucket = ?3) AS hour_count,
              (SELECT requests FROM intake_daily WHERE day = ?4) AS day_requests`,
    )
    .bind(clientKey, `d:${utcDay(now)}`, `h:${utcHour(now)}`, utcDay(now))
    .first<{ day_count: number | null; hour_count: number | null; day_requests: number | null }>();
  if ((row?.day_count ?? 0) >= limits.perDay || (row?.hour_count ?? 0) >= limits.perHour) return 'client-limited';
  if ((row?.day_requests ?? 0) >= limits.requestsPerDay) return 'daily-cap';
  return 'available';
}

export type StoreOutcome =
  | { kind: 'created'; reference: string }
  /** A concurrent request with the same submission id or de-duplication key won. */
  | { kind: 'existing'; previous: PreviousRequest }
  /** Limits reached between the pre-check and the batch (concurrent requests). */
  | { kind: 'client-limited' }
  | { kind: 'daily-cap' };

/** Binds exactly the parameters a statement uses (?1..?n, where n is its highest index). */
function binder(db: D1Database, params: (string | number | null)[]) {
  return (sql: string): D1PreparedStatement => {
    const highest = Math.max(...[...sql.matchAll(/\?(\d+)/g)].map((match) => Number(match[1])));
    return db.prepare(sql).bind(...params.slice(0, highest));
  };
}

// Parameters shared by the save batch (see storeRequest for their values).
const reservedDay = 'EXISTS (SELECT 1 FROM client_counters WHERE key_hash = ?2 AND bucket = ?3 AND last_attempt = ?1)';
const reservedHour = 'EXISTS (SELECT 1 FROM client_counters WHERE key_hash = ?2 AND bucket = ?4 AND last_attempt = ?1)';
const reservedGlobal = 'EXISTS (SELECT 1 FROM intake_daily WHERE day = ?5 AND last_attempt = ?1)';
const takenNumber = 'EXISTS (SELECT 1 FROM ref_sequences WHERE year = CAST(?14 AS INTEGER) AND last_attempt = ?1)';
const stored = 'EXISTS (SELECT 1 FROM quote_requests WHERE id = ?1)';
// Two single-index lookups (a NULL parameter matches nothing), instead of one OR condition.
const noDuplicate =
  'NOT EXISTS (SELECT 1 FROM quote_requests WHERE submission_id = ?11) AND NOT EXISTS (SELECT 1 FROM quote_requests WHERE dedupe_key = ?12 AND created_at > ?13)';

/** The save batch, in order. Exported so tests can check every statement's query plan. */
export const saveStatements = [
  // 1-3. Reservations, each only below its limit and only if the previous one succeeded.
  `INSERT INTO client_counters (key_hash, bucket, count, created_at, last_attempt) VALUES (?2, ?3, 1, ?6, ?1)
   ON CONFLICT (key_hash, bucket) DO UPDATE SET count = count + 1, last_attempt = ?1 WHERE count < ?7`,
  `INSERT INTO client_counters (key_hash, bucket, count, created_at, last_attempt)
   SELECT ?2, ?4, 1, ?6, ?1 WHERE ${reservedDay}
   ON CONFLICT (key_hash, bucket) DO UPDATE SET count = count + 1, last_attempt = ?1 WHERE count < ?8`,
  `INSERT INTO intake_daily (day, requests, notifications, cap_reached_at, last_attempt, created_at)
   SELECT ?5, 1, 0, CASE WHEN 1 >= ?9 THEN ?6 END, ?1, ?6 WHERE ${reservedHour}
   ON CONFLICT (day) DO UPDATE SET requests = requests + 1, last_attempt = ?1,
     cap_reached_at = COALESCE(cap_reached_at, CASE WHEN requests + 1 >= ?9 THEN ?6 END)
   WHERE requests < ?9`,
  // 4. The next reference number for the year: one primary-key upsert, only for a request that will be stored.
  `INSERT INTO ref_sequences (year, last_seq, last_attempt)
   SELECT CAST(?14 AS INTEGER), 1, ?1 WHERE ${reservedGlobal} AND ${noDuplicate}
   ON CONFLICT (year) DO UPDATE SET last_seq = last_seq + 1, last_attempt = ?1`,
  // 5. The request, with the number just taken. It is flagged (owner notification skipped: daily cap)
  // only when a notification was requested (?30 = 1): a manual-mode request never inherits the
  // warning from automatic-mode counters.
  `INSERT INTO quote_requests (id, ref, ref_year, ref_seq, submission_id, dedupe_key, payload_hash, client_hash, hash_key_version,
     source, status, service, plan, name, email, organization, phone, organization_type, project_need, message,
     privacy_ack_version, flagged, created_at, updated_at, last_activity_at)
   SELECT ?1, 'BT-R-' || ?14 || '-' || printf('%04d', seq.last_seq), seq.year, seq.last_seq, ?11, ?12, ?15, ?29, ?16,
     ?17, 'received', ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26, ?27,
     CASE WHEN ?30 = 1 AND (SELECT notifications FROM intake_daily WHERE day = ?5) >= ?10 THEN 1 ELSE 0 END, ?6, ?6, ?6
   FROM ref_sequences AS seq
   WHERE seq.year = CAST(?14 AS INTEGER) AND seq.last_attempt = ?1 AND ${reservedGlobal} AND ${noDuplicate}
   ON CONFLICT (submission_id) DO NOTHING`,
  // 6-7. The owner notification, unless the daily notification cap flagged the request, and only
  // when automatic email is on (?30 = 1). In manual email mode no notification job is ever created:
  // the owner checks the dashboard instead, and nothing is left queued for a provider.
  `UPDATE intake_daily SET notifications = notifications + 1 WHERE day = ?5 AND ?30 = 1 AND EXISTS (SELECT 1 FROM quote_requests WHERE id = ?1 AND flagged = 0)`,
  `INSERT INTO email_jobs (id, kind, request_id, resend_seq, idempotency_key, status, next_attempt_at, created_at, updated_at)
   SELECT ?28, 'owner_notification', id, 0, 'bt-r-' || id || '-n0', 'queued', ?6, ?6, ?6
   FROM quote_requests WHERE id = ?1 AND flagged = 0 AND ?30 = 1`,
  // 8-10. Compensation: undo this attempt's reservations and number if its request was not stored.
  // Ordinary refusals never reach the batch; these write only when a race defeats the pre-check.
  `UPDATE client_counters SET count = count - 1 WHERE key_hash = ?2 AND bucket IN (?3, ?4) AND last_attempt = ?1 AND NOT ${stored}`,
  `UPDATE intake_daily SET requests = requests - 1,
     cap_reached_at = CASE WHEN requests - 1 >= ?9 THEN cap_reached_at END
   WHERE day = ?5 AND last_attempt = ?1 AND NOT ${stored}`,
  `UPDATE ref_sequences SET last_seq = last_seq - 1 WHERE year = CAST(?14 AS INTEGER) AND last_attempt = ?1 AND NOT ${stored}`,
  // 11. Outcome: this request, or the duplicate that won, plus which reservations succeeded.
  `SELECT r.ref, r.payload_hash, r.client_hash, r.hash_key_version, r.id = ?1 AS created,
     ${reservedDay} AS day_ok, ${reservedHour} AS hour_ok, ${reservedGlobal} AS global_ok, ${takenNumber} AS number_ok
   FROM (SELECT 1) AS one
   LEFT JOIN quote_requests AS r ON r.id = COALESCE(
     (SELECT id FROM quote_requests WHERE id = ?1),
     (SELECT id FROM quote_requests WHERE submission_id = ?11),
     (SELECT id FROM quote_requests WHERE dedupe_key = ?12 AND created_at > ?13 ORDER BY created_at DESC LIMIT 1))`,
] as const;

/** Reserves quota, stores the request and (automatic email mode only) queues its owner notification, in one batch. */
export async function storeRequest(
  db: D1Database,
  input: {
    values: InquiryValues;
    source: IntakeSource;
    clientKey: string;
    clientHash: string;
    submissionId: string | null;
    dedupeKey: string | null;
    payloadHash: string;
    hashKeyVersion: string;
    privacyAckVersion: string;
    /** Queue the owner notification email (automatic email mode only). */
    notifyOwner: boolean;
    now: number;
  },
): Promise<StoreOutcome> {
  const { values, now } = input;
  const id = crypto.randomUUID();
  const prepare = binder(db, [
    id, // ?1 request id, also this attempt's reservation marker
    input.clientKey, // ?2 per-day rate-limit key
    `d:${utcDay(now)}`, // ?3 client day bucket
    `h:${utcHour(now)}`, // ?4 client hour bucket
    utcDay(now), // ?5 daily total row
    now, // ?6
    limits.perDay, // ?7
    limits.perHour, // ?8
    limits.requestsPerDay, // ?9
    limits.notificationsPerDay, // ?10
    input.submissionId, // ?11
    input.dedupeKey, // ?12
    now - limits.nativeDedupeMs, // ?13
    String(new Date(now).getUTCFullYear()), // ?14 bound as text, cast in SQL
    input.payloadHash, // ?15
    input.hashKeyVersion, // ?16
    input.source, // ?17
    values.service, // ?18
    values.plan, // ?19
    values.name, // ?20
    values.email, // ?21
    values.organization, // ?22
    values.phone, // ?23
    values.organization_type, // ?24
    values.project_need, // ?25
    values.message, // ?26
    input.privacyAckVersion, // ?27
    crypto.randomUUID(), // ?28 notification job id
    input.clientHash, // ?29 client identity hash stored with the request
    input.notifyOwner ? 1 : 0, // ?30 queue the owner notification
  ]);
  const results = await db.batch<Row & { created: number | null; day_ok: number; hour_ok: number; global_ok: number; number_ok: number }>(
    saveStatements.map((sql) => prepare(sql)),
  );
  const outcome = results[saveStatements.length - 1]?.results[0];
  if (!outcome) throw new Error('E_STORE');
  if (outcome.ref && outcome.created === 1) return { kind: 'created', reference: outcome.ref };
  if (outcome.ref) return { kind: 'existing', previous: previous(outcome)! };
  if (!outcome.day_ok || !outcome.hour_ok) return { kind: 'client-limited' };
  if (!outcome.global_ok) return { kind: 'daily-cap' };
  throw new Error('E_STORE');
}

/** Deletes expired counters and daily totals, at most `purgeBatch` rows each per call; returns the number deleted. */
export async function purgeExpired(db: D1Database, now: number): Promise<number> {
  const [counters, daily] = await db.batch([
    db
      .prepare('DELETE FROM client_counters WHERE rowid IN (SELECT rowid FROM client_counters WHERE created_at < ?1 LIMIT ?2)')
      .bind(now - limits.counterRetentionMs, limits.purgeBatch),
    db.prepare('DELETE FROM intake_daily WHERE rowid IN (SELECT rowid FROM intake_daily WHERE created_at < ?1 LIMIT ?2)').bind(now - limits.dailyRetentionMs, limits.purgeBatch),
  ]);
  return (counters?.meta.changes ?? 0) + (daily?.meta.changes ?? 0);
}
