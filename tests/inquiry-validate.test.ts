import { describe, expect, it } from 'vitest';
import { fieldLimits } from '../src/config/inquiry.ts';
import { PHONE_PATTERN, inquiryFields, validateField, validateInquiry, type InquiryValues } from '../src/lib/inquiry-validate.ts';

const valid: InquiryValues = {
  request_type: 'quotation',
  service: '',
  plan: '',
  name: 'Test Person',
  email: 'test@example.com',
  organization: 'Test Organization',
  phone: '',
  organization_type: 'contractors',
  project_need: 'Track cement across two sites',
  message: '',
  privacy_ack: 'yes',
};

const repeat = (length: number) => 'a'.repeat(length);

describe('validateInquiry', () => {
  it('accepts a complete valid inquiry with optional fields empty', () => {
    expect(validateInquiry(valid)).toEqual({});
  });

  it('reports every required field when the form is empty, in form order', () => {
    const empty = Object.fromEntries(inquiryFields.map((field) => [field, ''])) as InquiryValues;
    expect(Object.keys(validateInquiry(empty))).toEqual([
      'request_type',
      'name',
      'email',
      'organization',
      'organization_type',
      'project_need',
      'privacy_ack',
    ]);
  });
});

describe('validateField', () => {
  it('trims before checking required and length rules', () => {
    expect(validateField('name', '   ')).toBe('Enter your full name.');
    expect(validateField('name', ' A ')).toMatch(/at least 2/);
    expect(validateField('name', '  Al  ')).toBeUndefined();
    expect(validateField('project_need', '  abcd  ')).toMatch(/at least 5/);
  });

  it.each([
    ['name', fieldLimits.name.max],
    ['organization', fieldLimits.organization.max],
    ['project_need', fieldLimits.project_need.max],
    ['message', fieldLimits.message.max],
  ] as const)('enforces the %s maximum of %i characters', (field, max) => {
    expect(validateField(field, repeat(max))).toBeUndefined();
    expect(validateField(field, repeat(max + 1))).toMatch(new RegExp(`${max} characters or fewer`));
  });

  it('enforces the email maximum length', () => {
    const local = repeat(64);
    const longEmail = `${local}@${[repeat(63), repeat(63), repeat(63)].join('.')}`; // 255 chars
    expect(longEmail.length).toBeGreaterThan(fieldLimits.email.max);
    expect(validateField('email', longEmail)).toMatch(/254 characters or fewer/);
  });

  it.each(['name@company.com', 'first.last+tag@sub.example.ph', 'a@b'])('accepts browser-valid email %s', (email) => {
    expect(validateField('email', email)).toBeUndefined();
  });

  it.each(['plainaddress', 'name@', '@company.com', 'name @company.com', 'name@-company.com'])(
    'rejects invalid email %s',
    (email) => {
      expect(validateField('email', email)).toMatch(/valid email/);
    },
  );

  it('treats phone as optional and allows only digits, spaces and + - ( )', () => {
    expect(validateField('phone', '')).toBeUndefined();
    expect(validateField('phone', '+63 (2) 8123-4567')).toBeUndefined();
    expect(validateField('phone', '0917abc')).toMatch(/only digits/);
    expect(validateField('phone', repeat(0) + '1'.repeat(21))).toMatch(/20 characters or fewer/);
  });

  it('builds a phone pattern that is valid under the v flag used by browsers', () => {
    expect(() => new RegExp(`^(?:${PHONE_PATTERN})$`, 'v')).not.toThrow();
    expect(new RegExp(`^(?:${PHONE_PATTERN})$`, 'v').test('+63 (2) 8123-4567')).toBe(true);
  });

  it('accepts only allowlisted request types, services, plans and organization types', () => {
    expect(validateField('request_type', 'demo')).toBeUndefined();
    expect(validateField('request_type', 'purchase')).toBeDefined();
    expect(validateField('service', '')).toBeUndefined();
    expect(validateField('service', 'hardware-deployment')).toBeUndefined();
    expect(validateField('service', 'drones')).toBeDefined();
    expect(validateField('plan', 'enterprise')).toBeUndefined();
    expect(validateField('plan', 'gold')).toBeDefined();
    expect(validateField('organization_type', 'other')).toBeUndefined();
    expect(validateField('organization_type', 'equipment-rental')).toBeUndefined();
    expect(validateField('organization_type', '')).toBeDefined();
  });

  it('requires the privacy acknowledgment', () => {
    expect(validateField('privacy_ack', '')).toMatch(/Confirm/);
    expect(validateField('privacy_ack', 'yes')).toBeUndefined();
  });
});
