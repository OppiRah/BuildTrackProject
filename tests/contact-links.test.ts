import { describe, expect, it } from 'vitest';
import { requestTypes } from '../src/config/inquiry.ts';
import { plans } from '../src/config/pricing.ts';
import { services } from '../src/config/services.ts';
import { primaryCta } from '../src/config/site.ts';
import { contactHref, quotationJourneyHref } from '../src/lib/contact-links.ts';

describe('contactHref', () => {
  it('links to the bare Contact page without a selection', () => {
    expect(contactHref()).toBe('/contact/');
  });

  it('encodes request type, service and plan in a stable order', () => {
    expect(contactHref({ plan: 'enterprise', type: 'quotation', service: 'custom-integration' })).toBe(
      '/contact/?type=quotation&service=custom-integration&plan=enterprise',
    );
  });

  it('keeps quotation links on Contact while the quotation workflow is off (the committed default)', () => {
    expect(contactHref({ type: 'quotation', service: 'custom-integration' })).toBe(
      '/contact/?type=quotation&service=custom-integration',
    );
  });

  it('sends quotation links to the quotation page with only service and plan while the workflow is on', () => {
    expect(contactHref({ type: 'quotation', service: 'custom-integration', plan: 'enterprise' }, true)).toBe(
      '/contact/quotation/?service=custom-integration&plan=enterprise',
    );
    expect(contactHref({ type: 'quotation' }, true)).toBe('/contact/quotation/');
    expect(contactHref({ type: 'demo' }, true)).toBe('/contact/?type=demo');
    expect(contactHref({ type: 'service', plan: 'starter' }, true)).toBe('/contact/?type=service&plan=starter');
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

describe('quotationJourneyHref (Home and Pricing quotation CTAs)', () => {
  it('opens the academic quotation demo with service and plan while the workflow is off (the committed default)', () => {
    expect(quotationJourneyHref()).toBe('/academic-demo/');
    expect(quotationJourneyHref({ plan: 'professional' })).toBe('/academic-demo/?plan=professional');
    expect(quotationJourneyHref({ plan: 'starter', service: 'delivery-monitoring' })).toBe('/academic-demo/?service=delivery-monitoring&plan=starter');
  });

  it('opens the real quotation page while the workflow is on', () => {
    expect(quotationJourneyHref({ plan: 'enterprise' }, true)).toBe('/contact/quotation/?plan=enterprise');
  });
});
