// Parses Contact page preselection (?type=, ?service=, ?plan=) against the
// allowlists (docs/ARCHITECTURE.md §6.1). Pure: no DOM access.
// Unknown, empty, differently cased or repeated values are discarded silently.

import { requestTypes, type RequestTypeId } from '../config/inquiry.ts';
import { plans, type PlanId } from '../config/pricing.ts';
import { services, type ServiceId } from '../config/services.ts';

export interface Preselection {
  type?: RequestTypeId;
  service?: ServiceId;
  plan?: PlanId;
}

function pick<T extends string>(params: URLSearchParams, key: string, allowed: readonly T[]): T | undefined {
  const values = params.getAll(key);
  if (values.length !== 1) return undefined;
  return allowed.find((id) => id === values[0]);
}

export function parsePreselection(search: string): Preselection {
  const params = new URLSearchParams(search);
  const plan = pick(params, 'plan', plans.map((item) => item.id));
  const service = pick(params, 'service', services.map((item) => item.id));
  // A plan implies availing a service; a service alone implies a quotation.
  const type =
    pick(params, 'type', requestTypes.map((item) => item.id)) ??
    (plan ? 'service' : service ? 'quotation' : undefined);

  const result: Preselection = {};
  if (type) result.type = type;
  if (service) result.service = service;
  if (plan) result.plan = plan;
  return result;
}
