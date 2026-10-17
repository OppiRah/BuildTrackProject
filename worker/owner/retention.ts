// Application retention (docs/PROPOSAL_QUOTATION_WORKFLOW.md §11, §17; approved 2026-10-16: 90 days
// after last activity). Runs on the owner Worker's schedule, in bounded batches per run.
//
// - Requests: deleted whole (with their quotation, links, simulated outcomes, events, email jobs and,
//   by trigger, attempt history) once `quote_requests.last_activity_at` is more than 90 days ago.
//   last_activity_at is set at intake and moved only by owner actions and by customer actions that
//   change something (store.ts, worker/public/quote.ts); views and repeats never move it. A request
//   whose email is being sent right now is skipped and retried on a later run.
// - Used owner form tokens: deleted 1 day after they expired (hashes only, no personal data).
// - Cap-warning email jobs (no request; owner address only): deleted 90 days after creation, with
//   their attempt history (trigger), unless a runner holds a live lease on one right now. A job left
//   in `sending` by a runner that vanished (its lease expired) is deleted too: lease recovery only
//   runs while sending is on, so otherwise it would be kept forever. Read through the partial index
//   email_jobs_cap_warnings (migration 0007), never by scanning the email history.
// - Kept: the per-year reference counters (ref_sequences, quote_ref_sequences: year and last
//   number only), so references are never reused. Rate-limit counters and daily totals are purged by
//   the public Worker (48 hours / 8 days).
// Outside the application's control, and not promised: emails already sent (recipients' mailboxes,
// the email provider's own retention), and D1's point-in-time recovery copies (Time Travel).

import type { D1Database } from '../../src/lib/quotation/d1.ts';
import { purgeRequest } from './store.ts';

const DAY = 24 * 60 * 60 * 1000;

export const retentionPolicy = {
  /** Approved 2026-10-16. */
  days: 90,
  /** Each request is one 7-statement batch: 5 requests + 3 statements = 38, under the Workers Free
   * plan's 50 D1 queries per invocation (statements in a batch are assumed to count separately). */
  requestsPerRun: 5,
  tokensPerRun: 500,
  capWarningsPerRun: 100,
};

/**
 * ?1 cutoff, ?2 limit, ?3 now. A lease counts as live until it has strictly expired (the sender's
 * recovery uses the same `lease_until < now`). One statement, so a runner claiming the job at the
 * same moment either sees it deleted or keeps it (a fresh lease is live). Deleted jobs are counted
 * from RETURNING: on D1, `meta.changes` also counts the attempt rows the trigger deletes.
 * Exported for plan tests.
 */
export const capWarningRetentionSql = `DELETE FROM email_jobs WHERE rowid IN (SELECT rowid FROM email_jobs
  WHERE kind = 'owner_cap_warning' AND created_at < ?1 AND (status <> 'sending' OR lease_until < ?3) LIMIT ?2) RETURNING id`;

export interface RetentionSummary {
  requestsDeleted: number;
  requestsSkipped: number;
  formTokensDeleted: number;
  capWarningsDeleted: number;
}

export async function runRetention(db: D1Database, now: number): Promise<RetentionSummary> {
  const cutoff = now - retentionPolicy.days * DAY;
  const candidates = await db
    .prepare('SELECT id FROM quote_requests WHERE last_activity_at < ?1 ORDER BY last_activity_at LIMIT ?2')
    .bind(cutoff, retentionPolicy.requestsPerRun)
    .all<{ id: string }>();
  let requestsDeleted = 0;
  for (const { id } of candidates.results) if (await purgeRequest(db, id, now, cutoff)) requestsDeleted++;
  const tokens = await db
    .prepare('DELETE FROM used_form_tokens WHERE rowid IN (SELECT rowid FROM used_form_tokens WHERE expires_at < ?1 LIMIT ?2)')
    .bind(now - DAY, retentionPolicy.tokensPerRun)
    .run();
  const warnings = await db.prepare(capWarningRetentionSql).bind(cutoff, retentionPolicy.capWarningsPerRun, now).all<{ id: string }>();
  return {
    requestsDeleted,
    requestsSkipped: candidates.results.length - requestsDeleted,
    formTokensDeleted: tokens.meta.changes,
    capWarningsDeleted: warnings.results.length,
  };
}
