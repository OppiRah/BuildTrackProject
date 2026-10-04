// Browser-test fixture: the real inquiry config with a synthetic, non-routable endpoint
// and a short time limit. Swapped in for src/config/inquiry.ts only in temporary test
// builds (tests/browser/inquiry-form.ts); never imported by the site itself.
import { formProvider as realProvider } from '../../../src/config/inquiry.ts';

export * from '../../../src/config/inquiry.ts';

export const TEST_ENDPOINT = 'https://form-test.invalid/f/browser-test';

export const formProvider = { ...realProvider, endpoint: TEST_ENDPOINT as string | null, timeoutMs: 1500 };
