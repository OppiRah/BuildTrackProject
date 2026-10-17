-- Quotation workflow, checkpoint 3 review: durable email attempt history
-- (docs/PROPOSAL_QUOTATION_WORKFLOW.md §7, §18). Additive: earlier migrations are unchanged.
-- (Revised in place on 2026-10-16 after review, adding send_intent_at; it has only ever been
-- applied to throwaway test databases.)
--
-- One row per claimed attempt, written in the same batch as the claim, so a runner that crashes
-- right after claiming still leaves a record. Holds no recipient, content, link token or secret:
-- only ids, times and fixed outcome codes.
--   id                  the attempt's lease id (random)
--   attempt             the job's attempt number
--   send_intent_at      set just before the final pre-send checks, only by the lease holder: from
--                       here the runner may call the provider. An attempt that ends with this set
--                       and no outcome (a crash) may have called it.
--   provider_called_at  set when the attempt is closed after the transport was actually invoked
--                       (NULL: the transport was not invoked by this attempt, or the runner never
--                       reported back)
--   finished_at/outcome set when the attempt ends. A knowingly skipped send records its reason
--                       (E_WINDOW_CLOSED, E_QUOTE_EXPIRED, E_LEASE_TOO_SHORT). A crashed attempt
--                       is closed when its lease is recovered: E_LEASE_EXPIRED if a send intent
--                       was recorded (outcome unknown), E_LEASE_EXPIRED_BEFORE_SEND if not.
-- Retention: an attempt lives exactly as long as its job (deleted with it by the trigger below).
CREATE TABLE email_attempts (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  attempt INTEGER NOT NULL CHECK (attempt >= 1),
  started_at INTEGER NOT NULL,
  send_intent_at INTEGER,
  provider_called_at INTEGER,
  finished_at INTEGER,
  outcome TEXT CHECK (outcome IS NULL OR outcome GLOB 'E_*' OR outcome = 'OK_ACCEPTED'),
  UNIQUE (job_id, attempt),
  CHECK (provider_called_at IS NULL OR send_intent_at IS NOT NULL)
);

CREATE TRIGGER email_attempts_follow_job AFTER DELETE ON email_jobs
BEGIN
  DELETE FROM email_attempts WHERE job_id = OLD.id;
END;
