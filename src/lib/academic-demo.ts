// Academic demo of the quotation workflow (public, browser-only; docs/PROPOSAL_QUOTATION_WORKFLOW.md
// §18, "Public academic demo"). Three same-origin pages share one record in localStorage:
//   /academic-demo/        a demo quotation request with a FICTIONAL sample identity (no personal data)
//   /academic-demo/owner/  a demo owner dashboard: review, draft, approve, prepare the invitation
//   /academic-demo/quote/  the customer quotation page: accept or decline, then the demo checkout
// Nothing here talks to a server: no D1, no owner Worker, no secrets, no email, no Formspree. Real
// customer link tokens are never involved; demo links carry a random id that only finds a record in
// this browser's storage. Stored data is untrusted and validated on every read. Pure functions only;
// the pages' scripts do the storage access.

import { plans } from '../config/pricing.ts';
import type { CheckoutMethod, CheckoutOutcome, QuoteView } from './quotation/customer.ts';
import { checkoutMethods, checkoutOutcomes, firstName } from './quotation/customer.ts';
import { validateQuote, type QuoteErrors } from './quotation/owner-form.ts';

export const DEMO_STORE_KEY = 'buildtrack-academic-demo-v1';
export const DEMO_MAX_REQUESTS = 20;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Fictional sample customers: the demo never asks for a real name, email, phone or project. */
export const demoIdentities = [
  {
    id: 'maria',
    name: 'Maria Santos',
    email: 'maria.santos@example.test',
    organization: 'Sample Builders Co. (fictional)',
    organizationType: 'Contractor',
    projectNeed: 'Track cement and rebar deliveries across two sites.',
  },
  {
    id: 'jose',
    name: 'Jose Reyes',
    email: 'jose.reyes@example.test',
    organization: 'Demo Hardware Supply (fictional)',
    organizationType: 'Supplier',
    projectNeed: 'See material stock levels at a glance and avoid site shortages.',
  },
  {
    id: 'ana',
    name: 'Ana Cruz',
    email: 'ana.cruz@example.test',
    organization: 'Example Homes Project Office (fictional)',
    organizationType: 'Project office',
    projectNeed: 'Record deliveries for one residential project with staff training.',
  },
] as const;
export type DemoIdentityId = (typeof demoIdentities)[number]['id'];
export const demoPlans = plans.filter((plan) => plan.amountPhp !== null).map((plan) => ({ id: plan.id, name: plan.name, amountPhp: plan.amountPhp! }));

export interface DemoQuote {
  ref: string;
  scope: string;
  amountCentavos: number;
  validityDays: number;
  approvedAt: number;
  expiresAt: number;
  /** Random id in the demo link (#d=...); finds this record in this browser only. */
  token: string;
  version: number;
  status: 'approved' | 'accepted' | 'declined';
  decidedAt: number | null;
  simulations: { method: CheckoutMethod; outcome: CheckoutOutcome; at: number }[];
}
export interface DemoRequest {
  id: string;
  ref: string;
  createdAt: number;
  identity: DemoIdentityId;
  plan: string;
  quote: DemoQuote | null;
}
export interface DemoState {
  v: 1;
  requestSeq: number;
  quoteSeq: number;
  requests: DemoRequest[];
}

export const emptyDemoState = (): DemoState => ({ v: 1, requestSeq: 0, quoteSeq: 0, requests: [] });

const isInt = (value: unknown, min: number, max: number): value is number => Number.isSafeInteger(value) && (value as number) >= min && (value as number) <= max;
const isText = (value: unknown, max: number, pattern?: RegExp): value is string => typeof value === 'string' && value.length <= max && (!pattern || pattern.test(value));
const TOKEN = /^[A-Za-z0-9_-]{22}$/;
const ID = /^[A-Za-z0-9_-]{8,40}$/;
const TIME = [0, 8.64e15] as const;

function parseQuote(raw: unknown): DemoQuote | null | undefined {
  if (raw === null) return null;
  if (typeof raw !== 'object') return undefined;
  const q = raw as Record<string, unknown>;
  const valid =
    isText(q.ref, 20, /^DEMO-Q-\d{4}$/) &&
    isText(q.scope, 2000) &&
    !validateFields(q.scope as string, q.amountCentavos, q.validityDays) &&
    isInt(q.approvedAt, ...TIME) &&
    isInt(q.expiresAt, ...TIME) &&
    isText(q.token, 22, TOKEN) &&
    isInt(q.version, 1, 1000) &&
    (q.status === 'approved' || q.status === 'accepted' || q.status === 'declined') &&
    (q.decidedAt === null || isInt(q.decidedAt, ...TIME)) &&
    Array.isArray(q.simulations) &&
    q.simulations.length <= 50 &&
    q.simulations.every(
      (s) =>
        typeof s === 'object' &&
        s !== null &&
        checkoutMethods.includes((s as Record<string, unknown>).method as CheckoutMethod) &&
        checkoutOutcomes.includes((s as Record<string, unknown>).outcome as CheckoutOutcome) &&
        isInt((s as Record<string, unknown>).at, ...TIME),
    );
  if (!valid) return undefined;
  return {
    ref: q.ref as string,
    scope: q.scope as string,
    amountCentavos: q.amountCentavos as number,
    validityDays: q.validityDays as number,
    approvedAt: q.approvedAt as number,
    expiresAt: q.expiresAt as number,
    token: q.token as string,
    version: q.version as number,
    status: q.status as DemoQuote['status'],
    decidedAt: q.decidedAt as number | null,
    simulations: (q.simulations as DemoQuote['simulations']).map((s) => ({ method: s.method, outcome: s.outcome, at: s.at })),
  };
}

/** Validated state from stored text; anything malformed gives an empty demo (never a partial one). */
export function parseDemoState(text: string | null): DemoState {
  if (!text || text.length > 200_000) return emptyDemoState();
  try {
    const raw = JSON.parse(text) as Record<string, unknown>;
    if (raw?.v !== 1 || !isInt(raw.requestSeq, 0, 9999) || !isInt(raw.quoteSeq, 0, 9999) || !Array.isArray(raw.requests) || raw.requests.length > DEMO_MAX_REQUESTS)
      return emptyDemoState();
    const requests: DemoRequest[] = [];
    for (const item of raw.requests as unknown[]) {
      const r = item as Record<string, unknown>;
      const quote = parseQuote(r?.quote);
      if (
        typeof r !== 'object' ||
        !isText(r.id, 40, ID) ||
        !isText(r.ref, 20, /^DEMO-R-\d{4}$/) ||
        !isInt(r.createdAt, ...TIME) ||
        !demoIdentities.some((identity) => identity.id === r.identity) ||
        !demoPlans.some((plan) => plan.id === r.plan) ||
        quote === undefined
      )
        return emptyDemoState();
      requests.push({ id: r.id as string, ref: r.ref as string, createdAt: r.createdAt as number, identity: r.identity as DemoIdentityId, plan: r.plan as string, quote });
    }
    return { v: 1, requestSeq: raw.requestSeq as number, quoteSeq: raw.quoteSeq as number, requests };
  } catch {
    return emptyDemoState();
  }
}

const pad = (n: number) => String(n).padStart(4, '0');
export const identityOf = (request: DemoRequest) => demoIdentities.find((identity) => identity.id === request.identity)!;
export const planOf = (request: DemoRequest) => demoPlans.find((plan) => plan.id === request.plan)!;

/** A new demo request (fictional identity and a plan). Oldest records drop off beyond the limit. */
export function addDemoRequest(state: DemoState, identity: DemoIdentityId, plan: string, now: number, id: string): { state: DemoState; request: DemoRequest } {
  if (!demoIdentities.some((item) => item.id === identity) || !demoPlans.some((item) => item.id === plan)) throw new Error('E_DEMO_INPUT');
  const requestSeq = (state.requestSeq % 9999) + 1;
  const request: DemoRequest = { id, ref: `DEMO-R-${pad(requestSeq)}`, createdAt: now, identity, plan, quote: null };
  return { state: { ...state, requestSeq, requests: [...state.requests, request].slice(-DEMO_MAX_REQUESTS) }, request };
}

function validateFields(scope: string, amountCentavos: unknown, validityDays: unknown): boolean {
  return !(isText(scope, 2000) && scope.trim().length >= 10 && isInt(amountCentavos, 100, 1_000_000_000) && isInt(validityDays, 1, 30));
}

/** The owner's draft values, checked with the real owner form's rules. */
export function checkDemoDraft(input: { scope: string; amount: string; validity_days: string }): { values: { scope: string; amountCentavos: number; validityDays: number } } | { errors: QuoteErrors } {
  return validateQuote(input);
}

/** Approval: freezes the values, sets the expiry and creates the demo link id. Only once per request. */
export function approveDemoQuote(
  state: DemoState,
  requestId: string,
  values: { scope: string; amountCentavos: number; validityDays: number },
  now: number,
  token: string,
): DemoState {
  if (!TOKEN.test(token) || validateFields(values.scope, values.amountCentavos, values.validityDays)) throw new Error('E_DEMO_INPUT');
  // Only a request without a quotation can be approved; anything else changes nothing at all.
  if (!state.requests.some((request) => request.id === requestId && !request.quote)) return state;
  const quoteSeq = (state.quoteSeq % 9999) + 1;
  return {
    ...state,
    quoteSeq,
    requests: state.requests.map((request) =>
      request.id === requestId && !request.quote
        ? {
            ...request,
            quote: {
              ref: `DEMO-Q-${pad(quoteSeq)}`,
              scope: values.scope,
              amountCentavos: values.amountCentavos,
              validityDays: values.validityDays,
              approvedAt: now,
              expiresAt: now + values.validityDays * DAY_MS,
              token,
              version: 1,
              status: 'approved',
              decidedAt: null,
              simulations: [],
            },
          }
        : request,
    ),
  };
}

export const findDemoByToken = (state: DemoState, token: string) => state.requests.find((request) => request.quote?.token === token) ?? null;

/** The customer page's view of a demo quotation, in the real page's shape. */
export function demoQuoteView(request: DemoRequest): QuoteView {
  const quote = request.quote!;
  return {
    status: quote.status === 'approved' ? 'open' : quote.status,
    reference: quote.ref,
    requestReference: request.ref,
    firstName: firstName(identityOf(request).name),
    scope: quote.scope,
    amountCentavos: quote.amountCentavos,
    version: quote.version,
    expiresAt: quote.expiresAt,
    simulations: quote.simulations,
  };
}

function updateQuote(state: DemoState, token: string, change: (quote: DemoQuote) => DemoQuote | null): DemoState {
  return { ...state, requests: state.requests.map((request) => (request.quote?.token === token ? { ...request, quote: change(request.quote) ?? request.quote } : request)) };
}

/** Accept or decline: only while open, unexpired and at the version shown. */
export function decideDemoQuote(state: DemoState, token: string, decision: 'accept' | 'decline', version: number, now: number): DemoState {
  return updateQuote(state, token, (quote) =>
    quote.status === 'approved' && quote.version === version && quote.expiresAt > now
      ? { ...quote, status: decision === 'accept' ? 'accepted' : 'declined', decidedAt: now, version: quote.version + 1 }
      : null,
  );
}

/** A simulated checkout result: accepted quotations only. It never changes the status ("paid" does not exist). */
export function recordDemoSimulation(state: DemoState, token: string, method: CheckoutMethod, outcome: CheckoutOutcome, now: number): DemoState {
  if (!checkoutMethods.includes(method) || !checkoutOutcomes.includes(outcome)) throw new Error('E_DEMO_INPUT');
  return updateQuote(state, token, (quote) =>
    quote.status === 'accepted' && quote.simulations.length < 50 ? { ...quote, simulations: [...quote.simulations, { method, outcome, at: now }] } : null,
  );
}

/** A random id for a demo link (16 bytes, base64url without padding: 22 characters). */
export function demoToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
