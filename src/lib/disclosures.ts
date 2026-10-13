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
  /** The demo's estimate (a working calculation) and the payment demo page (a simulation, no provider connected). */
  estimator: string;
  payment: string;
}

/** Owner authorization to build is not Civil Engineering validation. */
const ESTIMATOR =
  "The demo's concrete estimate calculates volume, mixer batches and idealized time from your inputs: a working calculation for teaching, not yet reviewed by a civil engineer.";
/** No provider is connected; provider integration is deferred (ADR-042). */
const PAYMENT =
  'The payment demo page is an academic simulation: nothing is collected, charged or emailed, and no payment provider is connected.';

const PRODUCTION_RECEIPT = 'Confirming that requests sent from the published website reach the BuildTrack contact';

export function disclosure(formRendered: boolean): Disclosure {
  return {
    working: [
      'This website, its pages and navigation, published at a public web address',
      formRendered
        ? 'An editable request form that starts with your chosen request, service or plan'
        : 'Request, service and plan choices carried in links to the Contact page',
      'The Interactive Platform Demo, using fictional data',
      'A concrete quantity and batch-mixer estimate in the demo: a working calculation for teaching, not yet reviewed by a civil engineer',
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
    estimator: ESTIMATOR,
    payment: PAYMENT,
  };
}
