// Request types, form fields and form provider settings. The endpoint is a public
// form URL, not a secret. No API keys or recipient addresses belong in this repository.

export const requestTypes = [
  { id: 'demo', label: 'Request a Demo', noun: 'demo request' },
  { id: 'quotation', label: 'Request a Quotation', noun: 'quotation request' },
  { id: 'service', label: 'Avail a Service', noun: 'service request' },
] as const;

export type RequestTypeId = (typeof requestTypes)[number]['id'];

export const formProvider = {
  name: 'Formspree',
  /** Public form endpoint URL (https), e.g. "https://formspree.io/f/<form id>". Null until the provider is set up. */
  endpoint: 'https://formspree.io/f/mljgrgjr' as string | null,
  timeoutMs: 15000,
};

/** Text-field length limits (docs/ARCHITECTURE.md §6.2), shared by the markup and validation. */
export const fieldLimits = {
  name: { min: 2, max: 100 },
  email: { max: 254 },
  organization: { max: 150 },
  phone: { max: 20 },
  project_need: { min: 5, max: 200 },
  message: { max: 2000 },
} as const;

/** Organization type option for anyone outside the seven customer segments. */
export const otherOrganizationType = { id: 'other', label: 'Other' } as const;

/**
 * DRAFT privacy acknowledgment: requires owner review before release (manual release gate).
 * States only what the form does; it makes no promise about the provider's retention or handling.
 */
export const privacyNotice = {
  status: 'draft' as 'draft' | 'approved',
  acknowledgment: `I understand my details will be sent to the BuildTrack contact through ${formProvider.name}, a third-party form service, to respond to this request.`,
  guidance: 'Only include details needed for this request. Do not enter payment or card details.',
};
