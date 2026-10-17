-- Quotation workflow: retention cost repair (Codex consolidated review, 2026-10-17;
-- docs/PROPOSAL_QUOTATION_WORKFLOW.md §11, §18). Additive.

-- Retention deletes old owner cap-warning jobs (worker/owner/retention.ts). Without this index that
-- statement scanned the whole email_jobs table, so its cost grew with the email history. This
-- partial index holds cap-warning jobs only (at most one per UTC day), ordered by creation time.
CREATE INDEX email_jobs_cap_warnings ON email_jobs (created_at) WHERE kind = 'owner_cap_warning';
