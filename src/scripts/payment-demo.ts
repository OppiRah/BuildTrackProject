// Payment demo page (/payment-demo/): the simulated walkthrough (src/lib/payment-walkthrough.ts).
// In-memory only: no storage, timers or network requests; a reload or "Start again" / "Start over"
// returns to the sample quotation. Focus moves to each step's heading and each step is announced.

import {
  checkoutNotes,
  initialPaymentState,
  methodLabels,
  outcomeMessages,
  reducePayment,
  resultDisclaimer,
  stepLabels,
  type PaymentAction,
  type PaymentMethod,
  type PaymentOutcome,
  type PaymentState,
} from '../lib/payment-walkthrough.ts';

export function initPaymentDemo(): void {
  const container = document.querySelector<HTMLElement>('[data-pay]');
  if (!container) return;
  const status = container.querySelector<HTMLElement>('[data-pay-status]');
  for (const el of container.querySelectorAll<HTMLElement>('[data-pay-nojs]')) el.hidden = true;
  for (const el of container.querySelectorAll<HTMLElement>('[data-pay-controls]')) el.hidden = false;
  let state: PaymentState = initialPaymentState;

  const render = (moveFocus: boolean) => {
    for (const step of container.querySelectorAll<HTMLElement>('[data-pay-step]')) step.hidden = step.dataset.payStep !== state.step;
    const order = Object.keys(stepLabels);
    // A declined quotation stays at the customer's decision in the progress list.
    const current = order.indexOf(state.step === 'declined' ? 'decision' : state.step);
    for (const item of container.querySelectorAll<HTMLElement>('[data-pay-progress-step]')) {
      const index = order.indexOf(item.dataset.payProgressStep ?? '');
      if (index === current) item.setAttribute('aria-current', 'step');
      else item.removeAttribute('aria-current');
      item.classList.toggle('is-done', index < current);
    }
    if (state.method) {
      container.querySelector('[data-pay-method]')!.textContent = methodLabels[state.method];
      container.querySelector('[data-pay-checkout-note]')!.textContent = checkoutNotes[state.method];
    }
    if (state.outcome) {
      container.querySelector('[data-pay-result-title]')!.textContent = outcomeMessages[state.outcome].title;
      container.querySelector('[data-pay-result-text]')!.textContent = outcomeMessages[state.outcome].text;
    }
    if (moveFocus) container.querySelector<HTMLElement>(`[data-pay-step="${state.step}"] h2`)?.focus();
  };

  const messages: Record<PaymentState['step'], () => string> = {
    quotation: () => 'Walkthrough restarted at the sample quotation.',
    quoteEmail: () => 'Quotation email preview. Illustrative only; nothing was sent.',
    decision: () => 'Customer decision. Accept or decline the sample quotation.',
    declined: () => 'Quotation declined (simulated). Nothing was sent.',
    invite: () => 'Quotation accepted (simulated). Payment invitation email preview; nothing was sent.',
    method: () => 'Choose a payment method.',
    checkout: () => `${state.method ? methodLabels[state.method] : ''} chosen. Fictional checkout illustration; choose a simulated result.`,
    result: () => (state.outcome ? `${outcomeMessages[state.outcome].title}. ${resultDisclaimer}` : ''),
  };

  container.addEventListener('click', (event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>('[data-pay-action]');
    if (!button) return;
    const type = button.dataset.payAction as PaymentAction['type'];
    const action: PaymentAction =
      type === 'choose'
        ? { type, method: button.dataset.method as PaymentMethod }
        : type === 'outcome'
          ? { type, outcome: button.dataset.outcome as PaymentOutcome }
          : ({ type } as PaymentAction);
    const next = reducePayment(state, action);
    if (next === state) return;
    state = next;
    render(true);
    if (status) status.textContent = messages[state.step]();
  });

  render(false);
}
