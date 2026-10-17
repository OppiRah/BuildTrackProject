// Adds the quotation pages to a build: the request form (/contact/quotation/,
// src/routes/quotation-request.astro) and the customer quotation page (/quote/, src/routes/quote.astro).
// Used by astro.config.ts only while the quotation workflow is enabled (off in the committed config),
// and by test builds directly, so a committed build never processes these pages, their styles or scripts.

import type { AstroIntegration } from 'astro';

export function quoteRoute(): AstroIntegration {
  return {
    name: 'buildtrack-quote-route',
    hooks: {
      'astro:config:setup': ({ injectRoute }) => {
        injectRoute({ pattern: '/contact/quotation', entrypoint: new URL('../routes/quotation-request.astro', import.meta.url) });
        injectRoute({ pattern: '/quote', entrypoint: new URL('../routes/quote.astro', import.meta.url) });
      },
    },
  };
}
