-- Quotation workflow: owner lifecycle actions and retention (docs/PROPOSAL_QUOTATION_WORKFLOW.md
-- §5, §11, §17, §18 "Local completion"). Additive.

-- last_activity_at: the authoritative "last activity" for the 90-day retention (§11). Set when the
-- request is stored, and updated only by owner actions (draft, save, approve, resend, revoke, new
-- link, dismiss) and by customer actions that change something (accept, decline, a newly recorded
-- simulated outcome). Views, retries and repeats that change nothing never update it, and customer
-- actions are only possible before the quotation's link expires, so the public cannot extend
-- retention indefinitely.
-- last_action: the random id of the owner or retention action whose batch last touched the request,
-- so later statements in the same batch act only if it is theirs.
ALTER TABLE quote_requests ADD COLUMN last_activity_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE quote_requests ADD COLUMN last_action TEXT;
UPDATE quote_requests SET last_activity_at = MAX(created_at, updated_at) WHERE last_activity_at = 0;
CREATE INDEX quote_requests_activity ON quote_requests (last_activity_at);
CREATE INDEX email_jobs_request ON email_jobs (request_id);
CREATE INDEX quote_events_request ON quote_events (request_id);
