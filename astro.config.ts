import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';
import { quotationWorkflow } from './src/config/quotation.ts';
import { site } from './src/config/site.ts';
import { quoteRoute } from './src/integrations/quote-route.ts';

// Static output only: no adapter, no SSR.
// The sitemap and canonical URLs need the production URL; until it is set,
// the sitemap is skipped and pages omit canonical links.
export default defineConfig({
  output: 'static',
  site: site.productionUrl ?? undefined,
  trailingSlash: 'always',
  build: { format: 'directory' },
  // /quote/ (built only while the quotation workflow is enabled) is private and never listed.
  integrations: [
    ...(site.productionUrl ? [sitemap({ filter: (page) => !/^\/(quote|academic-demo\/(owner|quote))\//.test(new URL(page).pathname) })] : []),
    // The customer quotation page exists only while the quotation workflow is enabled (off in the
    // committed config); test builds add quoteRoute() themselves.
    ...(quotationWorkflow.enabled ? [quoteRoute()] : []),
  ],
});
