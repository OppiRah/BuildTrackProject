// Public academic demo of the quotation workflow (src/lib/academic-demo.ts): browser-only state rules.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  addDemoRequest,
  approveDemoQuote,
  decideDemoQuote,
  demoIdentities,
  demoQuoteView,
  demoToken,
  emptyDemoState,
  findDemoByToken,
  parseDemoState,
  planOf,
  recordDemoSimulation,
  serviceOf,
  suggestedScope,
  type DemoState,
} from '../src/lib/academic-demo.ts';

const now = Date.UTC(2026, 9, 17, 8, 0);
const values = { scope: 'Starter setup for two sites with staff training.', amountCentavos: 299000, validityDays: 14 };
const token = 'AAAAAAAAAAAAAAAAAAAAAA';

function approved(): { state: DemoState; requestId: string } {
  const { state, request } = addDemoRequest(emptyDemoState(), 'maria', { plan: 'starter', service: 'delivery-monitoring' }, now, 'request-0001');
  return { state: approveDemoQuote(state, request.id, values, now, token), requestId: request.id };
}

describe('academic demo state', () => {
  it('uses only fictional sample identities (example.test addresses) and asks for no personal data', () => {
    expect(demoIdentities.every((identity) => identity.email.endsWith('@example.test'))).toBe(true);
    const page = readFileSync(new URL('../src/pages/academic-demo/index.astro', import.meta.url), 'utf8');
    expect(page).not.toMatch(/<input(?![^>]*type="checkbox")|<textarea/);
  });

  it('carries the plan and service through, allows "Not sure yet", and suggests a scope from them', () => {
    const { state, requestId } = approved();
    const request = state.requests.find((item) => item.id === requestId)!;
    expect([planOf(request)?.name, serviceOf(request)?.name]).toEqual(['Starter', 'Delivery monitoring']);
    expect(suggestedScope(request)).toBe(
      'BuildTrack Starter plan with delivery monitoring for Sample Builders Co. (fictional). Track cement and rebar deliveries across two sites. Includes onboarding and staff training.',
    );
    const unsure = addDemoRequest(emptyDemoState(), 'ana', { plan: null, service: null }, now, 'request-0002').request;
    expect([planOf(unsure), serviceOf(unsure)]).toEqual([null, null]);
    expect(suggestedScope(unsure)).toMatch(/^BuildTrack setup for Example Homes/);
    expect(() => addDemoRequest(emptyDemoState(), 'ana', { plan: 'gold', service: null }, now, 'request-0003')).toThrow('E_DEMO_INPUT');
    expect(() => addDemoRequest(emptyDemoState(), 'ana', { plan: null, service: 'mining' }, now, 'request-0003')).toThrow('E_DEMO_INPUT');
    // A record saved before services were added still reads, as "Not sure yet".
    const legacy = JSON.stringify(state).replace('"service":"delivery-monitoring",', '');
    expect(parseDemoState(legacy).requests[0]).toMatchObject({ service: null, plan: 'starter' });
  });

  it('numbers requests and quotations, approves once, and builds the customer view from the approved values', () => {
    const { state, requestId } = approved();
    const request = state.requests.find((item) => item.id === requestId)!;
    expect([request.ref, request.quote?.ref, request.quote?.status, request.quote?.version]).toEqual(['DEMO-R-0001', 'DEMO-Q-0001', 'approved', 1]);
    expect(request.quote!.expiresAt).toBe(now + 14 * 24 * 60 * 60 * 1000);
    expect(approveDemoQuote(state, requestId, { ...values, scope: 'Something else entirely' }, now, 'BBBBBBBBBBBBBBBBBBBBBB')).toEqual(state); // only once
    expect(demoQuoteView(request)).toMatchObject({ status: 'open', reference: 'DEMO-Q-0001', requestReference: 'DEMO-R-0001', firstName: 'Maria', amountCentavos: 299000 });
  });

  it('accept/decline only while open, unexpired and at the version shown; checkout results never mark it paid', () => {
    const { state } = approved();
    expect(decideDemoQuote(state, token, 'accept', 2, now)).toEqual(state); // stale version
    expect(decideDemoQuote(state, token, 'accept', 1, now + 15 * 24 * 60 * 60 * 1000)).toEqual(state); // expired
    expect(recordDemoSimulation(state, token, 'card', 'success', now)).toEqual(state); // not accepted yet
    const accepted = decideDemoQuote(state, token, 'accept', 1, now);
    const quote = findDemoByToken(accepted, token)!.quote!;
    expect([quote.status, quote.version]).toEqual(['accepted', 2]);
    expect(decideDemoQuote(accepted, token, 'decline', 2, now)).toEqual(accepted); // no change after deciding
    const paid = recordDemoSimulation(accepted, token, 'bank', 'success', now);
    expect(findDemoByToken(paid, token)!.quote).toMatchObject({ status: 'accepted', simulations: [{ method: 'bank', outcome: 'success', at: now }] });
    expect(JSON.stringify(paid)).not.toMatch(/paid|12345678/);
  });

  it('treats stored data as untrusted: malformed or tampered records give an empty demo', () => {
    const { state } = approved();
    const good = JSON.stringify(state);
    expect(parseDemoState(good)).toEqual(state);
    for (const bad of [
      'not json',
      good.replace('"maria"', '"someone-real"'),
      good.replace('"delivery-monitoring"', '"<script>"'),
      good.replace('"starter"', '"platinum"'),
      good.replace('"DEMO-Q-0001"', '"<img src=x>"'),
      good.replace('"approved"', '"paid"'),
      good.replace('"version":1', '"version":-1'),
      good.replace(token, 'short'),
      JSON.stringify({ ...state, requests: Array(21).fill(state.requests[0]) }),
    ]) {
      expect(parseDemoState(bad)).toEqual(emptyDemoState());
    }
  });

  it('demo link ids are 22 random base64url characters and match nothing else', () => {
    const a = demoToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(demoToken()).not.toBe(a);
    expect(findDemoByToken(approved().state, demoToken())).toBeNull();
  });
});
