// Release-readiness rules (docs/ARCHITECTURE.md §5). Pure: takes a config
// snapshot and returns unmet requirements. Not part of `npm test` gating.

import { contact } from '../config/business.ts';
import { formProvider } from '../config/inquiry.ts';
import { exclusions, plans, type Plan, type PlanId } from '../config/pricing.ts';
import { site } from '../config/site.ts';

export interface ReleaseConfig {
  productionUrl: string | null;
  contact: { location: string | null; phone: string | null; publicEmail: string | null };
  formEndpoint: string | null;
  plans: Pick<Plan, 'id' | 'amountPhp' | 'billingPeriod' | 'includes' | 'onboarding' | 'support' | 'limits'>[];
  exclusions: string[] | null;
}

export interface ReleaseIssue {
  field: string;
  problem: string;
}

/** Requirements that cannot be verified from the repository and are still open. */
export const manualReleaseGates = [
  'Notification recipient verified in the form provider account (do not commit the address).',
  'Production test request received by the designated contact (record date and pass/fail only).',
];

/** Former manual gates closed by a recorded human decision (docs/PROJECT_STATE.md, DECISIONS.md). */
export const recordedApprovals = [
  'Privacy wording and confirmation wording for this academic prototype: approved by the human 2026-10-11.',
  'Public page copy (headlines, mission, vision, plan positioning, segment and service descriptions): approved by the human 2026-10-11.',
  'Final redesign and Home audience media (seven licensed stock clips and posters) for publication: approved by the human 2026-10-11.',
];

export function projectReleaseConfig(): ReleaseConfig {
  return {
    productionUrl: site.productionUrl,
    contact,
    formEndpoint: formProvider.endpoint,
    plans,
    exclusions,
  };
}

const isHttpsUrl = (value: string): boolean => {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
};

const isBlank = (value: string | null): boolean => value === null || value.trim() === '';

/** The approved package structure (ADR-006): each id exactly once. */
export const requiredPlanIds: readonly PlanId[] = ['starter', 'professional', 'enterprise'];

export function findReleaseIssues(config: ReleaseConfig): ReleaseIssue[] {
  const issues: ReleaseIssue[] = [];
  const add = (field: string, problem: string) => issues.push({ field, problem });

  if (config.productionUrl === null) add('site.productionUrl', 'not set');
  else if (!isHttpsUrl(config.productionUrl)) add('site.productionUrl', 'must be an absolute https:// URL');

  if (isBlank(config.contact.location)) add('contact.location', 'not set');
  if (isBlank(config.contact.phone)) add('contact.phone', 'not set');
  // contact.publicEmail is optional and never blocks release.

  if (config.formEndpoint === null) add('formProvider.endpoint', 'not set');
  else if (!isHttpsUrl(config.formEndpoint)) add('formProvider.endpoint', 'must be an absolute https:// URL');

  const ids = config.plans.map((plan) => String(plan.id));
  for (const id of requiredPlanIds) {
    const count = ids.filter((candidate) => candidate === id).length;
    if (count === 0) add(`plans.${id}`, 'missing');
    if (count > 1) add(`plans.${id}`, `duplicated (${count} entries)`);
  }
  for (const id of new Set(ids)) {
    if (!(requiredPlanIds as readonly string[]).includes(id)) add(`plans.${id}`, 'not an approved plan id');
  }

  for (const plan of config.plans) {
    const prefix = `plans.${plan.id}`;
    if (plan.amountPhp === null) add(`${prefix}.amountPhp`, 'not set');
    else if (!Number.isFinite(plan.amountPhp) || plan.amountPhp <= 0) add(`${prefix}.amountPhp`, 'must be a positive number');
    if (plan.billingPeriod === null) add(`${prefix}.billingPeriod`, 'not set');
    if (plan.includes === null || plan.includes.length === 0) add(`${prefix}.includes`, 'needs at least one approved item');
    else if (plan.includes.some(isBlank)) add(`${prefix}.includes`, 'contains a blank item');
    if (isBlank(plan.onboarding)) add(`${prefix}.onboarding`, 'not set');
    if (isBlank(plan.support)) add(`${prefix}.support`, 'not set');
    if (plan.limits === null) add(`${prefix}.limits`, 'not set');
    else if (Object.values(plan.limits).some((value) => !Number.isInteger(value) || value <= 0))
      add(`${prefix}.limits`, 'every limit must be a positive whole number');
  }

  if (config.exclusions === null) add('exclusions', 'not set (use an empty list if none)');
  else if (config.exclusions.some(isBlank)) add('exclusions', 'contains a blank item');

  return issues;
}
