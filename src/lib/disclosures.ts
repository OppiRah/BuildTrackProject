// Public "what is real" disclosure copy for About and How It Works. Pure.
//
// Configuration is not verification: an endpoint only means the form is rendered,
// and a production URL (deliberately not an input here) does not mean the site is
// deployed. Publication and receipt of requests from the published site stay listed
// as still to come until a person verifies them (docs/PROJECT_STATE.md) and edits
// this copy; evidence lives in project state, not in configuration.

export interface Disclosure {
  working: string[];
  stillToCome: string[];
  aboutSite: string;
  aboutForm: string;
}

const PUBLICATION = 'Publication at a public web address';
const PRODUCTION_RECEIPT = 'Confirming that requests sent from the published website reach the BuildTrack contact';

export function disclosure(formRendered: boolean): Disclosure {
  return {
    working: [
      'This website, its pages and navigation',
      formRendered
        ? 'An editable request form that starts with your chosen request, service or plan'
        : 'Request, service and plan choices carried in links to the Contact page',
      'The Interactive Platform Demo, using fictional data',
    ],
    stillToCome: [
      ...(formRendered
        ? []
        : ['An editable request form that starts with your chosen request, service or plan', 'Sending requests to the BuildTrack contact']),
      PUBLICATION,
      PRODUCTION_RECEIPT,
    ],
    aboutSite: 'This website is a working prototype. Publication at a public address is still to come.',
    aboutForm: formRendered
      ? 'The request form sends requests to the BuildTrack contact through a form service. Confirming that requests from the published website arrive is still to come.'
      : 'The request form is not connected yet. Once connected, it will send real requests to the BuildTrack contact.',
  };
}
