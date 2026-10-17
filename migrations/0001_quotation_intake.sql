-- Quotation workflow, checkpoint 1: request intake (docs/PROPOSAL_QUOTATION_WORKFLOW.md §6, §7, §9, §18).
-- Times are UTC milliseconds since the epoch. Later checkpoints add quotes, events,
-- confirmation nonces and simulated checkouts in further, additive migrations.
-- (Revised in place three times on 2026-10-16 after reviews; it has only ever been applied to throwaway test databases.)

-- One row per quotation request. Personal fields are stored trimmed, exactly as validated;
-- they are only ever rendered escaped (owner pages) and never logged.
-- payload_hash, dedupe_key and client_hash are keyed hashes (INTAKE_HMAC_KEY, version in
-- hash_key_version): pseudonymous data, deleted with the request. client_hash identifies the
-- submitting client (not per day), so an identical retry reveals the reference only to that client.
CREATE TABLE quote_requests (
  id TEXT PRIMARY KEY,
  ref TEXT NOT NULL UNIQUE,
  ref_year INTEGER NOT NULL,
  ref_seq INTEGER NOT NULL,
  -- JSON submissions: the client's idempotency id; a retry must carry an identical payload.
  submission_id TEXT UNIQUE,
  -- Native (no-JS) submissions: keyed hash of client identity and the full payload, so only an
  -- identical resubmission from the same client within the window is treated as a duplicate.
  dedupe_key TEXT,
  payload_hash TEXT NOT NULL,
  client_hash TEXT NOT NULL,
  hash_key_version TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('js', 'native')),
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'quoted', 'dismissed')),
  service TEXT NOT NULL,
  plan TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  organization TEXT NOT NULL,
  phone TEXT NOT NULL,
  organization_type TEXT NOT NULL,
  project_need TEXT NOT NULL,
  message TEXT NOT NULL,
  privacy_ack_version TEXT NOT NULL,
  -- 1 when the daily owner-notification cap was reached: stored, shown to the owner, not notified.
  flagged INTEGER NOT NULL DEFAULT 0 CHECK (flagged IN (0, 1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (ref_year, ref_seq),
  CHECK ((source = 'js') = (submission_id IS NOT NULL)),
  CHECK ((source = 'native') = (dedupe_key IS NOT NULL))
);
CREATE INDEX quote_requests_dedupe ON quote_requests (dedupe_key, created_at);
CREATE INDEX quote_requests_created ON quote_requests (created_at);
CREATE INDEX quote_requests_updated ON quote_requests (updated_at);

-- Durable email jobs (§7). Intake queues one owner notification per request; the owner
-- Worker sends them in a later checkpoint. The idempotency key is fixed at creation.
CREATE TABLE email_jobs (
  id TEXT PRIMARY KEY,
  -- owner_cap_warning: at most one per UTC day (idempotency key bt-cap-<day>), created from
  -- intake_daily.cap_reached_at once email delivery exists; never one per refused request.
  kind TEXT NOT NULL CHECK (kind IN ('owner_notification', 'owner_cap_warning', 'quotation')),
  request_id TEXT,
  quote_id TEXT,
  link_generation INTEGER,
  resend_seq INTEGER NOT NULL DEFAULT 0,
  idempotency_key TEXT NOT NULL UNIQUE CHECK (length(idempotency_key) BETWEEN 1 AND 256),
  status TEXT NOT NULL CHECK (status IN ('queued', 'sending', 'retry_wait', 'provider_accepted', 'needs_owner', 'cancelled')),
  attempts INTEGER NOT NULL DEFAULT 0,
  ambiguous INTEGER NOT NULL DEFAULT 0 CHECK (ambiguous IN (0, 1)),
  first_attempt_at INTEGER,
  next_attempt_at INTEGER NOT NULL,
  lease_id TEXT,
  lease_until INTEGER,
  payload_sha256 TEXT,
  provider_message_id TEXT,
  last_result TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (quote_id, kind, link_generation, resend_seq)
);
CREATE INDEX email_jobs_due ON email_jobs (status, next_attempt_at);

-- Per-client request counters. key_hash is a keyed hash (INTAKE_HMAC_KEY) of the client's
-- rate-limit identity and the UTC day: pseudonymous data, never the address itself. The public
-- Worker's scheduled cleanup deletes rows 48 hours after creation. last_attempt is the id of the
-- request whose batch last incremented the row, so later statements in that same batch can tell
-- whether its reservation succeeded (worker/public/store.ts).
CREATE TABLE client_counters (
  key_hash TEXT NOT NULL,
  bucket TEXT NOT NULL,
  count INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  last_attempt TEXT,
  PRIMARY KEY (key_hash, bucket)
);
CREATE INDEX client_counters_created ON client_counters (created_at);

-- One row per year: the last request reference number issued (BT-R-<year>-<seq>), so allocating a
-- reference is a single primary-key update instead of a scan of that year's requests. Numbers
-- are taken inside the same batch that stores the request, so a rolled-back save takes none.
CREATE TABLE ref_sequences (
  year INTEGER PRIMARY KEY,
  last_seq INTEGER NOT NULL,
  last_attempt TEXT
);

-- One row per UTC day: new requests stored (the global cap), owner notifications queued, and
-- when the cap was first reached (the hook for one owner warning per day). No personal data.
-- Deleted by the scheduled cleanup 8 days after creation.
CREATE TABLE intake_daily (
  day TEXT PRIMARY KEY,
  requests INTEGER NOT NULL,
  notifications INTEGER NOT NULL,
  cap_reached_at INTEGER,
  last_attempt TEXT,
  created_at INTEGER NOT NULL
);
