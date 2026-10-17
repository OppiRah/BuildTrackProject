// Contact form enhancement WITH the quotation workflow (used only while QUOTATION_ON is true; the
// committed, workflow-off build uses the published src/scripts/inquiry.ts unchanged).
// Allowlisted preselection, validation messages, a single in-flight fetch submission and the
// accepted/failed states. Without JavaScript the form still POSTs natively to the provider.
// The quotation page's form (data-submit-mode="json") posts JSON to the BuildTrack
// quotation endpoint instead; while the workflow is enabled, a Contact link for a
// quotation is redirected there with only its allowlisted service and plan.
// All dynamic text is set with textContent; no innerHTML anywhere.

import { requestTypes } from '../config/inquiry.ts';
import { contactHref } from '../lib/contact-links.ts';
import { parsePreselection } from '../lib/inquiry-params.ts';
import { sendQuotationRequest } from '../lib/quotation/client.ts';
import { TURNSTILE_ON } from '../config/quotation.ts';
import { selectionLabels, sendInquiry, subjectLine, type FailedOutcome } from '../lib/inquiry-submit.ts';
import {
  inquiryFields,
  validateField,
  validateInquiry,
  type FieldErrors,
  type InquiryField,
  type InquiryValues,
} from '../lib/inquiry-validate.ts';

const TRIMMED_FIELDS: InquiryField[] = ['name', 'email', 'organization', 'phone', 'project_need', 'message'];

const failureCopy: Record<FailedOutcome['kind'], { heading: string; message: string }> = {
  rejected: {
    heading: 'Please fix the following',
    message: 'The form service could not accept some of your details. Your details are still here.',
  },
  'rate-limited': {
    heading: "We couldn't send your request",
    message: 'The form service is receiving too many requests. Your details are still here. Please wait a minute and try again.',
  },
  provider: {
    heading: "We couldn't send your request",
    message: "We couldn't send your request. Your details are still here. Please try again.",
  },
  network: {
    heading: "We couldn't send your request",
    message: "We couldn't reach the form service. Check your connection and try again.",
  },
  // Uncertain outcomes: the request may have arrived, so never claim it was not sent.
  unconfirmed: {
    heading: "We couldn't confirm your request",
    message:
      "The form service replied in an unexpected way, so we can't tell whether your request was accepted. Your details are still here. If you try again, the BuildTrack contact may receive it twice.",
  },
  timeout: {
    heading: "We couldn't confirm your request",
    message:
      "The form service did not finish responding in time, so we can't tell whether your request was received. Your details are still here. Check your connection; if you try again, the BuildTrack contact may receive it twice.",
  },
};

// The quotation endpoint de-duplicates an unchanged retry, so uncertain outcomes can be retried safely.
const quotationFailureCopy: Record<FailedOutcome['kind'], { heading: string; message: string }> = {
  rejected: {
    heading: 'Please fix the following',
    message: 'BuildTrack could not accept some of your details. Your details are still here.',
  },
  'rate-limited': {
    heading: "We couldn't send your request",
    message: 'Too many requests have been sent from this connection. Your details are still here. Please try again in an hour.',
  },
  provider: {
    heading: "We couldn't send your request",
    message: "We couldn't send your request. Your details are still here. Please try again.",
  },
  network: {
    heading: "We couldn't send your request",
    message: "We couldn't reach BuildTrack. Check your connection and try again.",
  },
  unconfirmed: {
    heading: "We couldn't confirm your request",
    message:
      "BuildTrack replied in an unexpected way, so we can't tell whether your request was stored. Your details are still here. Trying again without changing them will not create a second request.",
  },
  timeout: {
    heading: "We couldn't confirm your request",
    message:
      "BuildTrack did not finish responding in time, so we can't tell whether your request was stored. Your details are still here. Trying again without changing them will not create a second request.",
  },
};

export function initQuotationInquiry(): void {
  const root = document.querySelector<HTMLElement>('[data-inquiry]');
  const form = root?.querySelector<HTMLFormElement>('[data-inquiry-form]');
  const endpoint = form?.getAttribute('action');
  if (!root || !form || !endpoint) return;

  const quotationMode = form.dataset.submitMode === 'json';
  const preselection = parsePreselection(window.location.search);
  if (root.dataset.quotationPage && preselection.type === 'quotation') {
    window.location.replace(contactHref({ type: 'quotation', service: preselection.service, plan: preselection.plan }, true));
    return;
  }

  const q = <T extends Element>(selector: string, scope: ParentNode = root) => scope.querySelector<T>(selector)!;
  const summary = q<HTMLElement>('[data-error-summary]');
  const submit = q<HTMLButtonElement>('[data-submit]');
  const submitLabel = q<HTMLElement>('[data-submit-label]');
  const spinner = q<HTMLElement>('[data-spinner]');
  const status = q<HTMLElement>('[data-status]');
  const timeoutMs = Number(form.dataset.timeout) || 15000;
  const shownInvalid = new Set<InquiryField>();
  let inFlight = false;

  form.noValidate = true; // Messages come from inquiry-validate; native constraints remain for no-JS.

  /** The control that receives focus for a field (the checked or first radio for the request type). */
  const controlFor = (field: InquiryField): HTMLElement =>
    field === 'request_type'
      ? (form.querySelector<HTMLInputElement>('input[name="request_type"]:checked') ??
        q<HTMLInputElement>('input[name="request_type"]', form))
      : q<HTMLElement>(`#inquiry-${field}`, form);

  const radios = () => [...form.querySelectorAll<HTMLInputElement>('input[name="request_type"]')];

  const readValues = (): InquiryValues => {
    const data = new FormData(form);
    const values = {} as InquiryValues;
    for (const field of inquiryFields) {
      const value = data.get(field);
      values[field] = typeof value === 'string' ? value : '';
    }
    return values;
  };

  const updateSubmitLabel = () => {
    const type = requestTypes.find((item) => item.id === readValues().request_type);
    submitLabel.textContent = type ? `Send ${type.noun}` : 'Send request';
  };

  const showFieldError = (field: InquiryField, message: string | undefined) => {
    const group = form.querySelector<HTMLElement>(`[data-field="${field}"]`);
    if (!group) return; // The quotation form fixes the request type in a hidden field.
    const error = q<HTMLElement>(`#inquiry-${field}-error`, form);
    const controls = field === 'request_type' ? radios() : [controlFor(field)];
    group.classList.toggle('has-error', Boolean(message));
    error.hidden = !message;
    q<HTMLElement>('[data-error-text]', error).textContent = message ?? '';
    for (const control of controls) {
      const ids = (control.getAttribute('aria-describedby') ?? '').split(' ').filter((id) => id && id !== error.id);
      if (message) {
        control.setAttribute('aria-invalid', 'true');
        ids.push(error.id);
      } else {
        control.removeAttribute('aria-invalid');
      }
      if (ids.length) control.setAttribute('aria-describedby', ids.join(' '));
      else control.removeAttribute('aria-describedby');
    }
    if (message) shownInvalid.add(field);
    else shownInvalid.delete(field);
  };

  const hideSummary = () => {
    summary.hidden = true;
  };

  const showSummary = (heading: string, message: string, items: { text: string; field?: InquiryField }[], retry: boolean) => {
    q<HTMLElement>('[data-error-heading]', summary).textContent = heading;
    const messageEl = q<HTMLElement>('[data-error-message]', summary);
    messageEl.textContent = message;
    messageEl.hidden = message === '';
    const list = q<HTMLUListElement>('[data-error-list]', summary);
    list.replaceChildren(
      ...items.map(({ text, field }) => {
        const item = document.createElement('li');
        if (field) {
          const link = document.createElement('a');
          link.href = `#${controlFor(field).id}`;
          link.textContent = text;
          link.addEventListener('click', (event) => {
            event.preventDefault();
            controlFor(field).focus();
          });
          item.append(link);
        } else {
          item.textContent = text;
        }
        return item;
      }),
    );
    list.hidden = items.length === 0;
    summary.querySelector<HTMLElement>('[data-error-alternative]')?.toggleAttribute('hidden', !retry);
    q<HTMLElement>('[data-retry]', summary).hidden = !retry;
    summary.hidden = false;
    // Align the summary's top below the sticky header (scroll-padding); plain focus()
    // can leave the heading above the viewport when the summary is taller than it.
    summary.focus({ preventScroll: true });
    summary.scrollIntoView({ block: 'start' });
  };

  const showFieldErrors = (errors: FieldErrors) => {
    for (const field of inquiryFields) showFieldError(field, errors[field]);
  };

  const fieldItems = (errors: FieldErrors) =>
    inquiryFields.flatMap((field) => (errors[field] ? [{ text: errors[field], field }] : []));

  const setSubmitting = (submitting: boolean) => {
    submit.disabled = submitting;
    spinner.hidden = !submitting;
    form.setAttribute('aria-busy', String(submitting));
    if (submitting) {
      submitLabel.textContent = 'Sending request…';
      status.textContent = 'Sending your request';
    } else {
      status.textContent = '';
      updateSubmitLabel();
    }
  };

  const showConfirmation = (values: InquiryValues, reference: string | null = null) => {
    const labels = selectionLabels({ type: values.request_type, service: values.service, plan: values.plan });
    const confirmation = q<HTMLElement>('[data-confirmation]');
    const noun = confirmation.querySelector<HTMLElement>('[data-confirm-noun]');
    if (noun) noun.textContent = requestTypes.find((item) => item.id === values.request_type)?.noun ?? 'request';
    const referenceLine = confirmation.querySelector<HTMLElement>('[data-confirm-reference-line]');
    if (referenceLine && reference) {
      q<HTMLElement>('[data-confirm-reference]', referenceLine).textContent = reference;
      referenceLine.hidden = false;
    }
    q<HTMLElement>('[data-confirm-type]', confirmation).textContent = labels.type;
    q<HTMLElement>('[data-confirm-service]', confirmation).textContent = labels.service;
    q<HTMLElement>('[data-confirm-plan]', confirmation).textContent = labels.plan;
    form.hidden = true;
    confirmation.hidden = false;
    q<HTMLElement>('[data-confirmation-heading]', confirmation).focus();
  };

  const showFailure = (outcome: FailedOutcome) => {
    const copy = (quotationMode ? quotationFailureCopy : failureCopy)[outcome.kind];
    if (outcome.kind === 'rejected') {
      showFieldErrors(outcome.fieldErrors);
      const items = [...fieldItems(outcome.fieldErrors), ...outcome.formErrors.map((text) => ({ text }))];
      showSummary(copy.heading, copy.message, items, false);
      return;
    }
    const details = outcome.kind === 'provider' ? outcome.formErrors.map((text) => ({ text })) : [];
    showSummary(copy.heading, copy.message, details, true);
  };

  // Preselection: only allowlisted ids, applied to existing controls; every choice stays editable.
  if (preselection.type) {
    const radio = radios().find((input) => input.value === preselection.type);
    if (radio) radio.checked = true;
  }
  if (preselection.service) q<HTMLSelectElement>('#inquiry-service', form).value = preselection.service;
  if (preselection.plan) q<HTMLSelectElement>('#inquiry-plan', form).value = preselection.plan;
  updateSubmitLabel();

  form.addEventListener('change', (event) => {
    const target = event.target as HTMLInputElement;
    if (target.name === 'request_type') updateSubmitLabel();
    revalidate(target.name);
  });
  form.addEventListener('focusout', (event) => revalidate((event.target as HTMLInputElement).name));

  function revalidate(name: string) {
    const field = inquiryFields.find((candidate) => candidate === name);
    if (field && shownInvalid.has(field)) showFieldError(field, validateField(field, readValues()[field]));
  }

  summary.querySelector<HTMLButtonElement>('[data-retry]')!.addEventListener('click', () => form.requestSubmit());

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (inFlight) return; // Single in-flight request.

    const values = readValues();
    const errors = validateInquiry(values);
    showFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      showSummary('Please fix the following', '', fieldItems(errors), false);
      return;
    }

    hideSummary();
    if (quotationMode) {
      await submitQuotation(values);
      return;
    }
    const data = new FormData(form);
    for (const field of TRIMMED_FIELDS) data.set(field, values[field].trim());
    data.set('subject', subjectLine({ type: values.request_type, service: values.service, plan: values.plan }));

    inFlight = true;
    setSubmitting(true);
    const outcome = await sendInquiry(endpoint, data, { timeoutMs });
    inFlight = false;
    setSubmitting(false);

    if (outcome.kind === 'accepted') showConfirmation(values);
    else showFailure(outcome);
  });

  // A retry of unchanged details reuses the submission id, so the endpoint returns the
  // earlier reference instead of storing a second request; changed details get a new id.
  let lastPayload = '';
  let submissionId = '';
  async function submitQuotation(values: InquiryValues) {
    const payload: Record<string, string> = {};
    for (const field of inquiryFields) payload[field] = TRIMMED_FIELDS.includes(field) ? values[field].trim() : values[field];
    payload._gotcha = form!.querySelector<HTMLInputElement>('input[name="_gotcha"]')?.value ?? '';
    const serialized = JSON.stringify(payload);
    if (serialized !== lastPayload || !submissionId) {
      lastPayload = serialized;
      submissionId = crypto.randomUUID();
    }
    payload.submission_id = submissionId;
    // Challenge-gated mode (off): the Turnstile widget's single-use token travels with the request.
    if (TURNSTILE_ON) payload.turnstile_token = document.querySelector<HTMLInputElement>('input[name="cf-turnstile-response"]')?.value ?? '';

    inFlight = true;
    setSubmitting(true);
    const outcome = await sendQuotationRequest(endpoint!, payload, { timeoutMs });
    inFlight = false;
    setSubmitting(false);

    if (outcome.kind === 'accepted') showConfirmation(values, outcome.reference);
    else {
      showFailure(outcome);
      // Turnstile tokens are single-use: a new attempt needs a fresh check.
      if (TURNSTILE_ON) (window as unknown as { turnstile?: { reset(): void } }).turnstile?.reset();
    }
  }
}
