-- Quotation workflow: manual email release mode (docs/PROPOSAL_QUOTATION_WORKFLOW.md §18, "Manual
-- email release mode"; 2026-10-17). Additive.
--
-- In manual mode BuildTrack sends no email: the owner prepares the customer invitation on the owner
-- page and sends it from their own email account. The owner may record that they did so. This is
-- the owner's statement only ("Marked sent by owner"); it proves nothing about delivery, and the
-- customer's link works whether or not it is set.
--   manual_sent_generation  the link generation the owner marked as sent (a new link generation
--                           is therefore unmarked until the owner marks it again)
--   manual_sent_at          when the owner marked it
ALTER TABLE quotes ADD COLUMN manual_sent_generation INTEGER;
ALTER TABLE quotes ADD COLUMN manual_sent_at INTEGER;
