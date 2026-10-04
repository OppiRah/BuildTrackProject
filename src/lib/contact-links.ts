// Builds Contact page links with request/service/plan preselection.
// Typed ids keep every CTA inside the allowlists used by the Contact page.

import type { RequestTypeId } from '../config/inquiry.ts';
import type { PlanId } from '../config/pricing.ts';
import type { ServiceId } from '../config/services.ts';

export interface ContactSelection {
  type?: RequestTypeId;
  service?: ServiceId;
  plan?: PlanId;
}

export function contactHref({ type, service, plan }: ContactSelection = {}): string {
  const params = new URLSearchParams();
  if (type) params.set('type', type);
  if (service) params.set('service', service);
  if (plan) params.set('plan', plan);
  const query = params.toString();
  return query ? `/contact/?${query}` : '/contact/';
}
