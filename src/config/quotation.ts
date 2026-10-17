// Quotation workflow settings (ADR-043, docs/PROPOSAL_QUOTATION_WORKFLOW.md).
// `enabled` stays false in the committed config: Contact then behaves exactly as before and
// /contact/quotation/ is not built. Test builds swap in tests/browser/fixtures/quotation-enabled.ts.
// The backend has its own kill switch (the Worker var WORKFLOW_ENABLED).

/**
 * Compile-time switch: a literal, so a committed (off) build contains none of the quotation-only
 * client code (src/components/form/InquiryForm.astro picks the published form script). Test and
 * presentation builds swap in tests/browser/fixtures/quotation-enabled.ts, which sets it to true.
 */
export const QUOTATION_ON = false;

export const quotationWorkflow = {
  enabled: QUOTATION_ON as boolean,
  /** Same-origin path of the public Worker's intake endpoint (JSON and native form posts). */
  endpoint: '/api/quotation-requests',
  /** Canonical quotation request page. */
  pagePath: '/contact/quotation/',
  timeoutMs: 15000,
};

/**
 * Customer-route readiness (checkpoint 3 review). Quotation emails link to the customer quotation
 * page (/quote/), which is not built yet. Until that page exists and has been verified, quotation
 * email jobs stay queued: they are never claimed or sent, whatever mail settings or credentials
 * exist. Owner notifications and cap warnings are unaffected. This is a committed constant, not an
 * environment variable, so it changes only through a reviewed code change.
 */
export const customerRoutes = {
  ready: false as boolean,
};

/**
 * Turnstile challenge on /contact/quotation/ (prepared, OFF; docs/PROPOSAL_QUOTATION_WORKFLOW.md §18).
 * Turning it on requires a Turnstile widget (site key here, secret as the public Worker's
 * TURNSTILE_SECRET_KEY, TURNSTILE_ENABLED=on) AND the owner's decision to end no-JS quotation intake:
 * with it on, no-JS visitors are refused with phone guidance. While off, nothing is rendered or loaded.
 */
/** Compile-time switch for the page script: a literal `false`, so committed builds contain none of its code. */
export const TURNSTILE_ON = false;
export const quotationTurnstile = {
  enabled: TURNSTILE_ON as boolean,
  siteKey: null as string | null,
};

/** Owner-approved defaults (2026-10-16). */
export const quotationDefaults = {
  retentionDays: 90,
  linkValidityDays: 14,
  bankTransferLabel: 'Bank transfer (simulated)',
} as const;

/**
 * Quotation privacy acknowledgment. Approved by the owner on 2026-10-17 (manual email release,
 * including the seven-day backup clarification). The page shows a draft marker only while `status`
 * is 'draft'. `version` is stored with each request.
 */
export const quotationPrivacyNotice = {
  status: 'approved' as 'draft' | 'approved',
  version: '2026-10-17-manual',
  acknowledgment:
    'I understand my details will be stored by BuildTrack on Cloudflare and used to review my request and, if a quotation is approved, to email me a private link to it from BuildTrack’s own email account. BuildTrack deletes its quotation records 90 days after the last activity; Cloudflare’s automatic database backups may keep a copy for up to 7 more days, and emails already sent stay in the sender’s and my mailboxes.',
  guidance: 'Only include details needed for this request. Do not enter payment or card details.',
};
