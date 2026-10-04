// Browser-test fixture: the real inquiry config with no endpoint, so the test can check
// the "not yet connected" state whatever the real config holds. Test builds only.
import { formProvider as realProvider } from '../../../src/config/inquiry.ts';

export * from '../../../src/config/inquiry.ts';

export const formProvider = { ...realProvider, endpoint: null as string | null };
