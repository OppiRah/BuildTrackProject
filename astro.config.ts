import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';
import { site } from './src/config/site.ts';

// Static output only: no adapter, no SSR.
// The sitemap and canonical URLs need the production URL; until it is set,
// the sitemap is skipped and pages omit canonical links.
export default defineConfig({
  output: 'static',
  site: site.productionUrl ?? undefined,
  trailingSlash: 'always',
  build: { format: 'directory' },
  integrations: site.productionUrl ? [sitemap()] : [],
});
