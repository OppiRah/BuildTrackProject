// Browser-test fixture: the real site config with a synthetic production URL, to prove that
// configuring a URL does not make the site claim it is published. Test builds only.
import { site as realSite } from '../../../src/config/site.ts';

export * from '../../../src/config/site.ts';

export const site = { ...realSite, productionUrl: 'https://buildtrack-test.invalid' as string | null };
