import { describe, expect, it } from 'vitest';
import { providerSandbox } from '../src/config/payment-sandbox.ts';
import { sandboxLink } from '../src/lib/payment-sandbox.ts';
import { initialPaymentState, outcomeMessages, reducePayment, type PaymentAction, type PaymentState } from '../src/lib/payment-walkthrough.ts';

const run = (...actions: PaymentAction[]): PaymentState => actions.reduce(reducePayment, initialPaymentState);

describe('payment walkthrough', () => {
  it('goes quotation → accept → method → choose → confirm → outcome → result', () => {
    expect(run({ type: 'accept' })).toEqual({ step: 'method', method: null, outcome: null });
    expect(run({ type: 'accept' }, { type: 'choose', method: 'bank' })).toEqual({ step: 'confirm', method: 'bank', outcome: null });
    for (const outcome of ['success', 'failure', 'cancelled'] as const) {
      expect(run({ type: 'accept' }, { type: 'choose', method: 'card' }, { type: 'outcome', outcome })).toEqual({ step: 'result', method: 'card', outcome });
    }
  });

  it('can decline the quotation, go back to the method choice and restart', () => {
    expect(run({ type: 'decline' }).step).toBe('declined');
    expect(run({ type: 'accept' }, { type: 'choose', method: 'card' }, { type: 'back' })).toEqual({ step: 'method', method: null, outcome: null });
    expect(run({ type: 'accept' }, { type: 'choose', method: 'card' }, { type: 'outcome', outcome: 'success' }, { type: 'restart' })).toEqual(initialPaymentState);
  });

  it('ignores actions that do not fit the current step (no outcome without accepting and choosing)', () => {
    expect(run({ type: 'outcome', outcome: 'success' })).toEqual(initialPaymentState);
    expect(run({ type: 'choose', method: 'card' })).toEqual(initialPaymentState);
    expect(run({ type: 'decline' }, { type: 'accept' }).step).toBe('declined');
    const done = run({ type: 'accept' }, { type: 'choose', method: 'card' }, { type: 'outcome', outcome: 'failure' });
    expect(reducePayment(done, { type: 'outcome', outcome: 'success' })).toEqual(done);
  });

  it('says every outcome is simulated and never claims provider verification', () => {
    for (const { title, text } of Object.values(outcomeMessages)) {
      expect(title).toMatch(/^Simulated /);
      expect(text).toMatch(/simulation/i);
      expect(text).toMatch(/No money moved/);
      expect(`${title} ${text}`).not.toMatch(/\b(verified|confirmed|received) (by|with)\b|\bpayment (is|was) (verified|confirmed)\b/i);
    }
  });
});

describe('provider sandbox link', () => {
  const ok = { provider: 'paymongo', testLinkUrl: 'https://pm.link/sample-shop/test/AbC123', verifiedTestMode: true };
  const reject = (testLinkUrl: string, overrides: Partial<typeof ok> = {}) => sandboxLink({ ...ok, testLinkUrl, ...overrides });

  it('is not connected by default (no invented link)', () => {
    expect(providerSandbox).toEqual({ provider: null, testLinkUrl: null, verifiedTestMode: false });
    expect(sandboxLink(providerSandbox)).toBeNull();
  });

  it('accepts the documented PayMongo test Payment Link format when the owner marked it verified', () => {
    expect(sandboxLink(ok)).toEqual({ url: 'https://pm.link/sample-shop/test/AbC123', providerName: 'PayMongo' });
    expect(sandboxLink({ ...ok, testLinkUrl: 'https://pm.link/shop_2/test/9z' })).toEqual({ url: 'https://pm.link/shop_2/test/9z', providerName: 'PayMongo' });
  });

  it('still needs the owner verification and a supported provider', () => {
    expect(sandboxLink({ ...ok, verifiedTestMode: false })).toBeNull();
    expect(sandboxLink({ ...ok, provider: null })).toBeNull();
    expect(sandboxLink({ ...ok, provider: 'Example provider' })).toBeNull();
    expect(sandboxLink({ ...ok, provider: 'toString' })).toBeNull();
    expect(sandboxLink({ ...ok, provider: '__proto__' })).toBeNull();
  });

  it.each([
    ['live route (no /test/)', 'https://pm.link/sample-shop/AbC123'],
    ['live-looking route', 'https://pm.link/sample-shop/live/AbC123'],
    ['plain http', 'http://pm.link/sample-shop/test/AbC123'],
    ['look-alike subdomain host', 'https://pm.link.example.com/sample-shop/test/AbC123'],
    ['look-alike prefix host', 'https://evilpm.link/sample-shop/test/AbC123'],
    ['provider host as a subdomain', 'https://pay.pm.link/sample-shop/test/AbC123'],
    ['host only in the credentials', 'https://pm.link@example.com/sample-shop/test/AbC123'],
    ['credentials', 'https://user:secret@pm.link/sample-shop/test/AbC123'],
    ['username only', 'https://user@pm.link/sample-shop/test/AbC123'],
    ['unexpected port', 'https://pm.link:8443/sample-shop/test/AbC123'],
    ['explicit default port', 'https://pm.link:443/sample-shop/test/AbC123'],
    ['localhost', 'https://localhost/sample-shop/test/AbC123'],
    ['IPv4 address', 'https://127.0.0.1/sample-shop/test/AbC123'],
    ['IPv6 address', 'https://[::1]/sample-shop/test/AbC123'],
    ['query string', 'https://pm.link/sample-shop/test/AbC123?next=https://example.com'],
    ['empty query', 'https://pm.link/sample-shop/test/AbC123?'],
    ['fragment', 'https://pm.link/sample-shop/test/AbC123#x'],
    ['extra path segment', 'https://pm.link/sample-shop/test/AbC123/extra'],
    ['trailing slash', 'https://pm.link/sample-shop/test/AbC123/'],
    ['missing reference', 'https://pm.link/sample-shop/test/'],
    ['missing handle', 'https://pm.link/test/AbC123'],
    ['encoded characters', 'https://pm.link/sample%2Fshop/test/AbC123'],
    ['dot segments', 'https://pm.link/x/../sample-shop/test/AbC123'],
    ['backslashes', 'https:\\\\pm.link\\sample-shop\\test\\AbC123'],
    ['surrounding whitespace', ' https://pm.link/sample-shop/test/AbC123 '],
    ['javascript URL', 'javascript:alert(1)//pm.link/sample-shop/test/AbC123'],
    ['data URL', 'data:text/html,pm.link/test'],
    ['not a URL', 'pm.link/sample-shop/test/AbC123'],
  ])('rejects a %s', (_label, url) => {
    expect(reject(url)).toBeNull();
  });
});
