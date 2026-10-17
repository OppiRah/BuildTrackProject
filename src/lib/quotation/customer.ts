// Customer quotation links: shared by the public Worker's /api/quote/* (worker/public/quote.ts)
// and the /quote/ page script (src/scripts/quote.ts). Pure; docs/PROPOSAL_QUOTATION_WORKFLOW.md
// §4, §5, §8 and §18 (checkpoint 4).

/** "v<key version>.<43 base64url characters>" (quote-link.ts). */
export const LINK_TOKEN = /^v[1-9]\d{0,5}\.[A-Za-z0-9_-]{43}$/;
export const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export type LinkProblem = 'invalid' | 'expired' | 'revoked' | 'superseded';

/** What a link holder is told; no reference, name or amount, so nothing is revealed about the quotation. */
export const linkMessages: Record<LinkProblem, string> = {
  invalid: 'This quotation link is not valid. Open the complete link from your BuildTrack email, or contact BuildTrack.',
  expired: 'This quotation link has expired. Contact BuildTrack if you still need a quotation.',
  revoked: 'BuildTrack has withdrawn this quotation link. Contact BuildTrack if you have questions.',
  superseded: 'BuildTrack has sent you a newer link for this quotation. Use the link in the most recent BuildTrack email.',
};

export type CheckoutMethod = 'card' | 'bank';
export type CheckoutOutcome = 'success' | 'failure' | 'cancelled';
export const checkoutMethods: readonly CheckoutMethod[] = ['card', 'bank'];
export const checkoutOutcomes: readonly CheckoutOutcome[] = ['success', 'failure', 'cancelled'];
/** Labels on the /quote/ demo checkout (the separate /payment-demo/ walkthrough keeps its own). */
export const checkoutMethodLabels: Record<CheckoutMethod, string> = { card: 'Card — demo', bank: 'Bank transfer — demo' };

/** The minimum a link holder sees (§4): the approved snapshot, never draft values. */
export interface QuoteView {
  status: 'open' | 'accepted' | 'declined';
  reference: string;
  requestReference: string;
  firstName: string;
  scope: string;
  amountCentavos: number;
  /** The approved quotation version the customer is shown and accepts. */
  version: number;
  expiresAt: number;
  /** Simulated checkout outcomes recorded so far (accepted quotations only). */
  simulations: { method: CheckoutMethod; outcome: CheckoutOutcome; at: number }[];
}

export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? '';

// ---- Demo code (§8): a presentation interaction only, checked in the browser ---------------
// Not authentication, not payment verification and not evidence of anything. The entry is never
// sent, stored, logged or put in a URL; the backend does not know whether it was entered.
export const DEMO_CODE = '12345678';
export const demoCodeLabel = 'Demo code — enter 12345678';
export const demoCodeError = 'That is not the demo code. Use the sample code 12345678.';
export const isDemoCode = (value: string) => value === DEMO_CODE;
