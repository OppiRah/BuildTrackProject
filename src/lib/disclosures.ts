// Public "what is real" disclosure copy for About and How It Works. Pure.
//
// Configuration is not verification: an endpoint only means the form is rendered,
// and a production URL (deliberately not an input here) does not mean the site is
// deployed. Status lines change only when a person has verified them and recorded the
// evidence in docs/PROJECT_STATE.md:
// - publication at the public address: verified 2026-10-04, so it is stated as working;
// - receipt of requests sent from the published site: still to come until confirmed.

export interface Disclosure {
  working: string[];
  stillToCome: string[];
  aboutSite: string;
  aboutForm: string;
}

const PRODUCTION_RECEIPT = 'Confirming that requests sent from the published website reach the BuildTrack contact';

export function disclosure(formRendered: boolean): Disclosure {
  return {
    working: [
      'This website, its pages and navigation, published at a public web address',
      formRendered
        ? 'An editable request form that starts with your chosen request, service or plan'
        : 'Request, service and plan choices carried in links to the Contact page',
      'The Interactive Platform Demo, using fictional data',
    ],
    stillToCome: [
      ...(formRendered
        ? []
        : ['An editable request form that starts with your chosen request, service or plan', 'Sending requests to the BuildTrack contact']),
      PRODUCTION_RECEIPT,
    ],
    aboutSite: 'This website is a working prototype, published at a public web address.',
    aboutForm: formRendered
      ? 'The request form sends requests to the BuildTrack contact through a form service. Confirming that requests from the published website arrive is still to come.'
      : 'The request form is not connected yet. Once connected, it will send real requests to the BuildTrack contact.',
  };
}
