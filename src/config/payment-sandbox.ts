// Optional provider-hosted TEST payment link for the website's payment demo (/payment-demo/).
// Disabled by default: with no link the page says "Provider sandbox not connected."
//
// Set these only after the owner has verified, in their own provider account, that the account may
// create the link and that it is a provider-hosted test-mode link. Only providers and test-route
// formats listed in src/lib/payment-sandbox.ts are accepted (PayMongo test Payment Links:
// https://pm.link/{handle}/test/{reference}); anything else stays disconnected. Never a live link,
// never a secret or API key: only the public link URL belongs here. Configuring this does not
// confirm account eligibility or banking channels. A return from the provider, a button click or
// a screenshot is never proof of payment; status is checked in the provider's own test dashboard.
// Live payment acceptance is out of scope.

import type { SandboxProvider } from '../lib/payment-sandbox.ts';

export interface ProviderSandboxConfig {
  /** One of the supported providers. Null until verified. */
  provider: SandboxProvider | null;
  /** The provider-hosted test link. Null until verified. */
  testLinkUrl: string | null;
  /** True only once the owner has verified the link is in the provider's test mode. */
  verifiedTestMode: boolean;
}

export const providerSandbox: ProviderSandboxConfig = {
  provider: null,
  testLinkUrl: null,
  verifiedTestMode: false,
};
