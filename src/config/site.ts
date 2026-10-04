// Brand, production URL, navigation and per-page metadata.
// Unresolved values are null and listed by `npm run check:release`.

import { contactHref } from '../lib/contact-links.ts';

export const site = {
  name: 'BuildTrack',
  tagline: 'Smart Construction. Smarter Delivery.',
  description:
    'BuildTrack is a proposed smart construction materials and equipment management system for efficient project delivery services.',
  /** Final public HTTPS URL, e.g. "https://example.com". Set before release. */
  productionUrl: 'https://buildtrack.sunnydelacruz.workers.dev' as string | null,
};

export interface PageMeta {
  path: string;
  navLabel: string;
  title: string;
  description: string;
}

/** The seven public pages, in navigation order. */
export const pages = [
  {
    path: '/',
    navLabel: 'Home',
    title: 'BuildTrack | Smart Construction. Smarter Delivery.',
    description: site.description,
  },
  {
    path: '/solutions/',
    navLabel: 'Solutions',
    title: 'Solutions | BuildTrack',
    description: 'Proposed BuildTrack solutions for construction materials, equipment, inventory and project visibility.',
  },
  {
    path: '/how-it-works/',
    navLabel: 'How It Works',
    title: 'How It Works | BuildTrack',
    description: 'How the proposed BuildTrack platform would tag, capture and report on construction resources.',
  },
  {
    path: '/product-demo/',
    navLabel: 'Product Demo',
    title: 'Interactive Platform Demo | BuildTrack',
    description: 'An interactive demonstration of the proposed BuildTrack dashboard using fictional sample data.',
  },
  {
    path: '/pricing/',
    navLabel: 'Pricing',
    title: 'Pricing | BuildTrack',
    description: 'Proposed Starter, Professional and Enterprise packages for BuildTrack in Philippine pesos.',
  },
  {
    path: '/about/',
    navLabel: 'About',
    title: 'About | BuildTrack',
    description: 'Background, mission and vision of BuildTrack, an academic construction-technology business proposal.',
  },
  {
    path: '/contact/',
    navLabel: 'Contact',
    title: 'Contact | BuildTrack',
    description: 'Request a demo, request a quotation or avail a BuildTrack service.',
  },
] as const satisfies readonly PageMeta[];

export type PagePath = (typeof pages)[number]['path'];

export function pageMeta(path: PagePath): PageMeta {
  const page = pages.find((candidate) => candidate.path === path);
  if (!page) throw new Error(`No page metadata for ${path}`);
  return page;
}

export const primaryCta = { label: 'Request a Demo', href: contactHref({ type: 'demo' }) };
