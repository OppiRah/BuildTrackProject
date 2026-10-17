// Academic demo, tab 1: stores a demo request (fictional sample customer and a plan) in this browser.
// No network request is made.

import { addDemoRequest, DEMO_STORE_KEY, parseDemoState, type DemoIdentityId } from '../../lib/academic-demo.ts';

export function startDemoRequestPage(): void {
  const root = document.querySelector<HTMLElement>('[data-demo-request]');
  const form = root?.querySelector<HTMLFormElement>('[data-demo-form]');
  const confirmation = root?.querySelector<HTMLElement>('[data-demo-confirmation]');
  if (!root || !form || !confirmation) return;

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const identity = (form.elements.namedItem('identity') as RadioNodeList).value as DemoIdentityId;
    const plan = (form.elements.namedItem('plan') as HTMLSelectElement).value;
    let reference: string;
    try {
      const state = parseDemoState(localStorage.getItem(DEMO_STORE_KEY));
      const added = addDemoRequest(state, identity, plan, Date.now(), crypto.randomUUID());
      localStorage.setItem(DEMO_STORE_KEY, JSON.stringify(added.state));
      reference = added.request.ref;
    } catch {
      window.alert('This browser did not allow the demo to store the request. The demo needs local storage.');
      return;
    }
    root.querySelector<HTMLElement>('[data-demo-reference]')!.textContent = reference;
    form.hidden = true;
    confirmation.hidden = false;
    root.querySelector<HTMLElement>('[data-demo-confirmation-heading]')!.focus();
  });

  root.querySelector<HTMLButtonElement>('[data-demo-again]')!.addEventListener('click', () => {
    confirmation.hidden = true;
    form.hidden = false;
    form.querySelector<HTMLInputElement>('input[name="identity"]')!.focus();
  });
}
