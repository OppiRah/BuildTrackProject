// Academic demo, tab 2: the demo owner dashboard. Reads and changes only the browser-only demo record
// (src/lib/academic-demo.ts); no network request is made and no email is sent. All text is set with
// textContent.

import {
  approveDemoQuote,
  checkDemoDraft,
  DEMO_STORE_KEY,
  demoToken,
  emptyDemoState,
  identityOf,
  NOT_SURE,
  parseDemoState,
  planOf,
  serviceOf,
  suggestedScope,
  type DemoRequest,
  type DemoState,
} from '../../lib/academic-demo.ts';
import { checkoutMethodLabels } from '../../lib/quotation/customer.ts';
import { formatAmount } from '../../lib/quotation/owner-form.ts';
import { formatExpiry } from '../../lib/quotation/quote-page.ts';
import { outcomeMessages } from '../../lib/payment-walkthrough.ts';

const when = (ms: number) => new Date(ms).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });
const statusText: Record<'approved' | 'accepted' | 'declined', string> = { approved: 'approved', accepted: 'accepted', declined: 'declined' };
/** The request open in this tab, so a reload returns to it. */
const VIEW_KEY = 'buildtrack-academic-demo-owner-view';
const planName = (request: DemoRequest) => planOf(request)?.name ?? NOT_SURE;
const serviceName = (request: DemoRequest) => serviceOf(request)?.name ?? NOT_SURE;
function remember(id: string | null) {
  try {
    if (id) sessionStorage.setItem(VIEW_KEY, id);
    else sessionStorage.removeItem(VIEW_KEY);
  } catch {
    // Without session storage a reload shows the list.
  }
}

function readState(): DemoState {
  try {
    return parseDemoState(localStorage.getItem(DEMO_STORE_KEY));
  } catch {
    return emptyDemoState();
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

/** The demo invitation text: the real invitation's wording, with the demo link. */
function invitationText(request: DemoRequest, link: string): { subject: string; text: string } {
  const quote = request.quote!;
  const identity = identityOf(request);
  return {
    subject: `Your BuildTrack quotation ${quote.ref}`,
    text: [
      `Hello ${identity.name},`,
      '',
      `BuildTrack has prepared quotation ${quote.ref} for your request ${request.ref}.`,
      '',
      'Scope:',
      quote.scope,
      '',
      `Amount: ${formatAmount(quote.amountCentavos)} (PHP)`,
      `This link works until ${formatExpiry(quote.expiresAt)}:`,
      link,
      '',
      'BuildTrack is an academic project. No payment is due, and BuildTrack will never ask you for card or bank details by email.',
      'ACADEMIC DEMO: this invitation is fictional and is not emailed.',
    ].join('\n'),
  };
}

function fillList(dl: HTMLElement, rows: [string, string][]) {
  dl.replaceChildren(
    ...rows.flatMap(([term, value]) => {
      const dt = document.createElement('dt');
      dt.textContent = term;
      const dd = document.createElement('dd');
      dd.textContent = value;
      return [dt, dd];
    }),
  );
}

export function startDemoOwnerPage(): void {
  const root = document.querySelector<HTMLElement>('[data-demo-owner]');
  if (!root) return;
  const $ = <T extends HTMLElement = HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const views = { list: $('[data-view="list"]'), detail: $('[data-view="detail"]') };
  const parts = { draft: $('[data-part="draft"]'), confirm: $('[data-part="confirm"]'), approved: $('[data-part="approved"]') };
  const form = $<HTMLFormElement>('[data-draft-form]');
  let current: string | null = null; // the request on screen
  let pending: { requestId: string; values: { scope: string; amountCentavos: number; validityDays: number } } | null = null;

  const show = (view: 'list' | 'detail') => {
    views.list.hidden = view !== 'list';
    views.detail.hidden = view !== 'detail';
  };
  const showPart = (part: 'draft' | 'confirm' | 'approved') => {
    for (const [name, element] of Object.entries(parts)) element.hidden = name !== part;
  };

  function renderList() {
    const state = readState();
    const rows = [...state.requests].reverse().map((request) => {
      const tr = document.createElement('tr');
      const ref = document.createElement('td');
      const open = document.createElement('button');
      open.type = 'button';
      open.className = 'link';
      open.textContent = request.ref;
      open.addEventListener('click', () => openRequest(request.id));
      ref.append(open);
      const identity = identityOf(request);
      const status = request.quote ? `Quotation ${request.quote.ref}: ${statusText[request.quote.status]}` : 'Received, no quotation yet';
      const cells = [when(request.createdAt), identity.name, identity.organization, serviceName(request), planName(request), status].map((text) => {
        const td = document.createElement('td');
        td.textContent = text;
        return td;
      });
      tr.append(ref, ...cells);
      return tr;
    });
    $('[data-rows]').replaceChildren(...rows);
    $('[data-empty]').hidden = rows.length > 0;
  }

  function openRequest(id: string) {
    current = id;
    remember(id);
    pending = null;
    form.reset();
    for (const name of ['scope', 'amount', 'validity'] as const) fieldError(name, undefined);
    renderDetail();
    show('detail');
    $('[data-detail-heading]').focus();
  }

  function renderDetail() {
    const request = readState().requests.find((item) => item.id === current);
    if (!request) {
      current = null;
      remember(null);
      show('list');
      renderList();
      return;
    }
    const identity = identityOf(request);
    $('[data-detail-heading]').textContent = `Demo request ${request.ref}`;
    fillList($('[data-request-details]'), [
      ['Reference', request.ref],
      ['Received', when(request.createdAt)],
      ['Name (fictional)', identity.name],
      ['Email (fictional)', identity.email],
      ['Organization', identity.organization],
      ['Organization type', identity.organizationType],
      ['Service of interest', serviceName(request)],
      ['Plan of interest', planName(request)],
      ['Project need', identity.projectNeed],
    ]);
    if (request.quote) return renderApproved(request);
    if (pending?.requestId === request.id) return showPart('confirm');
    const plan = planOf(request);
    const scope = form.elements.namedItem('scope') as HTMLTextAreaElement;
    const amount = form.elements.namedItem('amount') as HTMLInputElement;
    if (!scope.value) scope.value = suggestedScope(request);
    if (!amount.value && plan) amount.value = plan.amountPhp.toLocaleString('en-PH');
    $('[data-prefill]').textContent = plan
      ? `Prefilled from the proposed ${plan.name} price; change it as needed.`
      : 'No plan was chosen: enter the amount for this quotation.';
    showPart('draft');
  }

  function renderApproved(request: DemoRequest) {
    const quote = request.quote!;
    const link = `${location.origin}/academic-demo/quote/#d=${quote.token}`;
    $('[data-quote-heading]').textContent = `Quotation ${quote.ref}: ${statusText[quote.status]}`;
    fillList($('[data-quote-details]'), [
      ['Recipient (fictional)', `${identityOf(request).name} <${identityOf(request).email}>`],
      ['Service', serviceName(request)],
      ['Plan', planName(request)],
      ['Scope', quote.scope],
      ['Amount', formatAmount(quote.amountCentavos)],
      ['Approved', when(quote.approvedAt)],
      ['Link expires', `${formatExpiry(quote.expiresAt)} (${quote.validityDays} days after approval)`],
      ['Customer decision', quote.status === 'approved' ? 'Waiting for the customer' : `${quote.status === 'accepted' ? 'Accepted' : 'Declined'} ${when(quote.decidedAt!)}`],
    ]);
    const invitation = invitationText(request, link);
    $<HTMLAnchorElement>('[data-open-invitation]').href = link;
    $<HTMLInputElement>('#demo-invitation-to').value = identityOf(request).email;
    $<HTMLInputElement>('#demo-invitation-subject').value = invitation.subject;
    $<HTMLTextAreaElement>('#demo-invitation-text').value = invitation.text;
    $('[data-history-list]').replaceChildren(
      ...quote.simulations.map((s) => {
        const item = document.createElement('li');
        item.textContent = `${outcomeMessages[s.outcome].title} · ${checkoutMethodLabels[s.method]} · ${when(s.at)}`;
        return item;
      }),
    );
    $('[data-history]').hidden = quote.simulations.length === 0;
    showPart('approved');
  }

  const fieldError = (name: 'scope' | 'amount' | 'validity', message: string | undefined) => {
    const error = $(`#demo-${name}-error`);
    error.textContent = message ?? '';
    error.hidden = !message;
  };

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const field = (name: string) => (form.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement).value;
    const checked = checkDemoDraft({ scope: field('scope'), amount: field('amount'), validity_days: field('validity_days') });
    fieldError('scope', 'errors' in checked ? checked.errors.scope : undefined);
    fieldError('amount', 'errors' in checked ? checked.errors.amount : undefined);
    fieldError('validity', 'errors' in checked ? checked.errors.validity_days : undefined);
    if ('errors' in checked || !current) return;
    pending = { requestId: current, values: checked.values };
    const request = readState().requests.find((item) => item.id === current);
    fillList($('[data-confirm-details]'), [
      ['Service', request ? serviceName(request) : NOT_SURE],
      ['Plan', request ? planName(request) : NOT_SURE],
      ['Scope', checked.values.scope],
      ['Amount', formatAmount(checked.values.amountCentavos)],
      ['Validity', `${checked.values.validityDays} days after approval`],
    ]);
    showPart('confirm');
  });
  $('[data-edit]').addEventListener('click', () => {
    pending = null;
    showPart('draft');
  });
  $('[data-approve]').addEventListener('click', () => {
    if (!pending || pending.requestId !== current) return;
    const approved = approveDemoQuote(readState(), pending.requestId, pending.values, Date.now(), demoToken());
    pending = null;
    if (!writeState(approved)) return window.alert('This browser did not allow the demo to save. Nothing was approved.');
    form.reset();
    renderDetail();
  });
  $('[data-copy]').addEventListener('click', async () => {
    const text = $<HTMLTextAreaElement>('#demo-invitation-text');
    let copied = false;
    try {
      await navigator.clipboard.writeText(text.value);
      copied = true;
    } catch {
      text.select();
    }
    $('[data-copy-status]').textContent = copied
      ? 'Email text copied. Academic demo: nothing has been sent.'
      : 'The browser blocked copying; the text is selected. Academic demo: nothing has been sent.';
  });
  $('[data-back]').addEventListener('click', () => {
    current = null;
    remember(null);
    pending = null;
    renderList();
    show('list');
  });
  $('[data-reset]').addEventListener('click', () => {
    if (!window.confirm('Delete all academic demo requests stored in this browser?')) return;
    try {
      localStorage.removeItem(DEMO_STORE_KEY);
    } catch {
      // Nothing stored, or storage unavailable.
    }
    renderList();
  });

  // Requests sent from tab 1 and customer decisions from tab 3 appear without a reload.
  window.addEventListener('storage', (event) => {
    if (event.key !== DEMO_STORE_KEY && event.key !== null) return;
    if (current && !views.detail.hidden) renderDetail();
    else renderList();
  });
  renderList();
  show('list');
  // A reload returns to the request that was open in this tab, while it still exists.
  let reopen: string | null = null;
  try {
    reopen = sessionStorage.getItem(VIEW_KEY);
  } catch {
    // Storage unavailable: the list is shown.
  }
  if (reopen && readState().requests.some((item) => item.id === reopen)) openRequest(reopen);
}
