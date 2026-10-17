-- Quotation workflow, checkpoint 4: customer links and simulated checkout
-- (docs/PROPOSAL_QUOTATION_WORKFLOW.md §4, §5, §8, §18). Additive.

-- Every customer link ever issued, by the SHA-256 of its token (the token itself is never
-- stored). Lets the public Worker tell a genuine but superseded, revoked or expired link from an
-- unknown one; only the holder of a genuine 256-bit token can learn that, and the answer carries
-- no customer details. Approval inserts generation 1 in its batch. Deleted with the quotation.
CREATE TABLE quote_links (
  token_hash TEXT PRIMARY KEY,
  quote_id TEXT NOT NULL,
  link_generation INTEGER NOT NULL CHECK (link_generation >= 1),
  link_key_version INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  revoked_at INTEGER,
  UNIQUE (quote_id, link_generation)
);

-- Simulated checkout outcomes (§8). Labelled simulated by construction; there is no amount paid,
-- payer, card or bank column, and recording one never changes the quotation's status (there is
-- no "paid" state). attempt_id is the browser's id for one outcome click, so a repeated request
-- records nothing new. Deleted with the quotation.
CREATE TABLE simulated_checkouts (
  id TEXT PRIMARY KEY,
  quote_id TEXT NOT NULL,
  attempt_id TEXT NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('card', 'bank')),
  outcome TEXT NOT NULL CHECK (outcome IN ('success', 'failure', 'cancelled')),
  created_at INTEGER NOT NULL,
  simulated INTEGER NOT NULL DEFAULT 1 CHECK (simulated = 1),
  UNIQUE (quote_id, attempt_id)
);
CREATE INDEX simulated_checkouts_quote ON simulated_checkouts (quote_id, created_at);
