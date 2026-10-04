# BuildTrack Decision Log

Updated: 2026-10-04 (Phase 1/2 specification entries ADR-014–020 added). Accepted decisions supersede the original unresolved discovery directions. Business decisions derive from the friend's answers; technical direction formalizes the agreed assessment. No entries assert implemented work.

## ADR-001 — Product boundary
Status: Accepted. Date: 2026-10-04.
Decision: public business website + real inquiry flow + included interactive simulated product demo. No production SaaS.
Rationale: fulfills the assignment with useful technical substance while avoiding enterprise scope. Supersedes “potential dashboard.”

## ADR-002 — Presenter constraint
Status: Accepted. Date: 2026-10-04.
Decision: architecture must be maintainable by the CS developer and explainable at a practical level by the Civil Engineering presenter.
Rationale: the friend is the student being evaluated. Write presentation guidance after actual implementation.

## ADR-003 — Branding
Status: Accepted direction; final tokens/logo deferred. Date: 2026-10-04.
Decision: keep name/tagline; dark-to-light blue with controlled yellow accents and professional construction-tech visuals.
Rationale: friend's updated preference overrides green BMC palette; avoid gaming/cyberpunk styling.

## ADR-004 — Coverage
Status: Accepted business decision. Date: 2026-10-04.
Decision: Philippines-based coverage. Southeast Asian expansion may be future vision only.
Rationale: explicit owner answer. No current global/overseas operation claims.

## ADR-005 — Customer segments
Status: Accepted business decision. Date: 2026-10-04.
Decision: give equal standing to all original BMC segments: construction companies of all sizes; contractors/subcontractors; project managers/site engineers; civil engineering firms; government infrastructure projects; real estate developers; equipment rental companies.
Rationale: owner chose BMC alignment over earlier narrower positioning. Suppliers/technology providers are partners, not silently added customer segments.

## ADR-006 — Proposed pricing
Status: Accepted; figures set by ADR-025 (2026-10-04). Date: 2026-10-04.
Decision: Starter/Professional/Enterprise package structure with proposed peso pricing, including a numeric Enterprise price when finalized. Confirm amounts, billing period, limits and exclusions before release. Separate deployment-dependent hardware/implementation/integration quotes unless included explicitly.
Rationale: pricing is an assignment requirement; friend wants Enterprise peso pricing. Figures are academic business proposals, not researched market facts or existing charges.

## ADR-007 — Availing and genuine delivery
Status: Accepted business decision. Date: 2026-10-04.
Decision: one form supports Request a Demo, Request a Quotation and Avail a Service. Selected service/plan/type carries into editable fields. Requests must genuinely reach the contact, including the professor's test.
Alternatives: checkout/payment; simulated success; mailto-only. Rejected because the owner explicitly selected requests and needs actual receipt.
Consequence: inquiry delivery is a core release gate. A request is not a monetary purchase, confirmed appointment or activated plan.

## ADR-008 — Frontend
Status: Accepted architecture direction. Date: 2026-10-04.
Decision: Astro (static output) + native Astro components + TypeScript + plain CSS with centralized tokens; small focused browser scripts. No UI framework (React/Vue/Svelte etc.), CSS framework, component kit or CSS-in-JS. Amended 2026-10-04 by ADR-014.
Alternatives: plain HTML/CSS/JS, React SPA, Next.js.
Rationale: reusable content pages plus limited interaction; keep complexity/client JavaScript proportional. Versions and commands chosen during foundation.

## ADR-009 — Backend boundary
Status: Accepted architecture direction. Date: 2026-10-04.
Decision: lightweight external form provider handles inquiries; no bespoke backend/API/database/auth/admin/payments.
Rationale: the only required server-side behavior is reliable request handling. Provider selection/configuration remains open. External provider storage must be disclosed; do not claim all data stays local.

## ADR-010 — Demo
Status: Accepted. Date: 2026-10-04.
Decision: local fictional data, four illustrative projects, section/project/filter controls and coherent dashboard content. Optional bounded simulated events; no CRUD/persistence/live telemetry.
Rationale: demonstrates the business concept without pretending hardware is connected. Visible simulation disclosures required.

## ADR-011 — Sitemap
Status: Accepted. Date: 2026-10-04.
Decision: Home, Solutions, How It Works, Product Demo, Pricing, About, Contact. Coverage is included in relevant pages.
Rationale: complete visitor journey without excessive page fragmentation.

## ADR-012 — Contact identity
Status: Accepted; location and phone set 2026-10-04 (Lingayen, Pangasinan; 09510519642 / `tel:+639510519642`). Date: 2026-10-04.
Decision: friend supplies/inputs approved location and phone in centralized public configuration. The location is shown as "Based in …" (city/province only, no street address or office). The display number and its international `tel:` link are separate config values so neither is derived or reformatted. Obtain a verified recipient email separately for notifications.
Rationale: do not invent identities; phone/location alone do not configure delivery.

## ADR-013 — Deployment and review
Status: Accepted requirements; provider provisional. Date: 2026-10-04.
Decision: Git/GitHub to a modern static/edge host and public HTTPS. Custom domain preferred subject to budget; Cloudflare provisional, Vercel alternative. Verify current official docs/terms at deployment.
Rationale: public accessibility is mandatory, a paid domain is not. Implementation, human testing and independent review at meaningful milestones are separate roles.

## ADR-014 — Strict runtime stack
Status: Accepted. Date: 2026-10-04. Supersedes the "UI framework only if justified" allowance in ADR-008 and the earlier architecture text.
Decision: `astro` is the only runtime dependency. Dashboard and form use ordinary browser state, DOM APIs, accessible HTML/CSS and simple inline SVG. No state-management, animation or chart libraries; no SSR, hosting adapter or homegrown framework.
Rationale: current scope (six dashboard views over ~100 fixture records, one form) does not need them; fewer dependencies are easier for the presenter and maintainer to understand.
Consequence: a new runtime dependency needs a written requirement, alternatives and tradeoff recorded here before installation.

## ADR-015 — Form provider preference
Status: Accepted; endpoint configured; local delivery verified 2026-10-04; production delivery pending. Date: 2026-10-04.
Decision: Formspree preferred; Web3Forms fallback. Fetch with `Accept: application/json`, native POST fallback without JavaScript.
Rationale: published free tier (50 submissions/month, AJAX on all plans, spam filtering, 30-day archive) covers academic volume; verifiable docs and recipient verification. Web3Forms offers a larger quota but its official pages could not be verified from this environment.
Consequence: the human created the Formspree form and supplied the public endpoint (set in `src/config/inquiry.ts` on 2026-10-04); the recipient address stays in the Formspree account. A labelled local test request was received by the designated contact on 2026-10-04; production delivery is verified in Phase 9.

## ADR-016 — Hosting preference
Status: Accepted; configuration prepared 2026-10-04, not deployed. Date: 2026-10-04. Refines ADR-013.
Decision: Cloudflare Workers static assets serving `dist/` with no Astro adapter. Alternatives: Cloudflare Pages, Vercel, Netlify, GitHub Pages.
Rationale: Cloudflare recommends Workers for new projects; static asset requests are not billed on the free plan; adds no runtime code.
Consequence: Phase 9 added `wrangler.jsonc` (assets-only, `404-page`, `auto-trailing-slash`) and `public/_headers` (immutable caching for hashed `/_astro/*` only, basic security headers) after checking current docs; the 404 page is `noindex` without a canonical URL. Workers Builds settings: `SKIP_DEPENDENCY_INSTALL=1`, build `npm ci && npm run build`, deploy `npx wrangler@4.147.0 deploy` (pinned through npx rather than added as a dependency, to keep `astro` the only runtime dependency and avoid a large dev dependency for a single command). Details in ARCHITECTURE §7.

## ADR-017 — Tooling and tests
Status: Accepted. Date: 2026-10-04.
Decision: dev tooling limited to TypeScript + `@astrojs/check`, Vitest and the `@astrojs/sitemap` build integration. Unit tests cover pure logic (URL allowlists, validation, submit-state classification, demo metrics, fixture integrity, release readiness). No ESLint, Prettier, Playwright or CI initially; manual browser/mobile/accessibility checks are recorded. Node: current even-numbered LTS pinned in `.nvmrc`.
Rationale: tests target behaviour with real defect risk; heavier infrastructure is added only when a recurring problem justifies it.

## ADR-018 — Unresolved values are null, not placeholders
Status: Accepted. Date: 2026-10-04.
Decision: unknown prices, billing periods, limits, exclusions, contact details, production URL and form endpoint are `null` in `src/config/`. Pages show "Pending approval". Release requirements are listed explicitly in `ARCHITECTURE.md` §5; optional public email never blocks release. `npm run check:release` is a separate gate that fails while required values remain; `npm test` passes with incomplete config. Recipient verification and production receipt are manual gates; recipient details and test evidence are not committed. With no endpoint, Contact renders a notice and no form or submit control (also without JavaScript).
Rationale: prevents invented or placeholder business values from shipping.

## ADR-019 — Demo snapshot model
Status: Accepted. Date: 2026-10-04.
Decision: fixtures describe a fixed fictional snapshot (`DEMO_AS_OF` 2026-09-28 08:00 PHT) for four "Sample" Philippine projects. All derived figures come from pure functions over the same filtered data. "Simulate scan" appends up to five pre-written labelled events without changing figures; reset/reload restores fixtures. No storage, timers or network.
Rationale: keeps every card, table and chart consistent and explainable; avoids implying live data.
Update 2026-10-04: schedule variance is shown only for a single selected project; with "All sample projects" the tile is omitted rather than aggregated.

## ADR-020 — Proposed visual system
Status: Proposed, pending human review. Date: 2026-10-04.
Decision: tokens, type scale, layouts and component specs in `UX_BRAND.md`. Inter self-hosted (OFL) with system fallback. Technology blue and yellow are never text on light backgrounds (calculated contrast 2.74 and 1.43). Design choice (not a WCAG requirement): primary buttons are blue on light backgrounds and yellow on dark sections. Plans have equal visual weight unless the owner chooses a recommended plan.
Rationale: preserves the blue/yellow brand while meeting WCAG AA contrast by calculation; browser verification pending.
Update 2026-10-04: color direction and self-hosted Inter approved for foundation work. Rendered layouts not yet accepted; logo artwork provisional (text wordmark).

## ADR-021 — Foundation implementation choices
Status: Accepted. Date: 2026-10-04.
Decision: pinned astro 7.3.5, typescript 6.0.3, @astrojs/check 0.9.10, vitest 5.0.3, @astrojs/sitemap 3.7.4 on Node 24 LTS. `npm run check:release` runs `scripts/check-release.ts` with Node's built-in type stripping (no runner dependency); config modules use explicit `.ts` import specifiers so that works. Sitemap integration, canonical links and the robots Sitemap line are enabled only once `site.productionUrl` is set. Desktop header from 75rem per the measured fit check. Inter shipped as a Latin+₱ subset of the official variable font under OFL.
Alternatives: TypeScript 7 (rejected: outside `@astrojs/check` peer range); tsx/vite-node for the release script (rejected: unnecessary dependency); 64rem header breakpoint (rejected: measured 1,054 px need).
Rationale: compatible set rather than newest-of-each; no new runtime dependencies.

## ADR-022 — Core website content and assets
Status: Accepted; copy pending owner approval. Date: 2026-10-04.
Decision: Phase 4 pages use original SVG illustrations and icons instead of stock photography; the social card is original artwork. All Contact CTAs are built by `contactHref()` from typed allowlisted ids. Plan cards show "Price/Inclusions/Limits pending approval" from `null` config; the capability comparison table appears only when every plan's inclusions are approved. `og:image` and canonical tags wait for the production URL. Draft page copy (headlines, mission, vision, plan positioning, segment and service descriptions) is a manual release gate for owner approval.
Alternatives: licensed stock photos (deferred: adds licence tracking and file weight; can be added later); relative `og:image` (rejected: Open Graph needs absolute URLs; no URL invented).
Rationale: honest, licence-clean, lightweight content that is complete except for owner-supplied values.

## ADR-023 — Demo rendering approach
Status: Accepted. Date: 2026-10-04.
Decision: render all demo markup at build time from fixtures and pure functions; the browser script only toggles visibility from in-memory state using shared, unit-tested predicates. No-JS shows every section. A global `[hidden]` rule enforces hiding.
Alternatives: client-side DOM construction from data (rejected: second rendering path, more code, risk of figures diverging); a UI framework (excluded by ADR-014).
Rationale: about 100 fictional records make pre-rendering cheap (≈87 KB HTML, ≈20 KB script); one source of truth for every figure; safe rendering without `innerHTML`.
Consequence: adding a new scope or filter means adding markup variants or predicates, not templates.

## ADR-024 — Inquiry form implementation
Status: Accepted; endpoint configured; local delivery verified 2026-10-04; production delivery pending. Date: 2026-10-04. Implements ADR-015.
Decision: hand-written `fetch` submission against the documented Formspree HTTP contract (FormData + `Accept: application/json`; 2xx JSON success, `errors[]`/`error` failures, 429 rate limit) with a native POST fallback; field names `email` (Reply-To), hidden `subject` and honeypot `_gotcha` per current Formspree docs (the spec's `_subject` is superseded). Success is shown only for Formspree's recognised shape (2xx, no `error`/`errors`, string `next`, matching `@formspree/core`); `next` is never followed. Unrecognised 2xx bodies and timeouts (before headers or while reading the body) are reported as uncertain, not as success or definite failure. Field rules live in pure `src/lib/inquiry-*.ts`; the form renders only when `formProvider.endpoint` is set. Browser behaviour is tested by `npm run test:browser`, which builds temporary copies with fixture config modules swapped in by a Vite resolve hook (configured with a non-routable synthetic endpoint, and unconfigured), intercepts every page request and blocks any unexpected destination; it is independent of the real config value and nothing test-related ships in `dist/`. The browser is chosen only by `CHROME_PATH` (standalone Chrome for Testing setup in ARCHITECTURE §8). Privacy acknowledgment wording is a visibly marked draft that names Formspree but makes no retention or handling promise.
Alternatives: the official `@formspree/ajax` library (rejected: a runtime dependency under ADR-014, and its default UI copy and success handling would not match UX_BRAND §5); Playwright as a dev dependency (deferred: a dependency-free DevTools-protocol script is enough for one page; revisit if browser tests grow); an environment-variable endpoint override for tests (rejected: a second configuration path in production code); text replacement of the `endpoint: null` declaration (replaced after review: it would break once a real endpoint is set); accepting any error-free 2xx object (rejected after review: `{}` would show success).
Rationale: keeps the stack at one runtime dependency, keeps acceptance honest, and keeps all test doubles outside production code.
Consequence: Formspree contract changes surface as visible failures, not false success; preselection requires JavaScript; the browser test needs a local Chromium.

## ADR-025 — Proposed academic package pricing
Status: Accepted for the project proposal. Date: 2026-10-04. Refines ADR-006.
Decision (BuildTrack's own choice, approved by the project owners; not market data): monthly prices per organization in PHP: Starter ₱2,990, Professional ₱7,990, Enterprise ₱19,990. Limits per organization across its active projects: Starter 2 active projects / 5 named users / 500 material records / 50 individually tracked equipment units; Professional 8 / 15 / 2,000 / 200; Enterprise 20 / 40 / 5,000 / 500. A material record is one material type/SKU regardless of quantity; an equipment record is one individually tracked asset. Inclusions are cumulative and modelled once: four all-plan capabilities (`allPlanInclusions`), then each plan's additions, with `buildsOn` naming the plan it extends (Professional builds on Starter, Enterprise on Professional). Onboarding (one/two/three 60-minute remote sessions in total) and support (standard email / priority email / priority email plus scheduled calls) are per-plan values that replace rather than add to the previous tier. Separately quoted: RFID/IoT hardware, gateways and connectivity; physical QR-label printing and user/scanning devices; on-site installation, travel and additional training; data cleanup/migration and custom integrations; bespoke analytics, additional capacity and dedicated support arrangements. No automatic overage charges, annual discounts, payments, accounts or subscription activation exist; choosing a plan creates an inquiry only. No plan is highlighted (if one ever is, Professional may be labelled "For growing teams", never "Most popular"). Required disclosure wherever prices appear: "Proposed academic pricing for the envisioned BuildTrack platform. This website demonstrates the concept and accepts inquiries; it does not activate a production subscription."
Benchmarks (verified from each vendor's official pricing page on 2026-10-04; USD, vendor terms, subject to change):
- Sortly (https://www.sortly.com/pricing/): Free $0 (100 unique items, 1 user licence, 2 active jobs); Advanced $49/month list or $24/month billed yearly ($288/yr), 500 unique items, 2 licences, 5 active jobs; Ultra $149 or $74 billed yearly ($888/yr), 2,000 items, 5 licences, 10 jobs; Premium $299 or $149 billed yearly ($1,788/yr), 5,000 items, 8 licences, 15 jobs; Enterprise by quote, 10,000+ items, 12+ licences, unlimited jobs. Sortly states quantities of a unique item do not count towards the item limit, and that its 50% yearly discount applies to the first year only (20% thereafter).
- Fieldwire (https://www.fieldwire.com/pricing/): Basic $0 per user/month (5 users, 3 projects, 100 sheets); Pro $39, Business $64, Business Plus $89 per user/month billed annually, unlimited projects; custom contracts by contact. Its Pro tier is described as "For growing teams looking to scale with Fieldwire."
- EZOfficeInventory (https://ezo.io/ezofficeinventory/pricing/): Essential $81.41/month, Advanced $117.11/month, Premium $142.10/month as rendered "based on 500 items" (the page's price slider and monthly/yearly toggle change these; its FAQ also describes starting prices for 100 items), unlimited users subject to fair use; Custom Enterprise by quote. Pricing scales with the number of tracked items.
Rationale: the benchmarks show that inventory and asset tools commonly tier by tracked items/records and users, that construction field tools tier by users and projects, and that list prices for comparable small-team tiers sit in the tens to low hundreds of US dollars per month. BuildTrack's tiers therefore combine records, equipment units, users and active projects, and the material-record definition mirrors Sortly's "unique item, independent of quantity" approach. The PHP figures, limits and feature split are BuildTrack's proposal for an academic business plan. They are **not** a currency conversion of any competitor price, not evidence of Philippine willingness to pay, and not proof of demand, costs or profitability; no customer research or financial model validates them.
Alternatives: per-user pricing like Fieldwire (rejected: site crews share devices, and a per-organization price is easier to present); quote-only Enterprise (rejected: ADR-006 requires a numeric Enterprise price).
Consequence: `src/config/pricing.ts` holds every value; Pricing cards, the comparison table, the Home preview and the inquiry plan labels read from it. `npm run check:release` checks prices, billing period, inclusions, onboarding, support, positive whole-number limits and exclusions.

## ADR-026 — Configuration is not verification
Status: Accepted (Phase 8 review finding). Date: 2026-10-04.
Decision: public disclosure copy never infers delivery or publication from configuration. `src/lib/disclosures.ts` takes only whether the form is rendered (an endpoint exists) and always lists publication and receipt of requests from the published site as still to come; About and How It Works read from it and do not read `site.productionUrl`. Evidence (local receipt human-confirmed 2026-10-04; production pending) is recorded in `PROJECT_STATE.md`. After Phase 9 verification a person edits the copy.
Alternatives: config-driven status flags such as `deliveryVerified`/`published` (rejected: a verification subsystem that can still be set without evidence); deriving status from the endpoint or URL (rejected: the review finding).
Consequence: unit tests and the browser harness (with an endpoint and a synthetic production URL configured) assert that no publication or delivery claim appears; Phase 9 must update the "still to come" items once production is verified.

## Deferred release/design decisions
Formspree spam settings and privacy wording approval; review of proposed logo/font/tokens/layouts (ADR-020) and draft headlines; hosting/domain/budget; final image assets/licenses. These do not reopen the settled product scope. They must not be presented as completed or silently fabricated.
