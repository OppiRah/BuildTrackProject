import { describe, expect, it } from 'vitest';
import { findReleaseIssues, projectReleaseConfig, type ReleaseConfig } from '../src/lib/release-check.ts';

const complete = (): ReleaseConfig => ({
  productionUrl: 'https://buildtrack.example',
  contact: { location: 'Test City, Test Province', phone: '+63 900 000 0000', publicEmail: null },
  formEndpoint: 'https://forms.example/f/test',
  plans: (['starter', 'professional', 'enterprise'] as const).map((id) => ({
    id,
    amountPhp: 1000,
    billingPeriod: 'month' as const,
    includes: ['Approved item'],
    onboarding: 'Approved onboarding',
    support: 'Approved support',
    limits: { activeProjects: 1, namedUsers: 1, materialRecords: 1, equipmentRecords: 1 },
  })),
  exclusions: [],
});

const fields = (config: ReleaseConfig) => findReleaseIssues(config).map((issue) => issue.field);

describe('findReleaseIssues', () => {
  it('passes a complete config with no optional public email', () => {
    expect(findReleaseIssues(complete())).toEqual([]);
  });

  it('accepts an empty exclusions list as an approved value', () => {
    const config = complete();
    config.exclusions = [];
    expect(fields(config)).toEqual([]);
  });

  it('requires onboarding, support and positive whole-number limits for each plan', () => {
    const config = complete();
    config.plans[0] = { ...config.plans[0], onboarding: null, support: '  ' };
    config.plans[1].limits = { activeProjects: 0, namedUsers: 1, materialRecords: 1, equipmentRecords: 1 };
    config.plans[2].limits = { activeProjects: 1, namedUsers: 1.5, materialRecords: 1, equipmentRecords: 1 };
    expect(fields(config)).toEqual([
      'plans.starter.onboarding',
      'plans.starter.support',
      'plans.professional.limits',
      'plans.enterprise.limits',
    ]);
  });

  it('reports each missing required contact field individually', () => {
    const config = complete();
    config.contact.location = null;
    config.contact.phone = '   ';
    expect(fields(config)).toEqual(['contact.location', 'contact.phone']);
  });

  it('never reports the optional public email', () => {
    const config = complete();
    config.contact.publicEmail = null;
    expect(fields(config)).not.toContain('contact.publicEmail');
  });

  it('requires a numeric positive price for every plan, including Enterprise', () => {
    const config = complete();
    config.plans[2].amountPhp = null;
    config.plans[1].amountPhp = 0;
    expect(fields(config)).toEqual(['plans.professional.amountPhp', 'plans.enterprise.amountPhp']);
  });

  it('reports missing billing period, inclusions, limits and exclusions', () => {
    const config = complete();
    config.plans[0] = { ...config.plans[0], billingPeriod: null, includes: [], limits: null };
    config.exclusions = null;
    expect(fields(config)).toEqual([
      'plans.starter.billingPeriod',
      'plans.starter.includes',
      'plans.starter.limits',
      'exclusions',
    ]);
  });

  it('rejects blank or whitespace-only list items', () => {
    const config = complete();
    config.plans[0].includes = ['Approved item', '   '];
    config.plans[1].includes = [''];
    config.exclusions = ['Hardware', ' '];
    expect(fields(config)).toEqual([
      'plans.starter.includes',
      'plans.professional.includes',
      'exclusions',
    ]);
  });

  it('requires each approved plan id exactly once', () => {
    const missing = complete();
    missing.plans = missing.plans.filter((plan) => plan.id !== 'enterprise');
    expect(fields(missing)).toEqual(['plans.enterprise']);

    const duplicated = complete();
    duplicated.plans.push({ ...duplicated.plans[1] });
    expect(findReleaseIssues(duplicated)).toEqual([
      { field: 'plans.professional', problem: 'duplicated (2 entries)' },
    ]);
  });

  it('rejects plan ids outside the approved structure', () => {
    const config = complete();
    config.plans.push({ ...config.plans[0], id: 'premium' as never });
    expect(fields(config)).toEqual(['plans.premium']);
  });

  it('requires https URLs for the production site and form endpoint', () => {
    const config = complete();
    config.productionUrl = 'http://buildtrack.example';
    config.formEndpoint = 'not a url';
    expect(fields(config)).toEqual(['site.productionUrl', 'formProvider.endpoint']);
  });
});

describe('projectReleaseConfig', () => {
  it('reads the real config without requiring it to be release-ready', () => {
    const config = projectReleaseConfig();
    expect(config.plans.map((plan) => plan.id)).toEqual(['starter', 'professional', 'enterprise']);
    expect(Array.isArray(findReleaseIssues(config))).toBe(true);
  });
});
