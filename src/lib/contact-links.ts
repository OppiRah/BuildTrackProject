// Builds Contact page links with request/service/plan preselection.
// Typed ids keep every CTA inside the allowlists used by the Contact page.
// While the quotation workflow is enabled, quotation links go to the dedicated
// quotation page instead, keeping only the service and plan.

import type { RequestTypeId } from '../config/inquiry.ts';
import type { PlanId } from '../config/pricing.ts';
import { quotationWorkflow } from '../config/quotation.ts';
import type { ServiceId } from '../config/services.ts';

export interface ContactSelection {
  type?: RequestTypeId;
  service?: ServiceId;
  plan?: PlanId;
}

export function contactHref({ type, service, plan }: ContactSelection = {}, workflowEnabled = quotationWorkflow.enabled): string {
  const toQuotationPage = workflowEnabled && type === 'quotation';
  const params = new URLSearchParams();
  if (type && !toQuotationPage) params.set('type', type);
  if (service) params.set('service', service);
  if (plan) params.set('plan', plan);
  const query = params.toString();
  const path = toQuotationPage ? quotationWorkflow.pagePath : '/contact/';
  return query ? `${path}?${query}` : path;
}

/** The public academic quotation demo, with the service and plan carried over. */
export const ACADEMIC_DEMO_PATH = '/academic-demo/';

/**
 * Quotation CTAs on Home and Pricing: the real quotation page while the workflow is enabled,
 * otherwise the public academic quotation demo (docs/DECISIONS.md ADR-043). The demo page labels
 * itself before anything is entered, and the Contact page's real request form is unchanged.
 */
export function quotationJourneyHref({ service, plan }: Omit<ContactSelection, 'type'> = {}, workflowEnabled = quotationWorkflow.enabled): string {
  if (workflowEnabled) return contactHref({ type: 'quotation', service, plan }, true);
  const params = new URLSearchParams();
  if (service) params.set('service', service);
  if (plan) params.set('plan', plan);
  const query = params.toString();
  return query ? `${ACADEMIC_DEMO_PATH}?${query}` : ACADEMIC_DEMO_PATH;
}
