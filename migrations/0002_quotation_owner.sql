-- Quotation workflow, checkpoint 2: owner review, draft quotations and approval
-- (docs/PROPOSAL_QUOTATION_WORKFLOW.md §5, §7, §9, §16, §18). Additive: 0001 is unchanged.
-- Times are UTC milliseconds since the epoch. Amounts are integer centavos (PHP).

-- One quotation per request. Drafts are edited by the owner; approval freezes a snapshot of
-- exactly what the confirmation page showed, records the customer-link hash and queues one
-- quotation email job in the same batch. The link token itself is never stored.
CREATE TABLE quotes (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL UNIQUE,
  ref TEXT NOT NULL UNIQUE,
  ref_year INTEGER NOT NULL,
  ref_seq INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'approved', 'emailed', 'accepted', 'declined', 'expired', 'revoked')),
  -- Increases with every owner change; forms carry the version they were rendered from, so a
  -- stale form or a second submission changes nothing.
  version INTEGER NOT NULL CHECK (version >= 1),
  -- length() counts characters, as the owner form's validation does.
  scope_text TEXT NOT NULL CHECK (length(scope_text) BETWEEN 10 AND 2000),
  amount_centavos INTEGER NOT NULL CHECK (amount_centavos BETWEEN 100 AND 1000000000),
  currency TEXT NOT NULL DEFAULT 'PHP' CHECK (currency = 'PHP'),
  validity_days INTEGER NOT NULL CHECK (validity_days BETWEEN 1 AND 30),
  -- Random id of the owner action whose batch last changed this row; later statements in that
  -- batch act only if it is theirs (the approval_id pattern of §7).
  last_action TEXT,
  link_key_version INTEGER,
  link_generation INTEGER NOT NULL DEFAULT 0,
  -- hex SHA-256 of the customer-link token (§4); NULL while a draft or after revocation.
  token_hash TEXT UNIQUE,
  expires_at INTEGER,
  -- Frozen at approval: what the owner confirmed and what the email will contain.
  snap_name TEXT,
  snap_email TEXT,
  snap_scope TEXT,
  snap_amount_centavos INTEGER,
  snap_validity_days INTEGER,
  approved_at INTEGER,
  approved_by TEXT,
  emailed_at INTEGER,
  accepted_at INTEGER,
  declined_at INTEGER,
  revoked_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (ref_year, ref_seq),
  CHECK ((status = 'draft') = (approved_at IS NULL))
);

-- One row per year: the last quotation reference number issued (BT-Q-<year>-<seq>).
CREATE TABLE quote_ref_sequences (
  year INTEGER PRIMARY KEY,
  last_seq INTEGER NOT NULL,
  last_attempt TEXT
);

-- What happened to a quotation, by whom. No request bodies, form values or tokens.
CREATE TABLE quote_events (
  id TEXT PRIMARY KEY,
  quote_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  actor TEXT NOT NULL CHECK (actor IN ('owner', 'customer', 'system')),
  -- accepted/declined (customer) added at checkpoint 4, and revoked/link_replaced/resent (owner) at
  -- local completion, revising this file in place: it has only ever been applied to throwaway
  -- test databases.
  event TEXT NOT NULL CHECK (event IN ('created', 'saved', 'approved', 'accepted', 'declined', 'revoked', 'link_replaced', 'resent')),
  version INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX quote_events_quote ON quote_events (quote_id, created_at);

-- Owner form tokens already used (§16). Tokens are signed, not stored when issued, so owner GET
-- pages write nothing; a token is recorded here, by its SHA-256, inside the same batch as the
-- change it authorizes, which makes it single-use. No personal data. Rows can be deleted once
-- expired (housekeeping comes with the retention checkpoint).
CREATE TABLE used_form_tokens (
  token_hash TEXT PRIMARY KEY,
  attempt TEXT NOT NULL,
  used_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX used_form_tokens_expires ON used_form_tokens (expires_at);
