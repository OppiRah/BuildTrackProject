import { describe, expect, it } from 'vitest';
import { requestTypes } from '../src/config/inquiry.ts';
import { plans } from '../src/config/pricing.ts';
import { services } from '../src/config/services.ts';
import { primaryCta } from '../src/config/site.ts';
import { contactHref } from '../src/lib/contact-links.ts';

describe('contactHref', () => {
  it('links to the bare Contact page without a selection', () => {
    expect(contactHref()).toBe('/contact/');
  });

  it('encodes request type, service and plan in a stable order', () => {
    expect(contactHref({ plan: 'enterprise', type: 'quotation', service: 'custom-integration' })).toBe(
      '/contact/?type=quotation&service=custom-integration&plan=enterprise',
    );
  });

  it('produces only allowlisted values for every configured option', () => {
    const allowed = {
      type: new Set<string>(requestTypes.map((item) => item.id)),
      service: new Set<string>(services.map((item) => item.id)),
      plan: new Set<string>(plans.map((item) => item.id)),
    };
    const links = [
      ...requestTypes.map((item) => contactHref({ type: item.id })),
      ...services.map((item) => contactHref({ type: 'quotation', service: item.id })),
      ...plans.map((item) => contactHref({ type: 'service', plan: item.id })),
      primaryCta.href,
    ];
    for (const link of links) {
      const url = new URL(link, 'https://example.invalid');
      expect(url.pathname).toBe('/contact/');
      for (const [key, value] of url.searchParams) {
        expect(Object.keys(allowed)).toContain(key);
        expect(allowed[key as keyof typeof allowed].has(value)).toBe(true);
      }
    }
  });
});
