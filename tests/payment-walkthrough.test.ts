import { describe, expect, it } from 'vitest';
import {
  checkoutNotes,
  initialPaymentState,
  outcomeMessages,
  reducePayment,
  resultDisclaimer,
  stepLabels,
  type PaymentAction,
  type PaymentState,
} from '../src/lib/payment-walkthrough.ts';

const run = (...actions: PaymentAction[]): PaymentState => actions.reduce(reducePayment, initialPaymentState);
const next: PaymentAction = { type: 'next' };
const toDecision = [next, next];
const toMethod = [...toDecision, { type: 'accept' } as const, next];

describe('payment walkthrough', () => {
  it('goes quotation → quotation email → customer decision → accept → invitation email → method → checkout → result', () => {
    expect(run(next).step).toBe('quoteEmail');
    expect(run(...toDecision).step).toBe('decision');
    expect(run(...toDecision, { type: 'accept' }).step).toBe('invite');
    expect(run(...toMethod)).toEqual({ step: 'method', method: null, outcome: null });
    expect(run(...toMethod, { type: 'choose', method: 'bank' })).toEqual({ step: 'checkout', method: 'bank', outcome: null });
    for (const outcome of ['success', 'failure', 'cancelled'] as const) {
      expect(run(...toMethod, { type: 'choose', method: 'card' }, { type: 'outcome', outcome })).toEqual({ step: 'result', method: 'card', outcome });
    }
  });

  it('lists the seven journey steps in order', () => {
    expect(Object.keys(stepLabels)).toEqual(['quotation', 'quoteEmail', 'decision', 'invite', 'method', 'checkout', 'result']);
  });

  it('can decline at the customer decision, go back from the checkout to the method choice and restart from any step', () => {
    expect(run(...toDecision, { type: 'decline' }).step).toBe('declined');
    expect(run(...toMethod, { type: 'choose', method: 'card' }, { type: 'back' })).toEqual({ step: 'method', method: null, outcome: null });
    for (const steps of [[next], toDecision, toMethod, [...toMethod, { type: 'choose', method: 'card' } as const, { type: 'outcome', outcome: 'success' } as const]]) {
      expect(run(...steps, { type: 'restart' })).toEqual(initialPaymentState);
    }
  });

  it('ignores actions that do not fit the current step (only the customer accepts; no outcome without a checkout)', () => {
    expect(run({ type: 'accept' })).toEqual(initialPaymentState);
    expect(run(next, { type: 'accept' }).step).toBe('quoteEmail');
    expect(run({ type: 'outcome', outcome: 'success' })).toEqual(initialPaymentState);
    expect(run({ type: 'choose', method: 'card' })).toEqual(initialPaymentState);
    expect(run(...toDecision, next).step).toBe('decision');
    expect(run(...toDecision, { type: 'decline' }, { type: 'accept' }).step).toBe('declined');
    expect(run(...toDecision, { type: 'decline' }, next).step).toBe('declined');
    const done = run(...toMethod, { type: 'choose', method: 'card' }, { type: 'outcome', outcome: 'failure' });
    expect(reducePayment(done, { type: 'outcome', outcome: 'success' })).toEqual(done);
    expect(reducePayment(done, next)).toEqual(done);
  });

  it('says every outcome is simulated and never claims provider verification', () => {
    expect(resultDisclaimer).toBe('Simulated—no money moved. Not a payment receipt.');
    for (const { title, text } of Object.values(outcomeMessages)) {
      expect(title).toMatch(/^Simulated /);
      expect(text).toMatch(/simulation/i);
      expect(`${title} ${text}`).not.toMatch(/\b(verified|confirmed|received) (by|with)\b|\bpayment (is|was) (verified|confirmed)\b/i);
    }
  });

  it('keeps the checkout notes free of fields and banking instructions', () => {
    expect(checkoutNotes.card).toMatch(/no fields/);
    expect(checkoutNotes.bank).toMatch(/no bank details or transfer instructions/);
    for (const note of Object.values(checkoutNotes)) expect(note).not.toMatch(/\b(card number|cvv|cvc|account number|qr)\b/i);
  });
});
