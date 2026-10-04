// Proposed academic pricing (ADR-006, ADR-025). Approved for the project proposal on
// 2026-10-04; not validated commercial pricing and not an operating subscription.
// Inclusions are cumulative: every plan has `allPlanInclusions`, plus the inclusions of
// the plan it `buildsOn`, plus its own. Onboarding and support replace, not add to,
// those of the plan it builds on. No overage charges or annual discounts exist.

export type PlanId = 'starter' | 'professional' | 'enterprise';

/** Per-organization limits across all of its active projects. */
export interface PlanLimits {
  activeProjects: number;
  namedUsers: number;
  materialRecords: number;
  equipmentRecords: number;
}

export interface Plan {
  id: PlanId;
  name: string;
  tier: 'basic' | 'advanced' | 'custom';
  /** One-line positioning of the tier (draft copy for owner review). */
  positioning: string;
  /** Proposed monthly price in Philippine pesos, per organization. */
  amountPhp: number | null;
  billingPeriod: 'month' | 'year' | null;
  /** The plan whose inclusions this plan also contains; null for the base plan. */
  buildsOn: PlanId | null;
  /** Capabilities added at this plan, beyond `allPlanInclusions` and the `buildsOn` plan. */
  includes: string[] | null;
  onboarding: string | null;
  support: string | null;
  limits: PlanLimits | null;
}

/** Capabilities included in every plan. */
export const allPlanInclusions = [
  'Material inventory, movement history and low-stock alerts',
  'Equipment status and project assignment',
  'Delivery status and receipt history',
  'QR-based identification and recording workflows',
];

export const plans: Plan[] = [
  {
    id: 'starter',
    name: 'Starter',
    tier: 'basic',
    positioning: 'Basic capabilities for teams beginning to track materials and equipment.',
    amountPhp: 2990,
    billingPeriod: 'month',
    buildsOn: null,
    includes: ['Basic project summaries'],
    onboarding: 'One 60-minute remote onboarding session',
    support: 'Standard email support',
    limits: { activeProjects: 2, namedUsers: 5, materialRecords: 500, equipmentRecords: 50 },
  },
  {
    id: 'professional',
    name: 'Professional',
    tier: 'advanced',
    positioning: 'Advanced capabilities for teams that need deeper visibility, alerts and reports.',
    amountPhp: 7990,
    billingPeriod: 'month',
    buildsOn: 'starter',
    includes: ['Equipment utilization and maintenance alerts', 'Cross-project visibility, reports and exports'],
    onboarding: 'Two 60-minute remote onboarding sessions in total',
    support: 'Priority email support',
    limits: { activeProjects: 8, namedUsers: 15, materialRecords: 2000, equipmentRecords: 200 },
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    tier: 'custom',
    positioning: 'Organization-wide reporting and oversight for large organizations and major projects.',
    amountPhp: 19990,
    billingPeriod: 'month',
    buildsOn: 'professional',
    includes: ['Organization-level summaries and consolidated management reporting', 'Cross-project equipment oversight'],
    onboarding: 'Three 60-minute remote onboarding sessions in total',
    support: 'Priority email support and scheduled support calls',
    limits: { activeProjects: 20, namedUsers: 40, materialRecords: 5000, equipmentRecords: 500 },
  },
];

/** Required public disclosure wherever prices appear. */
export const pricingNote =
  'Proposed academic pricing for the envisioned BuildTrack platform. This website demonstrates the concept and accepts inquiries; it does not activate a production subscription.';

export const priceBasis = 'per organization';

export const limitLabels: Record<keyof PlanLimits, { label: string; unit: string }> = {
  activeProjects: { label: 'Active projects', unit: 'active projects' },
  namedUsers: { label: 'Named users', unit: 'named users' },
  materialRecords: { label: 'Material records', unit: 'material records' },
  equipmentRecords: { label: 'Tracked equipment units', unit: 'individually tracked equipment units' },
};

export const limitDefinitions = [
  'A material record is one material type or SKU, whatever its quantity.',
  'An equipment record is one individually tracked asset.',
  'Limits apply per organization, across all of its active projects.',
];

/** Owner-approved list of separately quoted items and exclusions. */
export const exclusions: string[] | null = [
  'RFID/IoT hardware, gateways and connectivity',
  'Physical QR-label printing and user/scanning devices',
  'On-site installation, travel and additional training',
  'Data cleanup/migration and custom integrations',
  'Bespoke analytics, additional capacity and dedicated support arrangements',
];

export const tierLabels: Record<Plan['tier'], string> = { basic: 'Basic', advanced: 'Advanced', custom: 'Custom' };

export const formatPhp = (amount: number): string =>
  new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 }).format(amount);

export const formatCount = (value: number): string => new Intl.NumberFormat('en-PH').format(value);

/** Display text for a plan price; never invents a value. */
export function priceLabel(plan: Plan): string {
  if (plan.amountPhp === null) return 'Price pending approval';
  return plan.billingPeriod ? `${formatPhp(plan.amountPhp)} / ${plan.billingPeriod}` : formatPhp(plan.amountPhp);
}

/** Plan name with its price, for form options and the inquiry confirmation. */
export function planLabel(plan: Plan): string {
  return plan.amountPhp === null ? plan.name : `${plan.name} (${priceLabel(plan)})`;
}

/** Every capability a plan includes, in tier order: all-plan items, then each tier's additions. */
export function planInclusions(plan: Plan): string[] {
  const base = plan.buildsOn ? plans.find((candidate) => candidate.id === plan.buildsOn) : undefined;
  return [...(base ? planInclusions(base) : allPlanInclusions), ...(plan.includes ?? [])];
}
