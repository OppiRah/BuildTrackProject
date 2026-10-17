// Academic demo: the customer quotation page (/academic-demo/quote/). Drives the same markup as the
// real customer page (src/components/quotation/QuotePageBody.astro) from the browser-only demo record
// (src/lib/academic-demo.ts). No request is made to any server. The demo code is checked here only
// and never stored, sent or logged.

import {
  DEMO_STORE_KEY,
  decideDemoQuote,
  demoQuoteView,
  findDemoByToken,
  NOT_SURE,
  parseDemoState,
  planOf,
  recordDemoSimulation,
  serviceOf,
  type DemoState,
} from '../../lib/academic-demo.ts';
import { checkoutMethodLabels, DEMO_CODE, demoCodeError, isDemoCode, type CheckoutMethod, type CheckoutOutcome, type QuoteView } from '../../lib/quotation/customer.ts';
import { formatAmount } from '../../lib/quotation/owner-form.ts';
import { answerText, confirmText, formatExpiry } from '../../lib/quotation/quote-page.ts';
import { outcomeMessages } from '../../lib/payment-walkthrough.ts';

const LINK_KEY = 'buildtrack-academic-demo-link';

function readState(): DemoState {
  try {
    return parseDemoState(localStorage.getItem(DEMO_STORE_KEY));
  } catch {
    return parseDemoState(null);
  }
}
function writeState(state: DemoState): boolean {
  try {
    localStorage.setItem(DEMO_STORE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function startDemoCustomerPage(): void {
  const root = document.querySelector<HTMLElement>('[data-quote]');
  if (!root) return;
  const $ = <T extends HTMLElement = HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const status = $('[data-q-status]');
  const problem = $('[data-q-problem]');
  const article = $('[data-q-quote]');
  const checkout = $('[data-q-checkout]');
  const codeInput = $<HTMLInputElement>('[data-q-code]');
  const codeError = $('[data-q-code-error]');
  let token: string | null = null;
  let view: QuoteView | null = null;
  let method: CheckoutMethod | null = null;
  let asked: { decision: 'accept' | 'decline'; version: number } | null = null;

  const say = (text: string) => {
    status.textContent = text;
    status.hidden = text === '';
  };
  const amountText = (v: QuoteView) => `${formatAmount(v.amountCentavos)} (PHP)`;
  const clearCode = () => {
    codeInput.value = '';
    codeInput.removeAttribute('aria-invalid');
    codeInput.setAttribute('aria-describedby', 'q-demo-code-hint');
    codeError.hidden = true;
  };
  const step = (name: 'method' | 'code' | 'outcome' | 'result') => {
    for (const element of root.querySelectorAll<HTMLElement>('[data-q-step]')) element.hidden = !element.dataset.qStep!.split(' ').includes(name);
    if (name !== 'code') clearCode();
    if (name === 'method') for (const radio of root.querySelectorAll<HTMLInputElement>('[data-q-method]')) radio.checked = false;
  };
  const showProblem = (text: string) => {
    view = null;
    article.hidden = true;
    checkout.hidden = true;
    problem.hidden = false;
    $('[data-q-problem-text]').textContent = text;
    say('');
  };

  function render(next: QuoteView) {
    view = next;
    problem.hidden = true;
    article.hidden = false;
    $('[data-q-ref]').textContent = next.reference;
    $('[data-q-greeting]').textContent = `Hello ${next.firstName}, here is the quotation BuildTrack approved for you.`;
    $('[data-q-request]').textContent = next.requestReference;
    $('[data-q-scope]').textContent = next.scope;
    $('[data-q-amount]').textContent = amountText(next);
    $('[data-q-expires]').textContent = formatExpiry(next.expiresAt);
    $('[data-q-version]').textContent = String(next.version);
    $('[data-q-sum-ref]').textContent = next.reference;
    $('[data-q-sum-request]').textContent = next.requestReference;
    $('[data-q-sum-scope]').textContent = next.scope;
    $('[data-q-sum-amount]').textContent = amountText(next);
    const answer = answerText(next);
    $('[data-q-answer]').textContent = answer ?? '';
    $('[data-q-answer]').hidden = answer === null;
    $('[data-q-decision]').hidden = next.status !== 'open';
    if (next.status !== 'open') $('[data-q-confirm]').hidden = true;
    checkout.hidden = next.status !== 'accepted';
    $('[data-q-history-list]').replaceChildren(
      ...next.simulations.map((s) => {
        const item = document.createElement('li');
        item.textContent = `${outcomeMessages[s.outcome].title} · ${checkoutMethodLabels[s.method]}`;
        return item;
      }),
    );
    $('[data-q-history]').hidden = next.simulations.length === 0;
  }

  /** Loads the demo quotation for the current link from this browser's demo record. */
  function load(): boolean {
    if (!token) {
      showProblem('Open the demo customer invitation from the demo owner dashboard, in this same browser.');
      return false;
    }
    const request = findDemoByToken(readState(), token);
    if (!request) {
      showProblem('This demo link was not found in this browser. Demo quotations exist only in the browser that created them; start again from the academic demo.');
      return false;
    }
    if (request.quote!.expiresAt <= Date.now()) {
      showProblem('This demo quotation has expired.');
      return false;
    }
    render(demoQuoteView(request));
    // The plan and service chosen on the website, carried into the quotation summary.
    $('[data-q-service]').textContent = serviceOf(request)?.name ?? NOT_SURE;
    $('[data-q-plan]').textContent = planOf(request)?.name ?? NOT_SURE;
    return true;
  }
  /** Applies a change to the demo record, then shows the result (re-read, never assumed). */
  function change(update: (state: DemoState) => DemoState): boolean {
    const before = readState();
    const after = update(before);
    if (after === before || JSON.stringify(after) === JSON.stringify(before)) {
      load();
      say('Nothing changed: the demo quotation was already updated, perhaps in another tab.');
      return false;
    }
    if (!writeState(after)) {
      say('This browser did not allow the demo to save its state. Nothing was recorded.');
      return false;
    }
    return load();
  }

  // ---- Accept / decline: explicit confirmation of the quotation shown ----
  for (const button of root.querySelectorAll<HTMLButtonElement>('[data-q-ask]')) {
    button.addEventListener('click', () => {
      if (!view || view.status !== 'open') return;
      const decision = button.dataset.qAsk as 'accept' | 'decline';
      asked = { decision, version: view.version };
      const text = confirmText(view, decision);
      $('[data-q-confirm-text]').textContent = text.question;
      $('[data-q-confirm-yes]').textContent = text.button;
      $('[data-q-decision]').hidden = true;
      $('[data-q-confirm]').hidden = false;
      $('[data-q-confirm-text]').focus();
    });
  }
  $('[data-q-confirm-no]').addEventListener('click', () => {
    asked = null;
    $('[data-q-confirm]').hidden = true;
    $('[data-q-decision]').hidden = false;
    root.querySelector<HTMLButtonElement>('[data-q-ask="accept"]')!.focus();
  });
  $('[data-q-confirm-yes]').addEventListener('click', () => {
    const decision = asked;
    asked = null;
    if (!decision || !token) return;
    const t = token;
    if (change((state) => decideDemoQuote(state, t, decision.decision, decision.version, Date.now()))) {
      say(decision.decision === 'accept' ? 'You accepted this demo quotation.' : 'You declined this demo quotation.');
      $('#q-heading').focus();
    }
  });

  // ---- Demo checkout (accepted quotations only) ----
  for (const radio of root.querySelectorAll<HTMLInputElement>('[data-q-method]')) {
    radio.addEventListener('change', () => {
      if (!radio.checked) return;
      method = radio.dataset.qMethod as CheckoutMethod;
      $('[data-q-method-label]').textContent = checkoutMethodLabels[method];
      for (const detail of root.querySelectorAll<HTMLElement>('[data-q-detail]')) detail.hidden = detail.dataset.qDetail !== method;
      step('code');
      clearCode();
    });
  }
  $('[data-q-sample]').addEventListener('click', () => {
    codeInput.value = DEMO_CODE;
    codeInput.focus();
  });
  $('[data-q-check]').addEventListener('click', () => {
    if (isDemoCode(codeInput.value)) {
      clearCode(); // checked locally and discarded at once
      step('outcome');
      if (view) $('[data-q-review-amount]').textContent = amountText(view);
      root.querySelector<HTMLButtonElement>('[data-q-outcome="success"]')!.focus();
    } else {
      codeError.textContent = demoCodeError;
      codeError.hidden = false;
      codeInput.setAttribute('aria-invalid', 'true');
      codeInput.setAttribute('aria-describedby', 'q-demo-code-hint q-demo-code-error');
      codeInput.focus();
    }
  });
  codeInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') $('[data-q-check]').click();
  });
  for (const back of root.querySelectorAll<HTMLButtonElement>('[data-q-back]')) {
    back.addEventListener('click', () => {
      method = null;
      step('method');
      root.querySelector<HTMLInputElement>('[data-q-method="card"]')!.focus();
    });
  }
  for (const button of root.querySelectorAll<HTMLButtonElement>('[data-q-outcome]')) {
    button.addEventListener('click', () => {
      if (!method || !token || !view || view.status !== 'accepted') return;
      const outcome = button.dataset.qOutcome as CheckoutOutcome;
      const chosen = method;
      const t = token;
      if (!change((state) => recordDemoSimulation(state, t, chosen, outcome, Date.now()))) return;
      $('[data-q-result-title]').textContent = outcomeMessages[outcome].title;
      $('[data-q-result-text]').textContent = outcomeMessages[outcome].text;
      $('[data-q-step="result"]').dataset.outcome = outcome;
      $('[data-q-result-ref]').textContent = view.reference;
      $('[data-q-result-method]').textContent = checkoutMethodLabels[chosen];
      $('[data-q-result-amount]').textContent = amountText(view);
      step('result');
      say('');
      $('[data-q-result-title]').focus();
    });
  }
  $('[data-q-restart]').addEventListener('click', () => {
    method = null;
    step('method');
    $('#q-checkout-heading').focus();
  });

  // ---- Link: "#d=<id>" from the demo owner dashboard; kept for this tab so a reload works ----
  const fromHash = /^#d=([A-Za-z0-9_-]{22})$/.exec(location.hash)?.[1] ?? null;
  if (location.hash) history.replaceState(null, '', location.pathname);
  try {
    if (fromHash) sessionStorage.setItem(LINK_KEY, fromHash);
    token = fromHash ?? sessionStorage.getItem(LINK_KEY);
  } catch {
    token = fromHash;
  }
  step('method');
  load();
  // Another tab (the demo owner dashboard) changed the demo record: show the current state.
  window.addEventListener('storage', (event) => {
    if (event.key === DEMO_STORE_KEY && view && $('[data-q-step="result"]').hidden) load();
  });
  // Another demo link opened in this same tab changes only the hash: start again with that link.
  window.addEventListener('hashchange', () => location.reload());
}
