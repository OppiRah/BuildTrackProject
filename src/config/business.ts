// Public contact identity, coverage and customer segments.
// The friend supplies location and phone. The form notification recipient is
// configured in the form provider account, not here.

export const contact = {
  /** Approved public business location (city and province only; no street address or office). Required for release. */
  location: 'Lingayen, Pangasinan' as string | null,
  /** Approved public phone number, as displayed. Required for release. */
  phone: '09510519642' as string | null,
  /** Telephone link for `phone`, in international format. */
  phoneHref: 'tel:+639510519642' as string | null,
  /** Optional public email address. Never required for release. */
  publicEmail: null as string | null,
};

export const coverage = {
  current: 'Philippines',
  futureVision: 'Southeast Asian expansion is a future vision, not current coverage.',
};

/** All original Business Model Canvas customer segments, with equal standing. */
export const customerSegments = [
  {
    id: 'construction-companies',
    label: 'Construction companies (small, medium and large)',
    need: 'One view of materials and equipment across every active site.',
  },
  {
    id: 'contractors',
    label: 'Contractors and subcontractors',
    need: 'Know what is on hand before work starts and account for what was used.',
  },
  {
    id: 'project-managers',
    label: 'Project managers and site engineers',
    need: 'Spot low stock, idle equipment and late deliveries before they delay work.',
  },
  {
    id: 'engineering-firms',
    label: 'Civil engineering firms',
    need: 'Keep resource records consistent across design, supervision and construction.',
  },
  {
    id: 'government-projects',
    label: 'Government infrastructure projects',
    need: 'Clear, traceable records of materials and equipment on public works.',
  },
  {
    id: 'real-estate-developers',
    label: 'Real estate developers',
    need: 'Follow resource use and progress across several developments.',
  },
  {
    id: 'equipment-rental',
    label: 'Equipment rental companies',
    need: 'Track where rented units are, how they are used and when they are due back.',
  },
] as const;
