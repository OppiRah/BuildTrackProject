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

/** Public pages outside the main navigation, linked from other pages. */
export const secondaryPages = [
  {
    path: '/payment-demo/',
    navLabel: 'Payment demo',
    title: 'Payment Demo | BuildTrack',
    description: 'An academic payment demonstration for BuildTrack: a sample quotation, illustrative emails and a simulated payment. No real payment or email is sent.',
  },
  {
    // Public academic demo of the quotation workflow (src/lib/academic-demo.ts): browser-only, fictional.
    path: '/academic-demo/',
    navLabel: 'Academic quotation demo',
    title: 'Academic Quotation Demo | BuildTrack',
    description: 'An academic demonstration of the BuildTrack quotation workflow with fictional sample customers. Nothing is sent or stored outside your browser.',
  },
  {
    path: '/academic-demo/owner/',
    navLabel: 'Demo owner dashboard',
    title: 'Demo Owner Dashboard | BuildTrack academic demo',
    description: 'The academic demo owner dashboard: review and approve fictional demo quotation requests kept in this browser.',
  },
  {
    path: '/academic-demo/quote/',
    navLabel: 'Demo quotation',
    title: 'Demo Quotation | BuildTrack academic demo',
    description: 'A fictional BuildTrack quotation from the academic demo, with the demo checkout. No money moves.',
  },
  {
    // Built only while the quotation workflow is enabled (src/config/quotation.ts).
    path: '/contact/quotation/',
    navLabel: 'Request a quotation',
    title: 'Request a Quotation | BuildTrack',
    description: 'Request a proposed BuildTrack quotation. BuildTrack reviews every request before any quotation is emailed.',
  },
] as const satisfies readonly PageMeta[];

export type PagePath = (typeof pages)[number]['path'] | (typeof secondaryPages)[number]['path'];

export function pageMeta(path: PagePath): PageMeta {
  const page = [...pages, ...secondaryPages].find((candidate) => candidate.path === path);
  if (!page) throw new Error(`No page metadata for ${path}`);
  return page;
}

export const primaryCta = { label: 'Request a Demo', href: contactHref({ type: 'demo' }) };
