// Test fixture: the quotation workflow AND the (unapproved, off by default) Turnstile challenge
// enabled, with a clearly fake site key. Swapped in for src/config/quotation.ts only in the
// temporary build of tests/worker/turnstile-build.ts; never used by a committed build.
import { quotationWorkflow as realWorkflow } from '../../../src/config/quotation.ts';

export * from '../../../src/config/quotation.ts';

export const QUOTATION_ON = true;
export const quotationWorkflow = { ...realWorkflow, enabled: true as boolean };
export const TURNSTILE_ON = true;
export const quotationTurnstile = { enabled: true as boolean, siteKey: 'test-site-key-not-real' as string | null };
