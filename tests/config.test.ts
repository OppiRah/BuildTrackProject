import { describe, expect, it } from 'vitest';
import { customerSegments } from '../src/config/business.ts';
import { formProvider, requestTypes } from '../src/config/inquiry.ts';
import {
  allPlanInclusions,
  exclusions,
  limitDefinitions,
  planInclusions,
  planLabel,
  plans,
  priceLabel,
  pricingNote,
} from '../src/config/pricing.ts';
import { services } from '../src/config/services.ts';
import { pages, secondaryPages } from '../src/config/site.ts';

const unique = (values: readonly string[]) => new Set(values).size === values.length;

describe('site config', () => {
  it('defines exactly the seven public routes in navigation order', () => {
    expect(pages.map((page) => page.path)).toEqual([
      '/',
      '/solutions/',
      '/how-it-works/',
      '/product-demo/',
      '/pricing/',
      '/about/',
      '/contact/',
    ]);
  });

  it('keeps the payment demo as a public page outside the main navigation', () => {
    expect(secondaryPages.map((page) => page.path)).toEqual(['/payment-demo/', '/academic-demo/', '/academic-demo/owner/', '/academic-demo/quote/', '/contact/quotation/']);
    expect(pages.map((page) => page.path)).not.toContain('/payment-demo/');
  });

  it('gives every page a unique path, title and description', () => {
    const all = [...pages, ...secondaryPages];
    expect(unique(all.map((page) => page.path))).toBe(true);
    expect(unique(all.map((page) => page.title))).toBe(true);
    expect(unique(all.map((page) => page.description))).toBe(true);
  });
});

describe('business config', () => {
  it('keeps exactly the seven approved BMC customer segments (ADR-005), in the approved order', () => {
    expect(customerSegments.map(({ id, label }) => ({ id, label }))).toEqual([
      { id: 'construction-companies', label: 'Construction companies (small, medium and large)' },
      { id: 'contractors', label: 'Contractors and subcontractors' },
      { id: 'project-managers', label: 'Project managers and site engineers' },
      { id: 'engineering-firms', label: 'Civil engineering firms' },
      { id: 'government-projects', label: 'Government infrastructure projects' },
      { id: 'real-estate-developers', label: 'Real estate developers' },
      { id: 'equipment-rental', label: 'Equipment rental companies' },
    ]);
  });
});

describe('allowlist ids', () => {
  it.each([
    ['request types', requestTypes.map((item) => item.id)],
    ['services', services.map((item) => item.id)],
    ['plans', plans.map((item) => item.id)],
  ])('%s are unique, lowercase kebab-case', (_name, ids) => {
    expect(unique(ids)).toBe(true);
    for (const id of ids) expect(id).toMatch(/^[a-z]+(-[a-z]+)*$/);
  });

  it('offers Starter, Professional and Enterprise plans', () => {
    expect(plans.map((plan) => plan.id)).toEqual(['starter', 'professional', 'enterprise']);
  });

  it('never contains a non-positive price', () => {
    for (const plan of plans) if (plan.amountPhp !== null) expect(plan.amountPhp).toBeGreaterThan(0);
  });
});

describe('inquiry config', () => {
  it('ships no test endpoint: the endpoint is unset or an https form URL on a real host', () => {
    const { endpoint } = formProvider;
    if (endpoint === null) return;
    const url = new URL(endpoint);
    expect(url.protocol).toBe('https:');
    expect(url.hostname).not.toMatch(/\.(invalid|test|localhost|example)$|^localhost$|^127\./);
  });
});

describe('pricing config (ADR-025)', () => {
  it('uses the approved monthly PHP prices per organization', () => {
    expect(plans.map(({ id, amountPhp, billingPeriod }) => ({ id, amountPhp, billingPeriod }))).toEqual([
      { id: 'starter', amountPhp: 2990, billingPeriod: 'month' },
      { id: 'professional', amountPhp: 7990, billingPeriod: 'month' },
      { id: 'enterprise', amountPhp: 19990, billingPeriod: 'month' },
    ]);
    expect(plans.map(priceLabel)).toEqual(['₱2,990 / month', '₱7,990 / month', '₱19,990 / month']);
  });

  it('uses the approved limits', () => {
    expect(plans.map((plan) => plan.limits)).toEqual([
      { activeProjects: 2, namedUsers: 5, materialRecords: 500, equipmentRecords: 50 },
      { activeProjects: 8, namedUsers: 15, materialRecords: 2000, equipmentRecords: 200 },
      { activeProjects: 20, namedUsers: 40, materialRecords: 5000, equipmentRecords: 500 },
    ]);
  });

  it('makes inheritance explicit: each plan builds on the previous one', () => {
    expect(plans.map((plan) => plan.buildsOn)).toEqual([null, 'starter', 'professional']);
  });

  it('resolves cumulative inclusions without duplicates', () => {
    const [starter, professional, enterprise] = plans.map(planInclusions);
    expect(starter).toEqual([...allPlanInclusions, 'Basic project summaries']);
    expect(professional).toEqual([...starter!, ...plans[1]!.includes!]);
    expect(enterprise).toEqual([...professional!, ...plans[2]!.includes!]);
    expect(new Set(enterprise).size).toBe(enterprise!.length);
  });

  it('gives each plan its own onboarding and support rather than accumulating them', () => {
    expect(plans.map((plan) => [plan.onboarding, plan.support])).toEqual([
      ['One 60-minute remote onboarding session', 'Standard email support'],
      ['Two 60-minute remote onboarding sessions in total', 'Priority email support'],
      ['Three 60-minute remote onboarding sessions in total', 'Priority email support and scheduled support calls'],
    ]);
  });

  it('labels plans with their price for the inquiry form', () => {
    expect(plans.map(planLabel)).toEqual([
      'Starter (₱2,990 / month)',
      'Professional (₱7,990 / month)',
      'Enterprise (₱19,990 / month)',
    ]);
  });

  it('carries the required disclosure and never claims popularity, overage charges or discounts', () => {
    expect(pricingNote).toBe(
      'Proposed academic pricing for the envisioned BuildTrack platform. This website demonstrates the concept and accepts inquiries; it does not activate a production subscription.',
    );
    const text = JSON.stringify({ plans, pricingNote, exclusions, limitDefinitions });
    expect(text).not.toMatch(/most popular|overage|discount|per year|annual/i);
  });
});
