import type { APIRoute } from 'astro';
import { quotationWorkflow } from '../config/quotation.ts';

// The sitemap line is added once the production URL is configured.
export const GET: APIRoute = ({ site }) => {
  const lines = ['User-agent: *', 'Allow: /'];
  // The customer quotation page exists only while the workflow is enabled; it is never indexed.
  if (quotationWorkflow.enabled) lines.push('Disallow: /quote/');
  if (site) lines.push(`Sitemap: ${new URL('sitemap-index.xml', site).href}`);
  return new Response(`${lines.join('\n')}\n`, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
