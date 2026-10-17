-- Quotation workflow, checkpoint 3: durable email-job processing
-- (docs/PROPOSAL_QUOTATION_WORKFLOW.md §7, §18). Additive: 0001 and 0002 are unchanged.

-- Frozen at a job's first send attempt, together with payload_sha256 (0001): the recipient and
-- the template version the payload was rendered with. Later attempts must render exactly the same
-- payload (same hash) or the job stops for the owner instead of sending different content under
-- the same idempotency key.
ALTER TABLE email_jobs ADD COLUMN to_address TEXT;
ALTER TABLE email_jobs ADD COLUMN template_version TEXT;

-- A job's identity never changes, and its snapshot (recipient, template version, payload hash)
-- and provider message id can be set once but never altered.
CREATE TRIGGER email_jobs_immutable BEFORE UPDATE ON email_jobs
WHEN NEW.id IS NOT OLD.id OR NEW.kind IS NOT OLD.kind OR NEW.request_id IS NOT OLD.request_id
  OR NEW.quote_id IS NOT OLD.quote_id OR NEW.link_generation IS NOT OLD.link_generation
  OR NEW.resend_seq IS NOT OLD.resend_seq OR NEW.idempotency_key IS NOT OLD.idempotency_key
  OR NEW.created_at IS NOT OLD.created_at
  OR (OLD.payload_sha256 IS NOT NULL AND NEW.payload_sha256 IS NOT OLD.payload_sha256)
  OR (OLD.to_address IS NOT NULL AND NEW.to_address IS NOT OLD.to_address)
  OR (OLD.template_version IS NOT NULL AND NEW.template_version IS NOT OLD.template_version)
  OR (OLD.provider_message_id IS NOT NULL AND NEW.provider_message_id IS NOT OLD.provider_message_id)
BEGIN
  SELECT RAISE(ABORT, 'email job identity and snapshot are immutable');
END;

-- What the owner confirmed at approval (recipient, scope, amount, validity, expiry) never changes.
CREATE TRIGGER quotes_snapshot_immutable BEFORE UPDATE ON quotes
WHEN OLD.approved_at IS NOT NULL AND (
  NEW.request_id IS NOT OLD.request_id OR NEW.ref IS NOT OLD.ref OR NEW.approved_at IS NOT OLD.approved_at
  OR NEW.snap_name IS NOT OLD.snap_name OR NEW.snap_email IS NOT OLD.snap_email
  OR NEW.snap_scope IS NOT OLD.snap_scope OR NEW.snap_amount_centavos IS NOT OLD.snap_amount_centavos
  OR NEW.snap_validity_days IS NOT OLD.snap_validity_days OR NEW.expires_at IS NOT OLD.expires_at)
BEGIN
  SELECT RAISE(ABORT, 'an approved quotation snapshot is immutable');
END;
