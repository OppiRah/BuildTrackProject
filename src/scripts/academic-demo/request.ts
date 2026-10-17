// Academic demo, request page: stores a demo request (fictional sample customer, optional service and
// plan) in this browser. Service and plan are preselected from ?service= / ?plan= (the same allowlists
// as the Contact page). No network request is made. All text is set with textContent.

import { addDemoRequest, DEMO_STORE_KEY, demoIdentities, NOT_SURE, parseDemoState, planOf, serviceOf, identityOf, type DemoIdentityId, type DemoRequest } from '../../lib/academic-demo.ts';
import { parsePreselection } from '../../lib/inquiry-params.ts';

/** This tab's last demo request, so a reload keeps showing its receipt. */
const RECEIPT_KEY = 'buildtrack-academic-demo-receipt';

export function startDemoRequestPage(): void {
  const root = document.querySelector<HTMLElement>('[data-demo-request]');
  const form = root?.querySelector<HTMLFormElement>('[data-demo-form]');
  const confirmation = root?.querySelector<HTMLElement>('[data-demo-confirmation]');
  if (!root || !form || !confirmation) return;
  const $ = <T extends HTMLElement = HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const field = <T extends HTMLElement>(name: string) => form.elements.namedItem(name) as unknown as T;
  const identitySelect = field<HTMLSelectElement>('identity');
  const ack = field<HTMLInputElement>('ack');
  const ackError = $('#demo-ack-error');

  const selected = parsePreselection(location.search);
  if (selected.service) field<HTMLSelectElement>('service').value = selected.service;
  // Only plans with a proposed price are in the demo list; anything else stays "Not sure yet".
  if (selected.plan) field<HTMLSelectElement>('plan').value = selected.plan;
  if (field<HTMLSelectElement>('plan').selectedIndex < 0) field<HTMLSelectElement>('plan').value = '';

  const showSample = () => {
    const identity = demoIdentities.find((item) => item.id === identitySelect.value) ?? demoIdentities[0];
    for (const element of root.querySelectorAll<HTMLElement>('[data-sample]')) {
      element.textContent = identity[element.dataset.sample as 'name' | 'email' | 'organization' | 'organizationType' | 'projectNeed'];
    }
  };
  identitySelect.addEventListener('change', showSample);
  showSample();

  const setAckError = (show: boolean) => {
    ackError.hidden = !show;
    ack.closest('.field')!.classList.toggle('has-error', show);
    if (show) ack.setAttribute('aria-invalid', 'true');
    else ack.removeAttribute('aria-invalid');
  };
  ack.addEventListener('change', () => ack.checked && setAckError(false));

  function showReceipt(request: DemoRequest, focus: boolean) {
    $('[data-demo-reference]').textContent = request.ref;
    $('[data-confirm-service]').textContent = serviceOf(request)?.name ?? NOT_SURE;
    $('[data-confirm-plan]').textContent = planOf(request)?.name ?? NOT_SURE;
    const identity = identityOf(request);
    $('[data-confirm-customer]').textContent = `${identity.name}, ${identity.organization}`;
    form!.hidden = true;
    $('[data-form-heading]').hidden = true;
    confirmation!.hidden = false;
    if (focus) $('[data-demo-confirmation-heading]').focus();
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!ack.checked) {
      setAckError(true);
      ack.focus();
      return;
    }
    const service = field<HTMLSelectElement>('service').value || null;
    const plan = field<HTMLSelectElement>('plan').value || null;
    let request: DemoRequest;
    try {
      const state = parseDemoState(localStorage.getItem(DEMO_STORE_KEY));
      const added = addDemoRequest(state, identitySelect.value as DemoIdentityId, { plan, service }, Date.now(), crypto.randomUUID());
      localStorage.setItem(DEMO_STORE_KEY, JSON.stringify(added.state));
      request = added.request;
    } catch {
      window.alert('This browser did not allow the demo to store the request. The demo needs local storage.');
      return;
    }
    try {
      sessionStorage.setItem(RECEIPT_KEY, request.id);
    } catch {
      // Without session storage a reload simply shows the form again.
    }
    showReceipt(request, true);
  });

  $('[data-demo-again]').addEventListener('click', () => {
    try {
      sessionStorage.removeItem(RECEIPT_KEY);
    } catch {
      // Nothing to forget.
    }
    confirmation.hidden = true;
    form.hidden = false;
    $('[data-form-heading]').hidden = false;
    ack.checked = false;
    identitySelect.focus();
  });

  // A reload shows the receipt again while that demo request still exists (Reset demo data removes it).
  try {
    const id = sessionStorage.getItem(RECEIPT_KEY);
    const request = id ? parseDemoState(localStorage.getItem(DEMO_STORE_KEY)).requests.find((item) => item.id === id) : undefined;
    if (request) showReceipt(request, false);
  } catch {
    // Storage unavailable: the form is shown.
  }
}
