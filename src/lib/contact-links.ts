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
