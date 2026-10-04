import { describe, expect, it } from 'vitest';
import { parsePreselection } from '../src/lib/inquiry-params.ts';
import { contactHref } from '../src/lib/contact-links.ts';

describe('parsePreselection', () => {
  it('accepts exact allowlisted values', () => {
    expect(parsePreselection('?type=quotation&service=equipment-tracking&plan=professional')).toEqual({
      type: 'quotation',
      service: 'equipment-tracking',
      plan: 'professional',
    });
  });

  it('round-trips every link built by contactHref', () => {
    const href = contactHref({ type: 'service', plan: 'enterprise' });
    expect(parsePreselection(new URL(href, 'https://example.invalid').search)).toEqual({
      type: 'service',
      plan: 'enterprise',
    });
  });

  it('selects nothing without parameters', () => {
    expect(parsePreselection('')).toEqual({});
  });

  it.each([
    ['unknown', '?type=purchase&service=drones&plan=gold'],
    ['empty', '?type=&service=&plan='],
    ['differently cased', '?type=Demo&service=Equipment-Tracking&plan=STARTER'],
    ['padded', '?type=%20demo&plan=starter%20'],
    ['repeated', '?type=demo&type=quotation&plan=starter&plan=starter'],
    ['script-like', '?type=%3Cscript%3Ealert(1)%3C%2Fscript%3E&service=%22%3E%3Cimg%20src%3Dx%3E'],
    ['other keys', '?request_type=demo&subject=hi&__proto__=demo'],
  ])('ignores %s values', (_name, search) => {
    expect(parsePreselection(search)).toEqual({});
  });

  it('keeps valid values when others are invalid', () => {
    expect(parsePreselection('?type=demo&service=nope&plan=starter')).toEqual({ type: 'demo', plan: 'starter' });
  });

  it('infers Avail a Service from a plan when no type is given', () => {
    expect(parsePreselection('?plan=starter')).toEqual({ type: 'service', plan: 'starter' });
  });

  it('infers Request a Quotation from a service when no type is given', () => {
    expect(parsePreselection('?service=onboarding-training')).toEqual({
      type: 'quotation',
      service: 'onboarding-training',
    });
  });

  it('lets a plan take precedence over a service for inference', () => {
    expect(parsePreselection('?service=custom-integration&plan=enterprise').type).toBe('service');
  });

  it('never overrides an explicit valid type', () => {
    expect(parsePreselection('?type=demo&plan=starter').type).toBe('demo');
  });

  it('infers from a valid plan even when the given type is invalid', () => {
    expect(parsePreselection('?type=bogus&plan=starter').type).toBe('service');
  });
});
