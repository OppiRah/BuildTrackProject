// Inquiry field validation (docs/ARCHITECTURE.md §6.3). Pure: no DOM access.
// Mirrors the native constraint attributes so messages are consistent and testable.
// Client validation is usability only; the provider decides acceptance.

import { customerSegments } from '../config/business.ts';
import { fieldLimits, otherOrganizationType, requestTypes } from '../config/inquiry.ts';
import { plans } from '../config/pricing.ts';
import { services } from '../config/services.ts';

/** Submitted field names, in form order (also the error summary order). */
export const inquiryFields = [
  'request_type',
  'service',
  'plan',
  'name',
  'email',
  'organization',
  'phone',
  'organization_type',
  'project_need',
  'message',
  'privacy_ack',
] as const;

export type InquiryField = (typeof inquiryFields)[number];
export type InquiryValues = Record<InquiryField, string>;
export type FieldErrors = Partial<Record<InquiryField, string>>;

// The HTML living standard's valid e-mail address syntax, as used by <input type="email">.
const EMAIL_PATTERN =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

/** Digits, spaces and + - ( ). Also the phone input's `pattern` attribute, so it stays valid under the `v` flag. */
export const PHONE_PATTERN = '[0-9 +\\(\\)\\-]*';

const ids = (items: readonly { id: string }[]) => items.map((item) => item.id);
const allowed = {
  request_type: ids(requestTypes),
  service: ids(services),
  plan: ids(plans),
  organization_type: [...ids(customerSegments), otherOrganizationType.id],
};

export function isInquiryField(name: string): name is InquiryField {
  return (inquiryFields as readonly string[]).includes(name);
}

/** Validates one field's raw value; returns an error message or undefined. */
export function validateField(field: InquiryField, raw: string): string | undefined {
  const value = raw.trim();
  switch (field) {
    case 'request_type':
      return allowed.request_type.includes(value) ? undefined : 'Choose what you would like to do.';
    case 'service':
      return value === '' || allowed.service.includes(value) ? undefined : 'Choose a service from the list.';
    case 'plan':
      return value === '' || allowed.plan.includes(value) ? undefined : 'Choose a plan from the list.';
    case 'name':
      if (value === '') return 'Enter your full name.';
      if (value.length < fieldLimits.name.min) return `Enter at least ${fieldLimits.name.min} characters for your name.`;
      if (value.length > fieldLimits.name.max) return `Use ${fieldLimits.name.max} characters or fewer for your name.`;
      return undefined;
    case 'email':
      if (value === '') return 'Enter your email address, like name@company.com.';
      if (value.length > fieldLimits.email.max) return `Use ${fieldLimits.email.max} characters or fewer for your email address.`;
      return EMAIL_PATTERN.test(value) ? undefined : 'Enter a valid email address, like name@company.com.';
    case 'organization':
      if (value === '') return 'Enter the name of your organization.';
      if (value.length > fieldLimits.organization.max)
        return `Use ${fieldLimits.organization.max} characters or fewer for your organization.`;
      return undefined;
    case 'phone':
      if (value.length > fieldLimits.phone.max) return `Use ${fieldLimits.phone.max} characters or fewer for your phone number.`;
      return new RegExp(`^${PHONE_PATTERN}$`).test(value)
        ? undefined
        : 'Use only digits, spaces and + - ( ) in your phone number.';
    case 'organization_type':
      return allowed.organization_type.includes(value) ? undefined : 'Choose your organization type.';
    case 'project_need':
      if (value === '') return 'Describe your project need in a few words.';
      if (value.length < fieldLimits.project_need.min)
        return `Enter at least ${fieldLimits.project_need.min} characters for your project need.`;
      if (value.length > fieldLimits.project_need.max)
        return `Use ${fieldLimits.project_need.max} characters or fewer for your project need.`;
      return undefined;
    case 'message':
      return value.length > fieldLimits.message.max
        ? `Use ${fieldLimits.message.max} characters or fewer for your message.`
        : undefined;
    case 'privacy_ack':
      return value === '' ? 'Confirm that you understand how your details will be sent.' : undefined;
  }
}

/** Validates every field; returns only the invalid ones, in form order. */
export function validateInquiry(values: InquiryValues): FieldErrors {
  const errors: FieldErrors = {};
  for (const field of inquiryFields) {
    const message = validateField(field, values[field]);
    if (message) errors[field] = message;
  }
  return errors;
}
