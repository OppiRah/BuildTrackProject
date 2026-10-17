// /quote/ page script (docs/PROPOSAL_QUOTATION_WORKFLOW.md §4, §5, §8, §18). The token arrives in the
// URL fragment, which browsers never send to servers; it is kept in sessionStorage (or memory if
// storage is unavailable) so a reload in the same tab works, and the fragment is removed from the
// address bar at once. The token is then sent deliberately, only in POST bodies to /api/quote/*.
// Viewing never accepts anything: accept and decline need a confirmation step and a POST.
// The demo code is checked here only; it is never sent, stored, logged or put in a URL.
//
// State is bound to the link it belongs to (checkpoint 4 review):
// - Every link change starts a new session: outstanding requests are aborted, and any response
//   that still arrives for an older session is discarded, so it can never change what a newer
//   link shows.
// - A confirmation, and each simulated-checkout click, captures the token and version of the
//   quotation the customer actually saw; the request uses exactly those.
// - A fragment is used whenever one is present. An explicit fragment that is not a valid link
//   shows an error and forgets the earlier link; the tab's stored link is used only when the
//   address has no fragment at all.
// - If a decision or simulated result may or may not have been recorded (network failure or
//   server error), the page says so and offers "Check again", which repeats the identical
//   request (same token, version and attempt id); the server treats repeats idempotently.
//   Only a fully recognised answer counts (quote-page.ts classifyResponse): an unreadable,
//   malformed or mismatched answer, even with HTTP 200, is treated as unknown too. While a
//   decision or simulated result is unknown, no new one can be started.
// - Recovery (the saved request and lock) ends only on a recognised answer that settles it, or
//   when the session is replaced (a new link, or an explicit fragment that is invalid). A link
//   problem after a decision or checkout was sent keeps it: the link may have stopped working just
//   after the action was recorded.
// - Before a decision or checkout is sent, the exact request is stored for this tab
//   (quote-page.ts parsePending), so a reload restores it with its lock and "Check again". If it
//   cannot be stored, nothing is sent. The stored record is validated as untrusted input.

import {
  checkoutMethodLabels,
  demoCodeError,
  DEMO_CODE,
  isDemoCode,
  type CheckoutMethod,
  type CheckoutOutcome,
  type QuoteView,
} from '../lib/quotation/customer.ts';
import { formatAmount } from '../lib/quotation/owner-form.ts';
import {
  answerText,
  classifyResponse,
  confirmText,
  formatExpiry,
  linkUncertainText,
  parsePending,
  PENDING_KEY,
  restoredText,
  serializePending,
  settles,
  stillUnknownText,
  storageNeededText,
  tokenFromFragment,
  uncertainText,
  type PendingAction,
} from '../lib/quotation/quote-page.ts';
import { outcomeMessages } from '../lib/payment-walkthrough.ts';

const STORAGE_KEY = 'buildtrack-quote-link';
let memoryToken: string | null = null;

function saveToken(token: string | null) {
  memoryToken = token;
  try {
    if (token) sessionStorage.setItem(STORAGE_KEY, token);
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage unavailable (private mode, blocked): memory only; a reload then needs the email link again.
  }
}
/** Stores the action about to be sent and reads it back; false if it could not be kept (nothing is then sent). */
function savePending(action: PendingAction, fields: Record<string, string>): boolean {
  try {
    const record = serializePending({ action, fields });
    sessionStorage.setItem(PENDING_KEY, record);
    return sessionStorage.getItem(PENDING_KEY) === record;
  } catch {
    return false;
  }
}
function clearPending() {
  try {
    sessionStorage.removeItem(PENDING_KEY);
  } catch {
    // Nothing stored, or storage unavailable: nothing to clear.
  }
}
function readPending(): string | null {
  try {
    return sessionStorage.getItem(PENDING_KEY);
  } catch {
    return null;
  }
}
function loadToken(): string | null {
  try {
    return sessionStorage.getItem(STORAGE_KEY) ?? memoryToken;
  } catch {
    return memoryToken;
  }
}

type Action = 'view' | 'accept' | 'decline' | 'simulate';
type ApiResult = { status: number; body: Record<string, unknown> | null; retryAfter: number | null };
/** One request exactly as sent; repeating it is safe (the server is idempotent for it). */
interface Sent {
  session: number;
  action: Action;
  fields: Record<string, string>;
}

export function startQuotePage(): void {
  const root = document.querySelector<HTMLElement>('[data-quote]');
  if (!root) return;
  const $ = <T extends HTMLElement = HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const status = $('[data-q-status]');
  const retry = $<HTMLButtonElement>('[data-q-retry]');
  const problem = $('[data-q-problem]');
  const article = $('[data-q-quote]');
  const checkout = $('[data-q-checkout]');
  const codeInput = $<HTMLInputElement>('[data-q-code]');
  const codeError = $('[data-q-code-error]');

  let session = 0;
  let token: string | null = null;
  let view: QuoteView | null = null;
  let method: CheckoutMethod | null = null;
  /** The confirmation on screen: the decision and the exact quotation it was asked about. */
  let confirmation: { session: number; token: string; version: number; decision: 'accept' | 'decline' } | null = null;
  /** A request whose outcome is unknown, kept so "Check again" can repeat it exactly. */
  let uncertain: Sent | null = null;
  let busy = false;
  const controllers = new Set<AbortController>();

  const say = (text: string) => {
    status.textContent = text;
    status.hidden = text === '';
  };
  const setBusy = (value: boolean) => {
    busy = value;
    for (const button of root.querySelectorAll<HTMLButtonElement>('[data-q-quote] button, [data-q-checkout] button, [data-q-retry]')) button.disabled = value;
  };
  const showRetry = (sent: Sent | null) => {
    uncertain = sent;
    retry.hidden = sent === null;
    // While a decision or simulated result is unresolved, no new one can be started.
    for (const button of root.querySelectorAll<HTMLButtonElement>('[data-q-ask], [data-q-confirm-yes], [data-q-outcome]')) button.disabled = unresolved();
  };

  async function api(sent: Sent): Promise<ApiResult | null> {
    const controller = new AbortController();
    controllers.add(controller);
    try {
      const response = await fetch(`/api/quote/${sent.action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sent.fields),
        credentials: 'omit',
        cache: 'no-store',
        signal: controller.signal,
      });
      let body: Record<string, unknown> | null = null;
      try {
        body = (await response.json()) as Record<string, unknown>;
      } catch {
        body = null;
      }
      const retryAfter = /^\d{1,6}$/.test(response.headers.get('Retry-After') ?? '') ? Number(response.headers.get('Retry-After')) : null;
      return sent.session === session ? { status: response.status, body, retryAfter } : null;
    } catch {
      return sent.session === session ? { status: 0, body: null, retryAfter: null } : null; // null: a newer link replaced this one
    } finally {
      controllers.delete(controller);
    }
  }

  /** Shows a link problem in place of the quotation. Does NOT touch recovery (the saved request and lock). */
  const displayProblem = (text: string) => {
    view = null;
    confirmation = null;
    article.hidden = true;
    checkout.hidden = true;
    problem.hidden = false;
    $('[data-q-problem-text]').textContent = text;
    $('[data-q-problem-heading]').focus();
  };
  /** A link problem with nothing pending: only for loading a link (never after a decision or checkout was sent). */
  const showProblem = (text: string) => {
    displayProblem(text);
    say('');
    showRetry(null);
  };
  const clearCode = () => {
    codeInput.value = '';
    codeInput.removeAttribute('aria-invalid');
    codeInput.setAttribute('aria-describedby', 'q-demo-code-hint');
    codeError.hidden = true;
  };
  const step = (name: 'method' | 'code' | 'outcome' | 'result') => {
    // An element may belong to several steps (the method choice stays visible beside its details).
    for (const element of root.querySelectorAll<HTMLElement>('[data-q-step]')) element.hidden = !element.dataset.qStep!.split(' ').includes(name);
    if (name !== 'code') clearCode();
    if (name === 'method') for (const radio of root.querySelectorAll<HTMLInputElement>('[data-q-method]')) radio.checked = false;
  };
  /** The approved amount, as shown in the checkout summary, review and result. */
  const amountText = (v: QuoteView) => `${formatAmount(v.amountCentavos)} (PHP)`;

  function render(next: QuoteView) {
    view = next;
    confirmation = null;
    problem.hidden = true;
    article.hidden = false;
    $('[data-q-ref]').textContent = next.reference;
    $('[data-q-greeting]').textContent = next.firstName ? `Hello ${next.firstName}, here is the quotation BuildTrack approved for you.` : 'Here is the quotation BuildTrack approved for you.';
    $('[data-q-request]').textContent = next.requestReference;
    $('[data-q-scope]').textContent = next.scope;
    $('[data-q-amount]').textContent = amountText(next);
    // Checkout order summary: the same approved snapshot.
    $('[data-q-sum-ref]').textContent = next.reference;
    $('[data-q-sum-request]').textContent = next.requestReference;
    $('[data-q-sum-scope]').textContent = next.scope;
    $('[data-q-sum-amount]').textContent = amountText(next);
    $('[data-q-expires]').textContent = formatExpiry(next.expiresAt);
    $('[data-q-version]').textContent = String(next.version);
    const answer = answerText(next);
    $('[data-q-answer]').textContent = answer ?? '';
    $('[data-q-answer]').hidden = answer === null;
    $('[data-q-decision]').hidden = next.status !== 'open';
    $('[data-q-confirm]').hidden = true;
    checkout.hidden = next.status !== 'accepted';
    const history = $('[data-q-history-list]');
    history.replaceChildren(
      ...next.simulations.map((s) => {
        const item = document.createElement('li');
        item.textContent = `${outcomeMessages[s.outcome].title} · ${checkoutMethodLabels[s.method]}`;
        return item;
      }),
    );
    $('[data-q-history]').hidden = next.simulations.length === 0;
  }

  /** True while a decision or simulated result may or may not have been recorded. */
  const unresolved = () => uncertain !== null && uncertain.action !== 'view';

  /** Sends a request and applies its answer, unless a newer link has replaced this one meanwhile. */
  async function perform(sent: Sent): Promise<void> {
    if (busy) return; // one request at a time: no concurrent submissions
    // While an action is unresolved only that exact request may be repeated; viewing stays possible.
    if (unresolved() && sent !== uncertain && sent.action !== 'view') return;
    const isRetry = sent === uncertain;
    const shownReference = view?.reference ?? null;
    setBusy(true);
    say(sent.action === 'view' ? 'Opening your quotation…' : sent.action === 'simulate' ? 'Recording the simulated result…' : sent.action === 'accept' ? 'Accepting…' : 'Declining…');
    const result = await api(sent);
    if (result === null) return; // stale: a newer link owns the page (its own begin() reset the state)
    setBusy(false);
    const answer = result.status === 0 ? ({ kind: 'uncertain' } as const) : classifyResponse(sent, result.status, result.body, shownReference);
    if (sent.action === 'view' && unresolved()) {
      // Loading the quotation while an earlier action is unresolved (after a reload): show what the
      // link allows, but keep the unresolved request, its lock and "Check again".
      const pending = uncertain!;
      if (answer.kind === 'problem') {
        displayProblem(answer.message);
        say(linkUncertainText(pending.action));
      } else {
        if (answer.kind === 'view') render(answer.view);
        say(restoredText(pending.action as PendingAction));
      }
      showRetry(pending);
      return;
    }
    if (answer.kind === 'problem' && sent.action !== 'view') {
      // A decision or checkout was sent; a link problem alone cannot tell whether it was recorded
      // (it may have been, just before the link stopped working). Show the problem AND keep the exact
      // request, the lock and "Check again". Nothing about the quotation is shown.
      displayProblem(answer.message);
      say(linkUncertainText(sent.action));
      showRetry(sent);
      return;
    }
    if ((answer.kind === 'notice' || answer.kind === 'problem') && !settles(sent.action, answer, isRetry)) {
      // Refused, but the original outcome is still unknown: keep the exact request and the lock.
      say(stillUnknownText(sent.action, answer.message, result.retryAfter));
      showRetry(sent);
      retry.focus();
      return;
    }
    if (answer.kind === 'uncertain') {
      // Unreadable, malformed, unexpected or lost: the outcome is unknown. Keep the exact request.
      if (sent.action === 'accept' || sent.action === 'decline') {
        confirmation = null;
        $('[data-q-confirm]').hidden = true;
        $('[data-q-decision]').hidden = false; // shown, but disabled until "Check again" resolves it
      }
      say(uncertainText(sent.action));
      showRetry(sent);
      retry.focus();
      return;
    }
    // Settled: the pending record has done its job.
    if (sent.action !== 'view') clearPending();
    showRetry(null);
    if (answer.kind === 'problem') return showProblem(answer.message);
    if (answer.kind === 'notice') {
      if (answer.view) render(answer.view);
      say(answer.message);
      return;
    }
    render(answer.view);
    if (answer.kind === 'simulated') {
      $('[data-q-result-title]').textContent = outcomeMessages[answer.outcome].title;
      $('[data-q-result-text]').textContent = outcomeMessages[answer.outcome].text;
      $('[data-q-step="result"]').dataset.outcome = answer.outcome;
      $('[data-q-result-ref]').textContent = answer.view.reference;
      $('[data-q-result-method]').textContent = checkoutMethodLabels[sent.fields.method as CheckoutMethod] ?? '';
      $('[data-q-result-amount]').textContent = amountText(answer.view);
      step('result');
      say('');
      $('[data-q-result-title]').focus();
      return;
    }
    say(answer.message ?? '');
    if (sent.action !== 'view') $('#q-heading').focus();
  }

  // ---- Accept / decline: explicit confirmation bound to the quotation shown, then one POST ----
  for (const button of root.querySelectorAll<HTMLButtonElement>('[data-q-ask]')) {
    button.addEventListener('click', () => {
      if (!view || !token || busy || unresolved()) return;
      const decision = button.dataset.qAsk as 'accept' | 'decline';
      confirmation = { session, token, version: view.version, decision };
      const text = confirmText(view, decision);
      $('[data-q-confirm-text]').textContent = text.question;
      $('[data-q-confirm-yes]').textContent = text.button;
      $('[data-q-decision]').hidden = true;
      $('[data-q-confirm]').hidden = false;
      $('[data-q-confirm-text]').focus();
    });
  }
  $('[data-q-confirm-no]').addEventListener('click', () => {
    confirmation = null;
    $('[data-q-confirm]').hidden = true;
    $('[data-q-decision]').hidden = false;
    root.querySelector<HTMLButtonElement>('[data-q-ask="accept"]')!.focus();
  });
  $('[data-q-confirm-yes]').addEventListener('click', () => {
    const asked = confirmation;
    if (!asked || asked.session !== session || busy || unresolved()) return;
    const fields = { token: asked.token, version: String(asked.version) };
    if (!savePending(asked.decision, fields)) return say(storageNeededText); // never send what could not be recovered
    void perform({ session: asked.session, action: asked.decision, fields });
  });

  // ---- Simulated checkout (accepted quotations only) ----
  // The methods are a radio group: choosing one (click, or arrow keys) shows its details beside it
  // without moving focus, so keyboard users can compare both before tabbing on.
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
      root.querySelector<HTMLButtonElement>('[data-q-method="card"]')!.focus();
    });
  }
  for (const button of root.querySelectorAll<HTMLButtonElement>('[data-q-outcome]')) {
    button.addEventListener('click', () => {
      // While an earlier result is unresolved, no fresh attempt: only "Check again" repeats that one.
      if (!method || !token || !view || view.status !== 'accepted' || busy || unresolved()) return;
      // Only the token, the version shown, method, outcome and a fresh id for this click: never the demo code.
      const fields = { token, version: String(view.version), method, outcome: button.dataset.qOutcome as CheckoutOutcome, attempt_id: crypto.randomUUID() };
      if (!savePending('simulate', fields)) return say(storageNeededText); // never send what could not be recovered
      void perform({ session, action: 'simulate', fields });
    });
  }
  $('[data-q-restart]').addEventListener('click', () => {
    method = null;
    step('method');
    $('#q-checkout-heading').focus();
  });
  retry.addEventListener('click', () => {
    const sent = uncertain;
    if (sent && sent.session === session) void perform(sent); // the identical request, repeated
  });

  // ---- Lifecycle ----
  /** Starts a new session for the link in the address (or this tab's stored link). */
  const begin = () => {
    session++;
    for (const controller of controllers) controller.abort();
    controllers.clear();
    setBusy(false);
    showRetry(null);
    view = null;
    method = null;
    confirmation = null;
    article.hidden = true;
    checkout.hidden = true;
    problem.hidden = true;
    for (const element of root.querySelectorAll('[data-q-scope], [data-q-amount], [data-q-greeting], [data-q-ref], [data-q-sum-ref], [data-q-sum-request], [data-q-sum-scope], [data-q-sum-amount]')) element.textContent = '';
    step('method');

    // "/quote/#" has an empty location.hash but is an explicit (invalid) link, not an absent one.
    const explicit = location.href.includes('#');
    const fromLink = explicit ? tokenFromFragment(location.hash) : null;
    if (explicit) history.replaceState(null, '', '/quote/'); // the token never stays in the address bar
    if (explicit && !fromLink) {
      // An explicit but unusable link: say so, and never fall back to an earlier quotation or its recovery.
      token = null;
      saveToken(null);
      clearPending();
      showProblem('This quotation link is incomplete or not valid. Open the complete link from your BuildTrack email.');
      return;
    }
    if (fromLink) saveToken(fromLink);
    token = fromLink ?? loadToken();
    if (!token) {
      clearPending();
      showProblem('Open the quotation link from your BuildTrack email. This page shows a quotation only through that link.');
      return;
    }
    // An unresolved action for exactly this link (sent before a reload) is restored first: the same
    // request, the lock and "Check again". A record for another link, or a malformed one, is dropped.
    const pending = parsePending(readPending(), token);
    if (pending) {
      showRetry({ session, action: pending.action, fields: pending.fields });
      say(restoredText(pending.action));
    } else clearPending();
    void perform({ session, action: 'view', fields: { token } });
  };

  window.addEventListener('pagehide', () => {
    // Clear what was shown, and the demo field, when leaving; a return loads it again.
    clearCode();
    article.hidden = true;
    checkout.hidden = true;
    for (const element of root.querySelectorAll('[data-q-scope], [data-q-amount], [data-q-greeting], [data-q-sum-scope], [data-q-sum-amount]')) element.textContent = '';
    view = null;
  });
  window.addEventListener('pageshow', (event) => {
    if (!event.persisted) return;
    // Back from the browser's page cache: an unresolved decision or checkout stays pending (its
    // request and lock are still held); otherwise load the link again.
    if (unresolved()) {
      say(uncertainText(uncertain!.action));
      showRetry(uncertain);
    } else begin();
  });
  // A link opened while this page is already showing changes only the fragment (no reload).
  window.addEventListener('hashchange', () => {
    if (location.href.includes('#')) begin();
  });

  if (typeof fetch !== 'function' || typeof AbortController !== 'function' || typeof crypto?.randomUUID !== 'function' || typeof history?.replaceState !== 'function') {
    showProblem('This browser cannot open quotation links. Use an up-to-date browser, or contact BuildTrack.');
    return;
  }
  begin();
}
