# Proposals: engineering demonstration and payment demonstration

Implementation note (2026-10-12, later the same day): at the owner's direction, §A's estimator is now built locally in the Product Demo (exact decimal arithmetic) and a simulated version of §B's flow, with a disabled sandbox connection point, is a website page, `/payment-demo/` (ADR-041, UX_BRAND §16). This does not change anything below: CE review of the model and verification of provider eligibility remain open, no account exists, no link is configured, and nothing accepts money.

Status: **academic implementation and review-version publication authorized by the owner on 2026-10-13; engineering validation and provider integration remain proposals.** The estimator and disconnected payment simulation are implemented locally for this publication. No account was created, no key used, no transaction made. The professor's original requests remain working assumptions, not confirmed specifications. Live payments and subscription billing remain excluded. Owner approval to publish the teaching calculation does not constitute Civil Engineering validation or provider eligibility.

---

## A. Engineering demonstration: concrete quantity and mixer-output estimator

**Working assumption (to confirm with the professor):** the remembered "equipment/material simulation" request is best met by a small deterministic estimator. It is a formula, not AI, and must not be called AI. If genuine AI is required, that is a separate problem with its own definition and validation plan.

### A.1 Scope
In: one rectangular concrete element (slab, footing or beam treated as a box); concrete volume; an optional waste allowance; the number of batches from **one batch (drum) mixer**; idealized production time for that mixer. Truck mixers and continuous (volumetric) mixers are not modelled (A.9).
Out (stated on screen): structural design, reinforcement, mix design and material quantities per batch (cement bags, sand, gravel, water), curing or strength over time, corrosion or service-life countdowns, safety or code compliance, choosing or recommending a machine, crew, transport, placing and finishing time, setting-time limits, weather, breakdowns, several mixers in parallel.

**Cement bags are deliberately not estimated.** Bags per cubic metre depend on a specific mix design and its yield (cement content, proportions, absolute volumes), not on concrete volume alone. Any such conversion would need its own sourced mix and yield assumptions and CE review.

### A.2 Inputs (metric; bounds enforced, values outside them rejected with a message)
| Input | Symbol | Unit | Bounds | Default (fictional, editable) |
|---|---|---|---|---|
| Length | L | m | 0.10 – 100 | 6.00 |
| Width | W | m | 0.10 – 100 | 4.00 |
| Depth / thickness | D | m | 0.05 – 3.00 | 0.10 |
| Waste allowance (assumption) | w | % | 0 – 20 | 5 |
| Batch mixer output per batch: mixed concrete, from the mixer's rating | B | m³ | 0.05 – 3.00 | 0.20 |
| Cycle time per batch (assumed constant): charge + mix + discharge | t | min | 1 – 60 | 6 |

The waste default is a **user assumption, not a sourced value**; the screen says so.

### A.3 Batch mixer: drum capacity is not batch output
- A batch mixer's **drum volume** is the empty drum's volume. Its **rated batch output** is the volume of mixed concrete it is rated to produce per batch, which is smaller. The estimator asks only for the rated output (B) and labels it that way; it never derives B from drum volume.
- Sourced basis for batch mixers: nominal sizes are defined as the volume of compacted mixed concrete per batch, not the dry loaded volume (Indian Standard IS 1791:1968, sizes such as 100, 140, 200 and 250 L for tilting mixers). A retailer's 10 ft³ drum mixer lists 7 ft³ mixed capacity (illustration only, not a standard).
- The worked example's 0.20 m³ is a fictional value in the range of small site mixers, not a recommendation. Truck and continuous mixers follow different ratings and are kept separate (A.9).

### A.4 Equations
1. Net volume: V = L × W × D (m³)
2. Volume to produce: V′ = V × (1 + w / 100)
3. Batches: N = ⌈V′ / B⌉ (exact integer-and-decimal-scale arithmetic; no floating-point tolerance, so any genuine remainder adds a batch)
4. Final batch volume: V_last = V′ − (N − 1) × B (0 < V_last ≤ B)
5. Idealized production time: T = N × t (min); shown as hours and minutes

**Assumption: every batch, including a final partial batch, takes the same cycle time t.** This is a simplifying assumption pending CE review. It is not an established physical rule, and it is not shown to be conservative: a partial batch may charge and discharge faster, while minimum mixing times, loading order or the mixer's own requirements may not shorten with a smaller batch. The screen states the assumption beside the result.
"Idealized" means one mixer, back-to-back cycles, no waiting for placing, no breaks, no breakdowns.

### A.5 Rounding and display
The form and calculation function share bounds and a six-decimal-place input contract, measured after removing insignificant trailing zeros. More precise inputs are rejected, never silently rounded. Derived quantities retain all their decimal places, even beyond six. Display volume cards to 0.001 m³, N as an integer and T in whole minutes / h min; mark rounded cards with “≈” and positive values too small to display with “< 0.001”. The breakdown shows exact operands and results, including V_last. Never round an intermediate value before batch counting. Changed or invalid inputs retain the last calculation with an explicit visible status until a valid Calculate, example restore, Reset or reload.

### A.6 Outputs
Net volume, volume including waste (with the waste labelled as an assumption), batch count, last-batch volume with the constant-cycle assumption stated, idealized time, and a fixed note listing what is excluded (A.1).

### A.7 Worked example (fictional inputs)
A 6.00 m × 4.00 m × 0.10 m slab, 5% waste, 0.20 m³ per batch, 6 min per cycle:
- V = 6.00 × 4.00 × 0.10 = 2.400 m³
- V′ = 2.400 × 1.05 = 2.520 m³
- N = ⌈2.520 / 0.20⌉ = ⌈12.6⌉ = 13 batches
- V_last = 2.520 − 12 × 0.20 = 0.120 m³ (assumed to take the same 6 min cycle)
- T = 13 × 6 = 78 min = 1 h 18 min (idealized)

### A.8 Cycle time: an input, not a sourced value
Cycle time is an editable input because it depends on the mixer, crew and materials; the 6 min default is fictional. A "1 minute for up to 1 yd³ plus 15 s per additional yd³" minimum mixing time for stationary mixers appears in educational material (JoVE), but I could not verify it in ACI 304R itself, so it must not be presented as a code value. The batch mixer's manufacturer instructions and the project specification govern.

### A.9 Not modelled: truck and continuous mixers (context only)
These references explain why the estimator is limited to a batch mixer; none is used by the model.
- **Truck mixers:** US state specifications cap rated mixing capacity at about 63% of gross drum volume (63.25% in one; two-thirds in another), with the manufacturer's rating governing if lower; up to about 80% applies only when agitating already-mixed concrete. ACI's FAQ (citing ACI 304R) says truck mixers should mix adequately in 70-100 revolutions with a proper loading sequence, and that excessively long mixing after adequate blending may be harmful.
- **Continuous (volumetric) mixers:** ASTM C685/C685M covers concrete batched by volume and mixed continuously; output is a rate, not batches, and rated-capacity checks follow its annex (full text not reviewed).

### A.10 Placement in the Product Demo
A new seventh demo section, **"Concrete estimate"** (after Activity and Devices), labelled "Illustrative calculation: simplified, not engineering advice. Civil Engineering review pending." It keeps the demo's existing behaviour:
- local calculation in the browser; no backend, database or storage;
- it reads and changes none of the tracked inventory, equipment, deliveries or events, and adds no activity;
- the five-scan limit, Reset and reload behave exactly as now; Reset also clears the estimator to its defaults; nothing persists across reload;
- form fields with labels, units, bounds, an error summary as on Contact, and results in a polite live region.
Implemented as pure `src/lib/concrete-estimate.ts` (unit-tested) and one demo panel; no new dependency.

### A.11 Validation plan
1. Unit tests (Vitest) for the equations: the worked example; an exact multiple (V′ = 2.000, B = 0.20 → 10, not 11); the smallest and largest bounds; 0% and 20% waste; rejection of every out-of-range or non-numeric input; rounding of display only.
2. Hand calculations for three to five cases prepared and checked by the Civil Engineering presenter, compared with the estimator's output and with an independent spreadsheet.
3. CE review of the wording, the batch-mixer scope, the constant-cycle assumption (including the final partial batch), exclusions and units; the model is labelled "approved" only after that review is recorded in DECISIONS.md with the reviewer's role and date.
4. Browser checks: keyboard use, error summary, live results, Reset/reload, and that fixtures and the scan limit are unchanged.

---

## B. Payment demonstration (sandbox only)

The professor asked for credit card or bank transfer. **This is not authorization to accept money.** The demonstration must charge nothing and must not imply that BuildTrack sells live subscriptions.

### B.1 Provider research (2026-10-12; search evidence, not independently verified official text)
Direct retrieval of the cited PayMongo documentation was unavailable during research. The details below are provisional search-derived claims, not verified implementation requirements. They are unused by the disconnected simulation. Any provider integration must recheck directly accessible official documentation and account eligibility first.

**PayMongo (candidate only; no provider selected or connected):**
- Test keys are issued at signup and work before account activation; live keys need verification and approval. Test mode mirrors the live API; no real money moves.
- Documented test cards (any future expiry, any 3-digit CVC), including success, 3-D Secure and decline cases.
- Payment Links can run in test mode: a test link's URL contains `/test/` (`pm.link/{handle}/test/{reference}`). Hosted Checkout also works with the secret test key. E-wallet tests use a PayMongo test page (Authorize / Fail). **Not yet verified:** PayMongo's Payment Links page says the merchant account needs an active closed-loop wallet, activated automatically after KYC; whether a test-mode link can be created before KYC or activation, and the exact creation steps, must be confirmed in the owner's own account before any link is planned.
- **Warning:** QR Ph test codes must not be scanned and paid; that would make a real transaction. QR Ph must not be shown in a demo.
- **Bank channel (unverified):** PayMongo documents direct online banking (BPI, UnionBank) test OTP cases for the API (Links API or Payment Intents) in test mode, and two of its pages disagree on some failure codes. Whether this hosted banking flow is available for the planned link, and how it behaves, stays **unverified** until confirmed in the account.
- Payment status: the `link.payment.paid` and `payment.paid` webhook events; webhooks carry a `Paymongo-Signature` header with separate test (`te`) and live (`li`) signatures over the raw body. **Retries:** if an endpoint returns a non-2xx response or does not answer within 30 seconds, PayMongo retries automatically up to 12 times with exponential backoff; after that the delivery is marked failed and is not retried automatically, but it can be resent manually from the Dashboard (Event Deliveries, enabled endpoints only) or through the API. Events missed while an endpoint is disabled are not replayed; resends can duplicate events, so handlers must deduplicate by event ID. The dashboard also shows payment status.
- Payment Pages: test mode reported as still under development.
- Live activation (separate from test access) for a sole proprietorship: DTI business-name registration, BIR Certificate of Registration (Form 2303) and a government ID of the owner; payouts to an account in the registered business name; review up to about 14 business days.

**Others, for comparison:** Xendit (Philippines) offers a sandbox on registration with test cards, invoices and e-wallets. Maya's sandbox needs Maya Business Manager onboarding (private keys) or shared public sandbox credentials; some wallets and QR Ph cannot be fully tested in sandbox. Dragonpay's test credentials are issued by its team; I found no official public sandbox documentation. None is needed if PayMongo is chosen.

### B.2 What works with the current static website
| Approach | Static site? | What it shows | Limits |
|---|---|---|---|
| 1. A pre-created **test** Payment Link (made in the dashboard, or once through the API by the owner outside BuildTrack) opened from a clearly labelled demo button | Yes (only a URL; no key in the site) | PayMongo's hosted test checkout; test card or e-wallet test page | The site cannot know whether it was paid; status is shown in the owner's PayMongo test dashboard |
| 2. Links or Hosted Checkout sessions created **automatically by the website** for each quotation | No: the website would need the secret key on a server (e.g. a serverless function) | Per-quotation amount and description, created on request | Adds server code, a secret, logging and error handling. (Creating a link manually through the API from outside BuildTrack, e.g. the owner's own tool, needs no backend in this website.) |
| 3. Verified status shown on the website | No: needs a webhook endpoint with signature verification, plus storage | "Paid" on the site | Adds a backend and persistence; out of current scope |

**Recommendation:** approach 1 for the demonstration, **conditional on first verifying in the owner's account** that a test-mode Payment Link can be created at the account's current stage and how. It needs no code beyond a labelled link, keeps card entry entirely on PayMongo's page, exposes no key, and uses only provider-documented test data in the provider's sandbox.

### B.3 Proposed business flow and who does what
| Step | How | Manual / simulated / provider |
|---|---|---|
| Inquiry | Existing Contact form (Formspree) | Real (unchanged) |
| Reviewed quotation | Owner prepares a quotation from the inquiry and sends it by email | Manual |
| Customer acceptance | Customer replies by email | Manual |
| Payment link | Owner sends a PayMongo Payment Link (test mode for the demo) | Provider-backed (sandbox) |
| Verified payment status | Owner checks the PayMongo dashboard (test mode) | Provider-backed; manual check |

A return URL, a button click, a screenshot or a customer's statement is **never** proof of payment; only the provider's recorded status is. Automating quotation approval, invoices, payment verification or payment history would need a server, secrets management and persistence (a database); that is a separate, larger decision and is not proposed here.

### B.4 Credit card vs bank transfer
- **Credit card:** genuine sandbox via a test Payment Link (approach 1). BuildTrack never collects card numbers or CVV; card entry happens only on the provider's page.
- **Bank transfer:** PayMongo documents direct online banking (BPI/UnionBank) sandbox cases, but whether that hosted banking flow is offered on the planned test link (or only through API-created payments) is **unverified** until confirmed in the account. A plain InstaPay/PESONet transfer to the owner's account has no sandbox: it can only be shown as a clearly labelled simulated process ("Example only. Do not transfer money."), with no real or invented bank details, and no personal account connected.

### B.5 Setup this would need (by the owner, after a decision; not by an agent)
First, in the owner's own PayMongo account (owner's sign-up, test mode only): confirm the exact eligibility (whether KYC or wallet activation is needed for test-mode Payment Links) and the creation workflow. Only if that works: one test Payment Link with a fictional description and a demonstration amount, created in the dashboard or once through the API outside BuildTrack; the link URL added to the site behind a "Payment demo: no real charge" label. No live keys, no business documents and no activation for the demonstration unless the eligibility check shows otherwise, which would itself need a decision. Live activation would be a separate business decision requiring the DTI/BIR documents above.

### B.6 Copy implications
Statements that a request is "not a payment, booking or subscription" remain true. ADR-041 records authorization for the local simulation and its publication, with persistent simulated/no-charge wording. The published simulation is not a provider sandbox. Any future provider connection needs separate eligibility and destination verification; the current connection is null/false. Neither Formspree delivery gate is completed by this publication.

---

## Sources
Engineering, batch mixer (used by the model):
- [Bureau of Indian Standards, IS 1791:1968 (batch-type concrete mixers), via Infralens](https://infralens.in/code/IS-1791-1968)
- [JoVE: mixing time (educational; not a code source)](https://coach.jove.com/civil-engineering/concrete-mixing-placement-and-curing-techniques-guide/what-is-mixing-time)

Engineering, truck and continuous mixers (context only, A.9; not used by the model):
- [Connecticut DOT specification (mixer capacity, % of drum volume)](https://portal.ct.gov/-/media/dot/documents/dform815/601mpdf.pdf)
- [Colorado DOT inspection form (rated mixing capacity ≤ 63% of gross drum volume)](https://www.codot.gov/about/forms/cdot0046.pdf/@@download/file/cdot0046.pdf)
- [Kansas DOT specification (mixer and agitator ratings)](https://ksdot.gov/home/showpublisheddocument/7550/638731523687970000)
- [Pavement Interactive: PCC truck mixer](https://pavementinteractive.org/reference-desk/construction/transportation/pcc-truck-mixer/)
- [American Concrete Institute FAQ (truck-mixer revolutions, citing ACI 304R)](https://concrete.org/frequentlyaskedquestions.aspx?faqid=770)
- [ASTM C685/C685M (volumetric batching and continuous mixing) catalogue entry](https://store.astm.org/c0685_c0685m-10.html)

Payment:
- [PayMongo: Testing](https://docs.paymongo.com/docs/payment-acceptance-testing)
- [PayMongo: Payment channels testing](https://docs.paymongo.com/docs/payment-channels-testing)
- [PayMongo: Payment Links](https://docs.paymongo.com/docs/payment-channels-payment-links)
- [PayMongo: Links API](https://developers.paymongo.com/docs/links-api)
- [PayMongo: Direct Online Banking test cases](https://developers.paymongo.com/docs/dob-test-cases)
- [PayMongo: Webhook setup and management](https://docs.paymongo.com/docs/developer-tools-webhook-setup-management)
- [PayMongo: Webhook testing](https://docs.paymongo.com/docs/webhook-testing)
- [PayMongo: Retry logic](https://docs.paymongo.com/docs/developer-tools-retry-logic)
- [PayMongo: Retry a webhook delivery](https://docs.paymongo.com/docs/retry-a-webhook-delivery)
- [PayMongo: Webhooks resource](https://developers.paymongo.com/docs/webhooks)
- [PayMongo: API keys](https://docs.paymongo.com/docs/account-settings-api-keys)
- [PayMongo: Philippine entities (activation documents)](https://docs.paymongo.com/docs/account-settings-philippine-entities)
- [PayMongo: Activate account](https://developers.paymongo.com/docs/account-activation)
- [Xendit: sandbox/simulation](https://help.xendit.co/hc/en-us/articles/360026743071-Do-you-provide-sandbox-or-account-for-simulation)
- [Maya: sandbox credentials and cards](https://developers.maya.ph/reference/sandbox-credentials-and-cards)
- [Maya: testing and validating Maya Checkout](https://developers.maya.ph/reference/testing-and-validating-your-maya-checkout-integration)
- [Dragonpay test payment (third-party guide; no official public sandbox docs found)](https://support.easystore.co/en/article/run-test-payment-with-dragonpay-uhdnss)

PayMongo's documentation pages refused direct retrieval during this research and its correction (connection reset); the PayMongo facts above come from search results quoting those pages and must be re-checked against the live documentation before any build.
