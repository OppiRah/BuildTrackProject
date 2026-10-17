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
Status: Accepted; page copy approved by the human on 2026-10-04 for the initial publication of the academic prototype (may be revised later). Date: 2026-10-04.
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
Decision: hand-written `fetch` submission against the documented Formspree HTTP contract (FormData + `Accept: application/json`; 2xx JSON success, `errors[]`/`error` failures, 429 rate limit) with a native POST fallback; field names `email` (Reply-To), hidden `subject` and honeypot `_gotcha` per current Formspree docs (the spec's `_subject` is superseded). Success is shown only for Formspree's recognised shape (2xx, no `error`/`errors`, string `next`, matching `@formspree/core`); `next` is never followed. Unrecognised 2xx bodies and timeouts (before headers or while reading the body) are reported as uncertain, not as success or definite failure. Field rules live in pure `src/lib/inquiry-*.ts`; the form renders only when `formProvider.endpoint` is set. Browser behaviour is tested by `npm run test:browser`, which builds temporary copies with fixture config modules swapped in by a Vite resolve hook (configured with a non-routable synthetic endpoint, and unconfigured), intercepts every page request and blocks any unexpected destination; it is independent of the real config value and nothing test-related ships in `dist/`. The browser is chosen only by `CHROME_PATH` (standalone Chrome for Testing setup in ARCHITECTURE §8). Privacy acknowledgment wording names Formspree but makes no retention or handling promise; it was a visibly marked draft until approved by the human on 2026-10-04 for the initial publication of the academic prototype (may be revised later) (`privacyNotice.status = 'approved'`).
Alternatives: the official `@formspree/ajax` library (rejected: a runtime dependency under ADR-014, and its default UI copy and success handling would not match UX_BRAND §5); Playwright as a dev dependency (deferred: a dependency-free DevTools-protocol script is enough for one page; revisit if browser tests grow); an environment-variable endpoint override for tests (rejected: a second configuration path in production code); text replacement of the `endpoint: null` declaration (replaced after review: it would break once a real endpoint is set); accepting any error-free 2xx object (rejected after review: `{}` would show success).
Rationale: keeps the stack at one runtime dependency, keeps acceptance honest, and keeps all test doubles outside production code.
Consequence: Formspree contract changes surface as visible failures, not false success; preselection requires JavaScript; the browser test needs a local Chromium.

## ADR-025 — Proposed academic package pricing
Status: Accepted for the project proposal. Date: 2026-10-04. Refines ADR-006.
Decision (BuildTrack's own choice, approved by the project owners; plan descriptions approved by the human on 2026-10-04 for the initial publication of the academic prototype (may be revised later); not market data): monthly prices per organization in PHP: Starter ₱2,990, Professional ₱7,990, Enterprise ₱19,990. Limits per organization across its active projects: Starter 2 active projects / 5 named users / 500 material records / 50 individually tracked equipment units; Professional 8 / 15 / 2,000 / 200; Enterprise 20 / 40 / 5,000 / 500. A material record is one material type/SKU regardless of quantity; an equipment record is one individually tracked asset. Inclusions are cumulative and modelled once: four all-plan capabilities (`allPlanInclusions`), then each plan's additions, with `buildsOn` naming the plan it extends (Professional builds on Starter, Enterprise on Professional). Onboarding (one/two/three 60-minute remote sessions in total) and support (standard email / priority email / priority email plus scheduled calls) are per-plan values that replace rather than add to the previous tier. Separately quoted: RFID/IoT hardware, gateways and connectivity; physical QR-label printing and user/scanning devices; on-site installation, travel and additional training; data cleanup/migration and custom integrations; bespoke analytics, additional capacity and dedicated support arrangements. No automatic overage charges, annual discounts, payments, accounts or subscription activation exist; choosing a plan creates an inquiry only. No plan is highlighted (if one ever is, Professional may be labelled "For growing teams", never "Most popular"). Required disclosure wherever prices appear: "Proposed academic pricing for the envisioned BuildTrack platform. This website demonstrates the concept and accepts inquiries; it does not activate a production subscription."
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
Consequence: unit tests and the browser harness (with an endpoint and a synthetic production URL configured) assert that no delivery or testing claim appears. Update 2026-10-04: publication at https://buildtrack.sunnydelacruz.workers.dev was verified live and the copy now states it (a human-recorded fact, still not derived from configuration); production receipt stays "still to come" until the contact confirms a production test request.

## ADR-027 — Owner-supplied logo
Status: Accepted. Date: 2026-10-05.
Decision: the owner supplied `BuildTrackLogo.jpeg` (1254×1254 square lockup: B-pin emblem, "BUILDTRACK" lettering and a two-line tagline on an opaque near-white background), kept unmodified as `design/BuildTrackLogo.jpeg`. The header and footer show only its emblem (a rectangular crop at the original aspect, scaled by exactly 0.2 to `public/buildtrack-mark.webp`, 150×144, 6 KB) beside the existing live-text "BuildTrack" wordmark. On the navy footer the emblem sits in a white rounded tile because the JPEG has no transparency. The favicon and social card stay as they are.
Rationale: at header size (40–64 px) the full lockup's lettering is a few pixels tall and its tagline unreadable, while the emblem stays recognisable. At 16–32 px (favicon) both the lockup and the emblem become an indistinct blue shape, so the crisp SVG "B" is kept. A square lockup does not fit the 1200×630 card without new layout work and would drop the card's "Academic business proposal" line, so `og-image.png` is unchanged. No background removal or tracing was attempted.
Consequence: provenance is "supplied by the project owner, 2026-10-05". No licence or authorship terms were supplied, so none are claimed. A vector or transparent PNG of the emblem would allow a cleaner footer treatment and a logo favicon later.

## ADR-028 — Home redesign direction
Status: Direction approved by the human 2026-10-05; prototype implemented locally on branch `ui-redesign`, **unreviewed**, not merged or deployed.
Decision: Home moves to bold construction visuals (navy/blue, restrained yellow, strong type) with animation as a central feature: a muted background video hero with a visible pause/play control and still fallback, a laptop-and-phone showcase of the real demo, one-time section reveals, and a solid navy header on every page. Stock media come from the owner-supplied Pexels starter pack and are captioned as stock. Excluded: rotating/scattered video collages, scroll hijacking, pinned sections, perpetual motion, new dependencies.
Rationale: the owner wants a more striking presentation while keeping the lightweight architecture and every truthful disclosure.
Consequence: supersedes, for Home and the shared header, UX_BRAND §7 (no autoplaying video) and the §3.1 white header; autoplay is limited to ≥ 48rem without reduced motion or Save-Data, and the still is the default on phones. Details and evidence: UX_BRAND §11, PROJECT_STATE. Update 2026-10-05 (second pass, still unreviewed): the Product Demo adopts the same navy/yellow treatment as an open dashboard (no nested cards; behaviour, fixtures and calculations unchanged) and gains `#demo-panel-<section>` entry points that never write the URL; Home replaces the alternating capability rows with an image-led horizontal strip (previous/next controls, no autoplay; a plain wrapping grid without JavaScript so keyboard focus is never half hidden) and uses open, uncarded sections for the workflow, segments and pricing. Other inner pages are not redesigned yet.

## ADR-029 — Application-style demo and desktop scroll-driven capability showcase
Status: Approved by the owner/human 2026-10-06; implemented locally on branch `ui-redesign`, **awaiting visual and independent review**, not merged or deployed.
Decision: (1) The Product Demo becomes an application-style workspace: a brief intro with "Launch interactive demo", then a dark navy sidebar (Back to website, six sections, persistent "Simulated data. No live hardware" note), a light workspace with a compact toolbar (section title, project selector, Reset) and a persistent compact disclosure; below 64rem the sidebar is a modal drawer. The site header is not sticky on this page. No login, search, notifications or account controls. (2) On desktop, Home's capability section is pinned and its horizontal progression follows normal vertical document scrolling, replacing the manual strip with Previous/Next buttons (ADR-028 update) and, for this one section, the earlier "no pinned sections / no scroll-jacking" rule.
Rationale: the owner wants the demo to read as a product and the capability story to unfold as the visitor scrolls, without extra controls.
Constraints kept: native scrolling only (no wheel, touch or key capture); travel measured from real sizes and re-measured on resize, fonts and preference changes; the last panel fully visible before release; keyboard focus jumps instantly to a fully visible panel; stacked fallback below 64rem, under reduced motion, without JavaScript, on script failure, and whenever the pinned block does not fit (short windows, enlarged text). The demo sidebar sticks only while it fits; no nested vertical scroll areas; all fixtures, calculations, filters, empty states, the five-scan limit, reset/reload, hash entry points and announcements unchanged.
Update 2026-10-06 (independent-review finding): `scrolly.ts` also re-evaluates when the header, pinned content or track change size (ResizeObserver; callbacks with unchanged sizes are skipped), so live browser text-size changes update travel or switch to the stack, re-measuring an enabled layout in place instead of tearing it down; a focused panel link is kept visible only when the layout changed. Consequence: `src/scripts/scrolly.ts` and `src/scripts/demo-layout.ts` added; `strip.ts` removed; `BaseLayout` gains `stickyHeader`; section labels Materials/Activity for the unchanged ids `inventory`/`events`. Details and evidence: UX_BRAND §11.2–11.5, PROJECT_STATE.

## ADR-030 — Image-led Home workflow and audience photo stage
Status: Human-requested replacement 2026-10-08, local on `ui-redesign`, **awaiting owner review**. No commit, merge or deployment authorized. This supersedes the 2026-10-06/07 rotating, expanding and sticky collage proposals.
Decision: Home's three open image-led workflow steps retain their existing copy, imagery and simulation/concept disclosures. “Who we serve” uses a spacious deep-navy section headed “Built for the people behind every project.” Desktop places a large rectangular stock photograph and its audience description beside seven ruled native buttons, approximately two-thirds photography and one-third selector. All identities and descriptions come from the approved configuration in the existing order; the first audience is selected immediately. A yellow rule, brighter type, visible “Selected” text and `aria-pressed` indicate selection. Click, tap, Enter and Space change selection while keeping control focus. A polite status announces the new audience and description. No tabs, autoplay, hover selection, numbering, cards, rotation, pinning or scroll transforms.
Motion/failure: only the image crossfades for 200 ms; audience text changes immediately. Latest selection wins; pending image decodes and cancelled animation completions cannot restore stale choices. Photo dimensions and the largest description reserve space. Loading failure exposes a photo-unavailable message while retaining all audience information. Reduced motion switches immediately, including when changed during a fade.
Fallbacks: static photo-led content exposes all seven descriptions without JavaScript, on phones and whenever the layout has less than 49rem of room for the photo, selector and gap (desktop also requires a 1024px window). Native focus transfers between a hidden selector control and the matching static heading during live layout changes; the destination is kept below the actual header. Selection and focus elsewhere are preserved. `stable-position.ts` remains shared with capabilities.
Media: seven existing cropped Pexels photos are reused unchanged. Sources and hashes remain in `design/home-visual-samples/ASSET_SOURCES.json` and `CROPS.json`. The visible illustrative-stock disclosure remains. No customer, partner or hardware claim is added.
Consequence: `audience-stage.ts` replaces `collage.ts`; collage styles and browser scenarios are removed. The Home/demo browser suite verifies the new selector and fallbacks. Local screenshots and recording are ignored under `design/references/audience-stage/`; verification is in PROJECT_STATE. `SegmentGrid` on Solutions is unchanged.

## ADR-031 — Audience orbit, Stage 1 visual motion prototype
Status: Human approved Stage 1?s visual direction on 2026-10-08 and authorized Stage 2. Stage 2 is implemented locally on `ui-redesign`, uncommitted and awaiting review of the completed interaction. This new visual direction supersedes ADR-030's photo-selector direction for the current local Home only. It does not change any business/content approval or production-delivery claim.

Reference inspected: the existing `design/references/who-we-werve-reference-layout.png`, plus sampled frames from `who-we-serve-reference-motion.mp4` (6.97 seconds, 1920×1080). The user's parent rotation/counterrotation/scale description supplies the starting mechanics; recording playback time does not establish scroll distance. Existing review captures were also inspected. No missing file is claimed as inspected.

Stage 1: seven existing approved still-photo crops in a large, irregular arrangement on deep navy, with the heading above and stock disclosure below. One centre photo and six satellites have varied proportions and similar visual weight. Native vertical scroll rotates the parent 0→360°; each photo counterrotates 0→−360° to stay upright. Parent scale grows by 1→1.25 (a viewport fit factor applies to both ends). A horizontal projection and inverse photo stretch spread the orbit across the wide stage while preserving photo proportions. This is a prototype tuning choice, not a measured reproduction of the reference. Sticky travel is `min(1500px, 1.65 × viewport height below the measured header)`; reverse scrolling reverses it. No input interception or autonomous movement.

All seven exact names/descriptions stay in normal reading order, visibly below the composition. Stage 1 used decorative orbit images; Stage 2 makes each photo a native button with its visible audience name, `aria-pressed`, yellow selected treatment and a clear focus outline. The first audience is selected immediately. A stable description region below the composition reserves space for the longest approved description; a polite status announces activation. No tab-widget semantics or hover selection. Mobile, reduced motion, no JavaScript, short viewports and text/layout that cannot fit use a static photo grid exposing all seven descriptions. Live mode changes anchor the audience text being read, retain focus and preserve content below. Local paint containment prevents intermediate counterrotation overflow boxes from enlarging the document; the visible photo rectangles themselves remain inside the art area. No page-wide overflow masking.

Recovery: the working audience-selector baseline is preserved in ignored `design/references/orbit-stage-1/audience-selector-baseline.zip`, with original paths and SHA-256 manifest; loose source snapshots and restoration instructions are in `baseline/`. `audience-stage.ts` remains intact but is no longer imported. The original selector tests remain in the recovery ZIP. Stage 1 source snapshots are preserved under `design/references/orbit-stage-2/`; current browser scenarios cover the orbit and selection.

Stage 2: the visible cue explains selection and focus pause. Motion freezes while a photo has focus or a pointer is pressed; native scrolling remains available and motion resumes without a jump. Activation is synchronous and independent of image loading, so rapid changes finish on the latest choice. Failed images retain reserved dimensions, the audience label, description and a visible unavailable-photo message. Live fallback transitions transfer focus between the matching photo and static heading below the actual header, retain selection and preserve reading position. The approved Stage 1 geometry and native scrolling mechanics are retained. Type, unit, build, complete guarded browser and separate release checks pass; actual evidence and remaining limitations are in PROJECT_STATE. No commit, push, merge, deployment or real inquiry is authorized.

## ADR-032 - Enlarged orbit around a stationary stock-video centre
Status: Human requested 2026-10-08; first poster/storyboard checkpoint implemented locally, **awaiting visual review**. Extends ADR-031 selection and fallbacks; replaces its one-centre/six-satellite geometry. No final video edit or playback before review.

Decision: put all seven approved audience photos on an outer rounded perimeter, around a fixed upright centre poster. Retain parent turn and child counterrotation; map anchor positions into the parent's rotating coordinate system so pixels and labels stay upright. Measure upright rectangle clearance and distribute spare perimeter space between all seven gaps, allowing larger photos without corner collisions. The centre does not orbit or scale. Use 0.9-to-1 expansion and native sticky travel `min(900px, 0.95 * available viewport height)`, compact heading and stable selected description outside the artwork. Preserve focused pause/resume, synchronous selection and live static fallback transitions. No input interception or runtime dependency.

Media: the centre poster is derived from locally downloaded Mikael Blomkvist/Pexels video 8964794. Proposed four-shot, approximately 10-second muted montage uses that clip and existing David Pickup/Pexels 31009581, with candidate crops excluding branded crane surfaces. Visible stock disclosure disclaims BuildTrack customers/projects/working hardware. Official licence, creators, URLs, file hashes and crop intervals are in `design/media-source/AUDIENCE_CENTRE_PROPOSAL.json`. A concrete-work alternative could not be downloaded; it is excluded. Storyboard/capture/raw footage stay under ignored `design/references/orbit-centre/`; only the optimized poster reaches `public/`.

After visual approval: final frame-by-frame crop review and montage editing; muted inline video, visible Play/Pause, visibility/eligibility gating, no automatic video download on mobile/reduced motion/Save-Data, immediate pending-autoplay cancellation on live changes, preserved poster on failure, and static no-JS centre. Full regression checks follow that implementation. Type/build and focused geometry/fallback checks run at this checkpoint; earlier full-suite results do not certify this revision. No commit/push/merge/deploy or real inquiry.

Dense composition revision, 2026-10-08: still awaiting visual review. Replace sparse fixed rectangles with variable upright rectangles on a closer perimeter. Grow free edges into available gaps while maintaining 9px control separation and centre clearance; compare fill orders by actual image area. The centre is fixed at 44% of the visual stage width/height. Expansion is now 0.985 to 1, leaving room for all-angle focus clearance; native travel remains bounded as above. Compact horizontal heading and inline selected marker reduce caption overhead. Enhanced eligibility now requires at least 390px of artwork height, so 1366x768 fits; insufficient/enlarged-text layouts remain static. All 362 sampled phases pass geometry checks, but corner coverage dips remain: see PROJECT_STATE for actual image-area measurements and visual limitations. No final montage work or full regression suite before this visual checkpoint. Earlier expansion/spacing values above describe the recoverable previous revision.

## ADR-033 - Home motion sequence prototype
Status: Human requested and subsequently approved the three sections' visual direction on 2026-10-08; local/uncommitted. Supersedes the local audience selection/mosaic and separate centre montage in ADR-031/032. Composition, motion, timing and workflow cards are preserved. Seven audience clip proposals are now sourced; clip selection and full-frame fit await human approval before playback integration. Business approvals and production-delivery gates remain unchanged.

Implementation comparison, written before implementation: native CSS sticky plus a passive scroll listener and one requestAnimationFrame per scroll frame can express this single compact-entry/rotation/expansion/title-reveal/hold/release timeline. It also reuses the existing stable-position helper and measured-header layout handling. GSAP ScrollTrigger provides scrubbed timelines, pinning, responsive refresh and lifecycle APIs ([official documentation](https://gsap.com/docs/v3/Plugins/ScrollTrigger/)); it would help a larger timeline but still requires our text-fit, focus and fallback decisions. Choose native implementation here: fewer moving parts, no new dependency, no pin spacer teardown or independent smooth-scroll clock. No wheel/touch/key interception, timer-based pinning or transplanted reference code.

Diagnosis: the previous dense solver recomputed widths/heights and selected the maximum-area fill order at every scroll frame. Discrete changes in the winning arrangement and edge obstacles caused abrupt rectangle changes; object-fit cover exposed different portions of the same image, resembling image switching. The actual image src/order remained fixed. The replacement fixes media dimensions/proportions during each layout measurement and uses continuous transform-only motion during scrolling; coverage percentage is retired as a design target.

Implemented checkpoint details: native parent turn 0-to-360 with opposite child turn; uniform 0.54-to-1 growth, fixed natural 4:5 file frames and one approved audience at the centre. Elliptical projection uses transforms without stretching media. Temporary vertical clearance during rotation is continuous. Titles reveal only after rotation, followed by about 211-251px of native scroll hold at the review sizes. No audience selection/description duplication on Home; configuration/Solutions copy preserved. Semantic figure/title grid is the default and live fallback (including Save-Data). Focus remains on the same DOM heading; focused titles reveal the completed scene, and stable-position handling protects content below. Workflow anchors target existing Capture events, Proposed cloud platform and Dashboards and decisions; only valid detailed-step IDs added. Laptop rise/right-phone motion tuned after actual live entrance inspection; timing and cancellation recorded in UX_BRAND. No media sourcing or playback implementation at this checkpoint.

## ADR-034 - Natural-aspect candidate poster cluster
Status: Human requested 2026-10-08; local prototype **awaiting visual and clip approval**. The laptop/phone entrance, workflow cards and audience scroll timeline remain approved and unchanged. No candidate video is approved as a final asset. Supersedes the fixed-4:5 contain-fit proposal; business/release/delivery gates unchanged.

Use natural full-frame candidate poster dimensions. Comparable media area with modest size variation; one centre audience and a close irregular cluster. Geometry computes 120 centre poses once at layout measurement, with fixed image dimensions/source order, smooth neighbouring-pose filtering and cubic interpolation during scrolling. Shared 0.54-to-1 growth enlarges the cluster as one unit. Parent turn and child counterrotation preserve upright imagery. Unlike the retired sizing solver, no packing, size/order selection or source switching occurs per scroll frame. Slight decorative overlap during motion; final media separate and titles reveal on readable gradients inside their own frames. Original title-reveal, hold and native release/reversal distances retained. Static fallbacks and stable-position/focus handling stay in place. No dependency or wheel/touch/key interception.

All seven original clips retained as unapproved candidates. Two stronger alternatives are also candidates: Kindel Media/Pexels 8487126 (active electrical-site inspection) and Hamza Awan/Pexels 14977406 (parked fleet/staging area). Both 16:9 replace 9:16 posters in this proposal, changing final layout proportions; no playback. The fleet is relatively small in its full frame and is not verified as a rental yard/handover. Joshua Lim/Pexels 7791770 rejected because manufacturer logos are visible. Official source/licence pages checked; records/hashes/source files retained outside deployment output. Seven optimized WebP posters are the only new public media. Evidence and baseline recovery: ignored `design/references/audience-natural/`; provenance: `design/media-source/AUDIENCE_VIDEO_PROPOSAL.json`. Stop for visual and clip approval before playback/final loop work and complete regression testing.


Historical audience clip checkpoint (contain-fit proposal superseded by ADR-034), 2026-10-08: reuse one suitable local source and propose six new Pexels downloads. Official Pexels licence/source pages checked; creator, URLs, intervals, hashes and full-frame review limitations in `design/media-source/AUDIENCE_VIDEO_PROPOSAL.json`. Branded local crane footage and branded alternatives rejected. Sources and four-second review previews remain under ignored `design/references/`, not public/deployment output. Review packet includes labelled storyboard and aspect-fit sheet. Four landscape 16:9 and three portrait 9:16 sources differ from the approved 4:5 photo frames. Proposed contain fit preserved approved outer geometry/scroll timeline but added navy bands; changing intrinsic outer geometry required another visual review. Neither fit nor playback was implemented at that checkpoint. Seamless loop work, playback resilience and complete regression suite remained deferred.

ADR-034 local playback revision, 2026-10-08: the human authorizes the current seven candidates, including active inspection and parked-equipment alternatives, for **local playback review only**. Final asset, adjusted-composition and production approval remain pending. Bring the left portrait inward, slightly reduce its proportional size and blend the upper pair's corresponding alignment through the existing precomputed path. Preserve natural full frames, fixed dimensions during scrolling, shared growth, counterrotation, title reveal, hold/release and native input. No dependency added.

Seven four-second H.264/yuv420p, muted 24fps fast-start derivatives use exact 768x432 or 432x768 frames (2,339,673 bytes total); matching WebP posters stay underneath. `audience-videos.ts` creates media only near an eligible desktop stage. Eligibility includes mobile, reduced motion, Save-Data, enlarged text and short-viewport poster fallbacks. Pause off-screen/when hidden; one native Pause/Play control retains explicit Pause across live layouts/preferences and rapid activation. The control remains mounted/focusable with `aria-disabled` in static layouts, so its focus does not disappear. Preference changes synchronously unload pending media; generation tickets reject stale play completions. Refusal offers a deliberate Play retry; a failed stream returns to its poster independently. Show video pixels after a presented decoder frame. Sources/captures remain ignored outside deployment output; only optimized runtime derivatives are public. Creator/source/licence/hash records remain in `design/media-source/AUDIENCE_VIDEO_PROPOSAL.json`. Existing manual business, release and delivery approvals are unchanged.

Audience final-pose refinement, 2026-10-08, local ui-redesign; awaiting visual review. Inspected owner reference design/references/image(20261008-125116).png. Least-squares matching all seven centres to the saved previous path identifies approximately 300.65 degrees, old normalized motion progress 71.33%, RMS 0.704px (manual frame-edge measurements, about 1px tolerance). Rotation now ends there, followed by the existing title reveal, 211-251px hold and normal release. Fixed per-layout frame dimensions and smooth precomputed centre corrections preserve continuous reverse motion. Larger side landscapes, lateral spacing and a shorter inward portrait make the final cluster about 67.6% wider at both review sizes; natural full frames retained. Portrait caption extends into clear navy space to keep whole words readable. No descriptions restored. Player, video files, device entrance and workflow cards unchanged. Manual asset, business and production-delivery approvals unchanged.

Reference matching uses the recoverable pre-change path, not a wheel-step assumption. The endpoint angle changes; original motion-travel/title-fade/hold distances remain. All-angle fit samples use the same endpoint as rendering. Per-layout lateral clearance and individual area weights replace uniform enlargement; the endpoint correction blends continuously through cubic interpolation without per-frame packing. The portrait title can use adjacent clear space; focused checks verify whole-word readability and no final title overlap.

## ADR-035 - Approved Home sequence and remaining-page redesign direction
Status: Home visual appearance **approved by the human 2026-10-11**, including Codex's 2026-10-10/11 revisions (external audience titles, aligned final rows, centre title on one desktop line below its video, enlarged bottom pair). Remaining-page direction requested 2026-10-11; **Solutions visual direction approved by the human 2026-10-11**; How It Works follows (below). No dependency added; business, release and delivery gates unchanged.

Home: approved behaviour is the coordinated laptop/phone entrance, image-backed workflow cards linking to How It Works step anchors, the seven-video native-scroll sequence (rotation, growth, title reveal, hold, release, reversal), Pause/Play control and static fallbacks. Its "Explore audience needs" link now targets `/solutions/#segments`.

Remaining pages transfer Home's visual character, not its mechanisms: navy/ink bands with yellow accents, large purposeful images and demo screenshots, open layouts with rules instead of card boxes, shorter copy with clear hierarchy, and one restrained motion per page where it helps. No further pinned or rotating sequences. Essential information stays visible without hover, animation or JavaScript.

Solutions: navy intro with numbered capability jump links and a fanned stack of three demo screens (one-time CSS fan-out, none under reduced motion); a single disclosure that scanning/tags/readers are the proposed hardware concept; four alternating capability rows each led by its demo screenshot, keeping the problem, all points, the per-service quotation link and a demo link; supporting services as an open four-column ink band with icons and per-service quotation links; all seven audiences with equal 4:5 photo tiles (the approved stock crops Home no longer uses; provenance in `design/home-visual-samples/`) and their configured needs. Reveals reuse `src/scripts/reveal.ts`; screenshots wipe in from their outer edge, clipped so they never widen the page. `SegmentGrid.astro` and `SamplePanel.astro` had no other users and were removed.

How It Works (2026-10-11; awaiting visual approval): three steps (Record, Monitor, Review) replace the four-step component, with resource tagging folded into Record and every existing anchor kept, including Home's three card targets. Each step states its working/simulated/concept status. The technology comparison remains a real table (caption, row and column headers); phones restack its rows with explicit table roles instead of requiring horizontal scrolling. The step rail fill is a CSS scroll-driven animation written as longhands (the minifier otherwise merges them into an invalid `animation` shorthand). `ProcessSteps.astro` had no other users and was removed; the inactive `audience-stage.ts` was deleted after confirming no imports and a byte-identical copy in ignored `design/references/orbit-stage-1/audience-selector-baseline.zip`.

How It Works honest-scope "prototype blueprint" (requested 2026-10-11; awaiting visual approval): the four text columns become three visually distinct, always-labelled parts (Working website screenshot, Simulated demo screenshot, Concept-only line drawings) on a blueprint-grid navy band, plus a separate yellow pending notice and a native `<details>` with every original list. Status uses distinct shapes as well as words; only working items carry a check. The working description follows the same `formProvider.endpoint` condition as `disclosure()`, and the notice prints `status.stillToCome`, so endpoint configuration never becomes a delivery claim. A new website screenshot (`public/media/site/website-contact.webp`) is captured from this site's own build (UX_BRAND §11.5). Outline/drawing motion uses `stroke-dashoffset` on `pathLength="1"` shapes; the working outline is sized with CSS geometry, because a scaled viewBox with non-scaling stroke drew it incompletely.

Pricing (2026-10-11; How It Works and its prototype blueprint approved by the human the same day; Pricing visually approved by the human 2026-10-11): open three-column packages with large price typography and subgrid-aligned rows replace the boxed plan cards (`PlanCard.astro` removed, no other users). Values, disclosures, inclusions, onboarding/support replacement notes, limits, exclusions and Contact preselection links are unchanged and still read from configuration. The comparison table's semantic structure is unchanged; presentation adds decorative status symbols, a sticky caption/group label, and an em-based rule that unpins the feature column when enlarged text would otherwise break words. Separately quoted items no longer use the check marker, which implied inclusion.

About and Contact (2026-10-11; Pricing visually approved the same day; both visually approved by the human 2026-10-11): designed after inspecting real About/Contact pages (Linear, Stripe, Procore, Buildots, Vercel; two further URLs returned 404 and were not used). About uses editorial typography and one approved site photo; all copy is existing approved text or configuration, and no team, customers, history, office or achievements are added. Contact keeps the inquiry form as the focus inside a quiet split with a decorative navy panel; the form component's markup and submission logic are unchanged, with one CSS-only narrow-screen fix for the request-type marker. `CoverageNote.astro` became unused and was removed. Em-based media queries (`max-width: 22em`) step display type down only when the screen is narrow relative to the user's text size.

Consistency pass (2026-10-11; About and Contact visually approved the same day; awaiting review): the previously recorded header focus loss is fixed. Cause: the desktop navigation query is rem-based, so a browser text-size change collapses or expands it, and Chromium fires no media `change` event for that; a focused desktop link or the Menu button became hidden and focus fell to `body`, so the next Tab skipped the header. `nav.ts` now detects the switch from its existing header ResizeObserver (and still listens for `change`), remembers a header control that lost focus only because it was hidden, opens the menu to keep a focused link visible, or moves focus from the hidden Menu button to the current page's link. A regression scenario fails on the previous script and passes on the fix. Shared CTA heading, 404 and demo polish are presentation-only.

## ADR-036 — Final redesign and publication approvals
Status: **Approved by the human 2026-10-11.** The final redesign of all pages (UX_BRAND §11–12, including the Solutions label and focus-outline fixes), the Home audience media treatment and its seven licensed clips/posters for publication, the public page copy, and the current privacy and confirmation wording for this academic prototype. Authorizes committing the 52 paths recorded in `docs/UI_REDESIGN_REVIEW.md` on `ui-redesign`, merging into `main` without history rewriting, and pushing for Cloudflare's automatic deployment.

Not approved or verified by this decision: Formspree notification-recipient verification and receipt of a production test request; they remain the open manual release gates. This is not full release acceptance. Prices remain proposed academic pricing.

## ADR-037 — Home capabilities "drawn, then built" (proposed)
Status: **Proposed; implemented locally on `home-drawn-capabilities` 2026-10-12, awaiting the human's visual review.** Not committed or published; the live site keeps ADR-029's horizontal showcase until this is approved.
Decision: the desktop capability section pins only the capability list and one stage (the intro and closing link scroll normally, so it fits 1366×650-class laptop windows). Each screenshot is drawn from outlines of its own measured regions, in 4-5 bands, and revealed band by band with a soft sweep while the outlines fade; phases overlap and the finished screen is exact. Each description sits under its own heading; only the active one is open (instant, short fade), and the column reserves its tallest open height. This revisits the earlier shared description slot, which detached descriptions from their headings.
Focus policy: a hidden link is never left focused; when the shown capability changes, focus on a capability link moves to the shown one first (no scrolling). Layout switches follow focus only while it is engaged (keyboard-placed or on screen at the last scroll); otherwise the reading position wins, and visitors elsewhere are never pulled back. Pointer focus never moves the page.
Fallbacks: the complete static list below 64rem, under reduced motion, without JavaScript, after a failed start, in short windows and at any enlarged default text (above 16 px; kept deliberately even where the pinned layout would fit).
Consequence: `src/scripts/scrolly.ts` is replaced by `src/scripts/capability-stage.ts`; details UX_BRAND §13; evidence and checks PROJECT_STATE. Supersedes ADR-029's capability showcase only once approved.
Update 2026-10-12 (pacing, after the human reviewed a recording): each capability gets 760-900 px of scroll; outlines draw one after another over ~40%, band reveals are eased and overlap through 75%, and the finished screen holds for the last quarter (keyboard jumps to 87%). The pinned track grows by 500-800 px. Still proposed; awaiting visual review.

## ADR-038 — Moving navigation indicator (proposed)
Status: **Proposed; implemented locally on `home-drawn-capabilities` 2026-10-12, awaiting the human's visual review.** Not committed or published.
Decision: the desktop header uses one moving yellow indicator instead of a static current-page underline and a separate hover underline: under the current page at rest, under a hovered link, back to a keyboard-focused link (or the current page) when hover ends; keyboard focus takes over from a resting pointer. Links get modest side padding with a correspondingly smaller gap, so text spacing and the 75rem breakpoint are unchanged.
Constraints kept: `aria-current` follows the route; the focus outline is independent; reduced motion moves it at once; the mobile menu and the no-JavaScript header keep static markers; geometry is measured on change only (no idle work). Details UX_BRAND §14; checks PROJECT_STATE.

## ADR-039 — Product Demo: application shell leads (proposed)
Status: **Proposed; implemented locally 2026-10-12, awaiting visual review.** The shared site header stays on the demo page for consistency (non-sticky, as before; an interim version without it was reverted at the human's request the same day). Below it, a full-height sidebar carries the application name, Back to website, sections and the simulation note; a compact workspace header carries the section title, project and Reset; the marketing intro becomes a short introduction and fuller disclosure inside the workspace; no website navigation is duplicated in the workspace; on small screens the Sections drawer holds the sidebar. Calculations, fixtures, filters, scan limit, Reset/reload, hash entry points, announcements, drawer focus and no-JavaScript access are unchanged. Home, Solutions and How It Works screenshots were recaptured from this shell (UX_BRAND §11.5). Supersedes ADR-029's demo intro once approved; ADR-029's non-sticky header is kept.

## ADR-040 — Shared blueprint grid on dark surfaces (proposed)
Status: **Proposed; implemented locally 2026-10-12, awaiting visual review.** How It Works' major/minor blueprint grid becomes shared tokens applied to navy/ink background surfaces on all pages, quieter on the header and demo sidebar, never over the hero video, photographs, forms, tables, charts or screenshots; static. Details UX_BRAND §15.

## ADR-041 — Academic estimate and standalone simulated payment page (review-version publication approved)
Status: **Built locally 2026-10-12; owner authorized academic review-version publication on 2026-10-13, including the estimator with CE validation pending and disconnected payment simulation.** Owner authorization to build does not mean Civil Engineering validation of the estimator or provider eligibility for payments.
Decision: Product Demo gains a "Tools" group beside its six tracking sections. (1) **Concrete estimate:** the documented batch-mixer model (volume, waste allowance, batches, idealized time), a working calculation for teaching, with its constant-cycle assumption stated and CE review pending; no cement-bag conversion; tracking fixtures and metrics untouched. (2) **Payment walkthrough:** a simulation from a fictional quotation through simulated acceptance and a card/bank choice to a simulated success, failure or cancellation; nothing is collected, charged, sent or verified; no payment fields, account details, QR codes or uploads; no backend; the inquiry form is independent. (3) **Provider sandbox connection point:** a configuration value, off by default ("Provider sandbox not connected."); a link appears only for an https provider-hosted test link the owner marks as verified; no keys, no account creation, no provider requests from the site; a provider return is never proof of payment. Live payment acceptance stays outside scope (the project's no-payments constraint is unchanged: nothing accepts money).
Consequence: `concrete-estimate.ts`, `payment-walkthrough.ts`, `payment-sandbox.ts` (lib), `src/config/payment-sandbox.ts`, `demo-tools.ts`, `EstimatePanel.astro`, `PaymentPanel.astro`; disclosure wording on How It Works and About. Details UX_BRAND §16; proposal and research docs/PROPOSALS_ENGINEERING_PAYMENT.md; checks PROJECT_STATE.
Update 2026-10-12 (Codex findings and placement): the estimate uses exact decimal arithmetic (inputs limited to six decimal places; no tolerance; the final batch never exceeds rated output) and marks rounded and "< 0.001" results; its reopening announcement no longer claims example values. The sandbox link must be a supported provider's documented test route, parsed structurally (PayMongo `https://pm.link/{handle}/test/{reference}`), in addition to owner verification. The payment walkthrough moved from the Product Demo to a website page, `/payment-demo/` (shared header and footer, persistent "Academic payment demonstration — no real charge" notice, linked from Pricing; outside the main navigation); the Product Demo keeps only the estimate, and its Reset no longer involves payment. `PaymentPanel.astro` was replaced by `src/components/payment/PaymentDemo.astro`, `src/scripts/payment-demo.ts` and `src/pages/payment-demo.astro`.

## ADR-042 — Provider integration deferred; payment demo stays fully simulated (publication approved 2026-10-13)
Status: **Owner decision 2026-10-13; the seven-step simulated walkthrough was approved for publication the same day.** Supersedes ADR-041's provider sandbox connection point (item 3) only. ADR-041's history and the PayMongo research are preserved.
Decision: the owner dropped PayMongo setup for this academic project. No provider account, test link or connection is planned, and payments stay entirely simulated. Reasons: direct research (PROPOSALS_ENGINEERING_PAYMENT.md B.1) showed that Payment Links require an activated merchant account with a closed-loop wallet after KYC. Whether test mode works before that is undocumented, and live card capability needs a registered business type. Whether a test link offers online banking is also unconfirmed, and test-mode QR Ph codes are real if scanned. Pursuing this would need the owner's identity verification and account access for a feature the course demonstration does not require. The `/payment-demo/` walkthrough was extended rather than rebuilt into the proposed seven-step journey:
1. A sample quotation prepared by the owner (service, illustrative price, reference).
2. A quotation-email preview.
3. The customer's own acceptance or refusal.
4. A payment-invitation email preview.
5. A card or bank choice.
6. A fictional checkout illustration without fields.
7. A simulated success, failure or cancellation reading "Simulated—no money moved. Not a payment receipt.", with restart.

Role labels distinguish owner, customer and illustrated provider steps. The persistent notice reads "Academic payment demonstration — no real payment or email is sent." Email previews send nothing, contain no addresses or links, and are not connected to Contact inquiries. The unused provider-sandbox box, `src/config/payment-sandbox.ts` and `src/lib/payment-sandbox.ts` were removed with their tests; nothing else used them.
Consequence: `payment-walkthrough.ts`, `PaymentDemo.astro`, `payment-demo.ts`, the page intro and meta description, and the payment disclosure ("nothing is collected, charged or emailed") changed. Pricing's demo link and inquiry CTAs are unchanged. A future real process would need a separate decision: provider account and eligibility, the owner's verification, and live activation documents. Details UX_BRAND §16; handoff PRESENTATION_HANDOFF; checks PROJECT_STATE.

## ADR-043 — Small backend authorized for the quotation workflow (design approved for local implementation)
Status: **Owner authorization 2026-10-16 for a small backend. The revision-3 design was approved the same day for local implementation (dedicated `/contact/quotation/` form, separate Access-protected owner Worker). Approved defaults: 90-day retention, 14-day link validity, "Bank transfer (simulated)". The privacy wording remains draft. No purchase, account, billing, real email, deployment, push or merge is authorized.** Supersedes ADR-009's no-backend/database/auth/admin restriction **for the quotation workflow only** and amends ADR-016 (assets-only hosting). ADR-014 (no new runtime dependency) and ADR-042 for `/payment-demo/` remain in force.
Decision: a quotation request may be stored, Sunny notified, a quotation reviewed and explicitly approved on an owner-only page, emailed to the customer with a unique link, explicitly accepted by the customer, and followed by a clearly simulated checkout. No real payment, payment provider, financial-data collection, payment instructions or QR codes.
Consequence: the design, costs, checkpoints and implementation record are in docs/PROPOSAL_QUOTATION_WORKFLOW.md. Production `wrangler.jsonc` stays assets-only until a separately authorized cutover; local work uses `wrangler.workflow.jsonc`. The workflow is disabled in the committed config (`src/config/quotation.ts`). The sending domain and the service accounts remain undecided.
Update 2026-10-16 (checkpoint 1 review repairs):
- Rate-limit identity: from `CF-Connecting-IP` only. IPv4 is kept whole and IPv6 is grouped by /64, as an abuse-control heuristic. A missing or malformed value is refused.
- Pseudonymous values: keyed with a dedicated `INTAKE_HMAC_KEY` secret (versioned) instead of a salt stored in D1. Counters are deleted after 48 hours by a scheduled cleanup.
- Limits: a global cap of 200 new requests per UTC day, enforced atomically in the insert.
- Body caps: derived from worst-case encodings of the field limits.
- Duplicates: JSON retries are idempotent only for an identical payload, and a changed payload gets 409. No-JS de-duplication covers the full payload and the client, and never repeats a reference.
Details: PROPOSAL_QUOTATION_WORKFLOW.md §18.
Update 2026-10-16 (second review repairs):
- A one-row daily total replaces per-request counting.
- Refusals are decided by a read-only pre-check, with the client limit checked before the global cap.
- Quota reservation, request storage and notification queueing are one D1 batch; a failed save consumes nothing.
- The global cap stays as a safety ceiling.
- Planned, not implemented: Turnstile before activation. With it, no-JS quotation intake would end and needs approval.
- One owner warning per UTC day when the cap is reached, sent once email exists (data hook in place).
Details: PROPOSAL_QUOTATION_WORKFLOW.md §18.
Update 2026-10-16 (Codex review repairs):
- References come from a per-year sequence row inside the save batch.
- No-JS bodies are decoded strictly.
- The privacy acknowledgment must be exactly "yes".
- Identical retries disclose the reference only to the same visitor (keyed client hash stored with the request, pseudonymous, deleted with it). The hash is not per day, so it links every stored request from the same client identity under one key version; request-retention deletion is not implemented yet, so those links persist until the retention checkpoint (an activation gate).
Details: PROPOSAL_QUOTATION_WORKFLOW.md §18.
Update 2026-10-16 (checkpoint 1 complete; checkpoint 2 built locally, awaiting review):
- Checkpoint 1 is complete as a disabled local foundation. All activation gates stay pending.
- Owner Worker (`worker/owner/`, local only): an Access JWT check on every request, then review, draft editing, an explicit confirmation page, and approval. Approval queues one quotation email job in the same atomic batch. Nothing is sent.
- Owner form tokens are signed with a dedicated `OWNER_FORM_KEY` and recorded as used inside the change batch, so owner GET pages write nothing. This replaces nonces stored when a page is shown.
- Owner pages use `Referrer-Policy: same-origin`, not `no-referrer`: in Chromium, native form submissions under `no-referrer` carried `Origin: null`, which the exact-Origin rule refuses. In Codex's independent Chromium tests, same-origin `fetch` POSTs kept their actual Origin. The planned `/quote/` policy therefore stays as designed and undecided until it is tested in its own checkpoint (an earlier claim that it needed the same change is withdrawn).
- `OWNER_ORIGIN` must be one canonical serialized HTTPS origin in the deployable owner entry, with no flag or exception. Otherwise the owner Worker answers 503 before any key lookup, route or database access (Codex checkpoint-2 findings). Loopback HTTP is accepted only by the test-only wrapper (`tests/worker/owner-test-worker.ts`), which no production code imports.
- Local Access fixtures exist only in tests; the deployable entry trusts only the team domain's published keys.
- Revoke, delete, dismiss, resend, sending, customer links and retention are deferred.
Details: PROPOSAL_QUOTATION_WORKFLOW.md §18, "Checkpoint 2".
Update 2026-10-16 (checkpoint 2 signed off by Codex; checkpoint 3 built locally, awaiting review):
- Durable email jobs are sent by the owner Worker's scheduled runner: atomic claims with 2-minute leases, expired-lease recovery as ambiguous, and automatic retries only with the same key and payload. Attempts stop 20 hours after the first one, inside Resend's documented 24-hour idempotency window. Definite rejections stop at once.
- The recipient, template version and payload hash are frozen at the first attempt; a payload that would differ is not sent. Database triggers make job identity, frozen snapshots and approved quotation snapshots immutable.
- Customer links are rebuilt from the recorded key version and generation and must match the approved hash; they are never stored or logged.
- "Accepted by the email provider" is recorded and shown separately from delivery, which stays unknown.
- One cap-warning job per UTC day, by idempotency key.
- After the window, only an explicitly confirmed owner resend creates a new key. Its page warns about possible duplicates when an earlier attempt was ambiguous.
- Sending fails closed without full configuration. The deployable entry has only a Resend transport and no mock mode; tests inject an in-memory provider. The `mock_mailbox` D1 table is dropped from the plan because it would store customer links.
- Provider behaviour follows Resend's official docs (read 2026-10-16). Undocumented points are recorded as assumptions, handled on the safe (ambiguous) side.
- New activation gates: sending stays off until the customer routes exist and are reviewed, and until a verified domain, a sending-only key and a controlled end-to-end test exist.
Details: PROPOSAL_QUOTATION_WORKFLOW.md §18, "Checkpoint 3".
Update 2026-10-16 (checkpoint 3 review repairs, awaiting Codex's focused recheck):
- **Send boundary.** The runner reads its clock for each step. It calls the provider only after a durable, lease-checked "call started" mark, then a final check with no await before the call: the 20-hour deadline, the quotation expiry, and enough lease for the call. Database checks and an HTTP request cannot be one atomic step, so the provider's idempotency key stays a separate safeguard.
- **Duplicate warning.** It considers every email job of the quotation; authorization stays bound to the latest job and version.
- **Owner wording.** One statement per state: queued, not accepted, unknown, accepted. Acceptance is never called delivery.
- **Scheduled gate.** The scheduled run uses the owner pages' full configuration check (`ownerConfigured`, including Access settings and `OWNER_FORM_KEY`) before any database access.
- **Attempt history.** `email_attempts` holds ids, times and outcome codes only. It is written with the claim, closed on lease recovery, and deleted with its job.
- **Readiness.** Quotation emails need the committed constant `customerRoutes.ready` (default false). Credentials never enable them. Turning it on requires verified customer routes.
Details: PROPOSAL_QUOTATION_WORKFLOW.md §18, "Checkpoint 3 review repairs".
Update 2026-10-16 (skipped-call bookkeeping, awaiting Codex's narrow recheck):
- Attempts record a lease-checked send intent (`send_intent_at`) separately from actual transport invocation (`provider_called_at`).
- A call skipped by the final checks closes its attempt with the reason, atomically and only under ownership. The job is stopped (deadline, expiry) or rescheduled (too little lease), with no added ambiguity; earlier ambiguity is kept.
- Lease recovery marks a job ambiguous only when its open attempt had recorded an intent. Genuine crashes in the database/network gap therefore stay ambiguous, and provider idempotency stays the separate safeguard.
Details: PROPOSAL_QUOTATION_WORKFLOW.md §18, "Checkpoint 3 skipped-call bookkeeping".
Update 2026-10-16 (checkpoint 3 signed off by Codex; checkpoint 4 built locally, awaiting review):
- **`/quote/` shell:** a static page added only by the `quoteRoute()` integration while the workflow is enabled, so committed builds are unchanged. The token comes from the URL fragment, is removed from the address bar at once, is kept in the tab's session storage, and is sent only in POST bodies.
- **Shell headers:** the public Worker serves the shell `no-store`, `noindex`, `no-referrer`, unframeable, with a same-origin CSP that hashes the page's inline scripts.
- **Customer API** (`/api/quote/view|accept|decline|simulate`): POST JSON only from the exact public origin, with a per-client hourly limit. Every request is checked server-side against the stored link hash (`quote_links`) and the quotation's state.
- **Link states:** invalid, expired, revoked and superseded are told apart only to holders of a genuine 256-bit token, with no quotation details. This deliberately departs from §4's single neutral 404.
- **Decisions:** accept and decline are explicit, version-checked, atomic and idempotent.
- **Simulated outcomes:** they need an accepted quotation, are idempotent per attempt, are labelled simulated, and never change the quotation's status.
- **Demo code:** "Demo code — enter 12345678" is checked only in the browser and never transmitted.
- **Origin under `no-referrer`:** the page's same-origin fetch POSTs were observed to keep their exact Origin, so the owner pages' referrer workaround was not applied to `/quote/`.
- **Readiness:** customer readiness stays off until a controlled preview verifies the routes.
Details: PROPOSAL_QUOTATION_WORKFLOW.md §18, "Checkpoint 4".
Update 2026-10-16 (checkpoint 4 review repairs, awaiting Codex's focused recheck):
- **Page state:** the `/quote/` page binds all state to a per-link session and discards responses from earlier sessions. Confirmations and checkout clicks carry their own token and version.
- **Fragments:** an explicit fragment never falls back to the tab's stored link.
- **Uncertain outcomes:** these are stated as unknown, and "Check again" repeats the identical idempotent request.
- **Write-time authorization:** every customer write re-checks inside its own statement the current link hash and generation, link and quotation revocation, state and version, and expiry. Expiry is evaluated at a time read immediately before the write, and a failed check writes nothing.
- **Attempt conflicts:** reusing a checkout attempt with a different choice is a 409 and changes nothing.
- **Runtime expiry:** tested on real workerd/D1 with short-lived immutable fixtures.
Details: PROPOSAL_QUOTATION_WORKFLOW.md §18, "Checkpoint 4 review repairs".
Update 2026-10-16 (checkpoint 4 second review repairs, awaiting Codex's focused recheck):
- **Recognised answers only:** the page treats only a fully recognised response as an answer. Unreadable, malformed or mismatched responses, even with HTTP 200, are uncertain. "Check again" repeats the exact request, and nothing new starts until it is resolved.
- **Empty fragment:** `/quote/#` is an explicit (invalid) link.
- **Checkout version:** simulated checkouts carry and are bound to the displayed version.
- **Stored results:** a stored attempt is returned only after re-checking current authorization at a fresh time.
- **Test identities:** tests use one stable client identity per customer journey, never per-request rotation.
Details: PROPOSAL_QUOTATION_WORKFLOW.md §18, "Checkpoint 4 second review repairs".
Update 2026-10-16 (checkpoint 4 third review repairs, awaiting Codex's narrow recheck):
- **Refused checks:** a refused "Check again" (429 or any other refusal) settles nothing. The page keeps the exact request and the action lock, shows the Retry-After wait, and says the check was refused, not that the action failed.
- **One snapshot per response:** every customer API response takes all its quotation data (view, conflict views, history, stored attempt result) from one `SELECT`. That statement also enforces the current link, generation, revocation, state and expiry at the read time.
Details: PROPOSAL_QUOTATION_WORKFLOW.md §18, "Checkpoint 4 third review repairs".
Update 2026-10-17 (checkpoint 4 fourth review repairs, awaiting Codex's narrow recheck):
- **Link problems after an action:** once an acceptance, decline or checkout has been sent, a link problem (revoked, expired, superseded) on the first answer or a retry shows the problem together with truthful uncertainty and the phone contact. It keeps the exact request, the lock and "Check again". Retries stay under normal link authorization.
- **When recovery ends:** only on a recognised settling answer, a session replacement (a new or explicitly invalid link) or a fresh page load.
Details: PROPOSAL_QUOTATION_WORKFLOW.md §18, "Checkpoint 4 fourth review repairs".
Update 2026-10-17 (local implementation completed; uncommitted; awaiting Codex's consolidated review, no independent signoff yet):
- **Reload:** the customer page keeps minimal, validated, tab-scoped pending-action metadata (never the demo code or quotation content) and restores the exact request, lock and uncertainty after a reload. If storage fails, nothing is sent. The private `no-store` headers are kept.
- **Owner lifecycle:**
  - revoke (approved or emailed only);
  - new link (the next generation with the same immutable snapshot and expiry, none after expiry);
  - dismiss (a received request without a quotation);
  - delete (whole request; refused while a send is in flight).

  Each is a confirmed POST under the existing Access, Origin, single-use token and version guards. Already-dispatched emails are never described as recallable.
- **Retention:** 90 days after `last_activity_at`, which only owner actions and state-changing customer actions move. Bounded batches run on the owner cron. Reference counters are kept. Backups, provider logs and mailboxes are stated as outside the application's control.
- **Turnstile:** server-side validation is implemented and fails closed, but stays disabled (literal `TURNSTILE_ON = false`, `TURNSTILE_ENABLED=off`). **Requiring JavaScript for quotation intake is not approved.**
- **Deployment:** templates and `docs/QUOTATION_RUNBOOK.md` are prepared; nothing is provisioned, and production stays assets-only.

Details: PROPOSAL_QUOTATION_WORKFLOW.md §18, "Local completion"; review packet: docs/CODEX_HANDOFF_QUOTATION.md.
Update 2026-10-17 (Codex consolidated review repairs; local, uncommitted; awaiting Codex's focused recheck):
- **Email state per link generation:** only a job for the quotation's current link generation marks it `emailed`, and resend ordering is compared within a generation. An older generation's acceptance stays recorded on its own job.
- **Migration `0007`** (additive): a partial index for cap-warning jobs, so retention never scans the email history. Retention deletes old cap warnings whose lease has expired (live leases are kept), also while sending is off.
- **Filled deployment configs live at the repository root** under exact names (`wrangler.owner.jsonc`, `wrangler.owner.preview.jsonc`, `wrangler.preview.jsonc`; `wrangler.jsonc` at the cutover), because Wrangler resolves paths from the config file's folder. Templates stay in `deploy/` and are not used in place.
Details: PROPOSAL_QUOTATION_WORKFLOW.md §18, "Codex consolidated review repairs".
Update 2026-10-17 (owner decision: free hosted academic release with MANUAL email; local, uncommitted, not deployed):
- **Release mode is manual email.** BuildTrack sends no email.
  - Approval creates the customer link and no email job.
  - The owner page prepares the invitation (mailto, copyable text, and the link rebuilt and hash-verified in the authenticated, no-store page) for Sunny to send from his own email account.
  - An optional "Mark as manually sent" is recorded as the owner's statement only.
  - No owner-notification emails: the dashboard is the request inbox.
  - No domain, Resend account or other integration. The Resend code is retained, tested and not released (`EMAIL_MODE=resend`).
- **Migration `0008`** (additive): the owner's "marked sent" record on `quotes`.
- **Retention bound:** lowered to 5 requests per run, to stay under the Workers Free limit of 50 D1 queries per invocation.
- **Workflow-off build preserved exactly:** a literal compile-time `QUOTATION_ON`, and `/contact/quotation/` injected only when enabled. `npm run check:published-build` compares the build with the published commit `8263494`.
- **Owner authentication on hosted environments:** a hostname-based Cloudflare Access application for the owner workers.dev hostname, because the owner Worker verifies the Access JWT header. Stop if Zero Trust asks for a payment method.
- **Still the owner's decisions:** the privacy wording, reconfirming retention and validity, and Turnstile (which stays off).

Update 2026-10-17 (owner decisions for publication):
- **Publication authorized:** free Cloudflare services only.
- **Release mode:** manual email only.
- **Retention and validity confirmed:** 90-day request retention; 14-day default quotation validity.
- **Turnstile:** OFF for this initial academic review version. Server validation and rate limits stay.
- **Privacy wording approved verbatim, including the seven-day backup clarification** (`quotationPrivacyNotice`, status `approved`, version `2026-10-17-manual`): "I understand my details will be stored by BuildTrack on Cloudflare and used to review my request and, if a quotation is approved, to email me a private link to it from BuildTrack's own email account. BuildTrack deletes its quotation records 90 days after the last activity; Cloudflare's automatic database backups may keep a copy for up to 7 more days, and emails already sent stay in the sender's and my mailboxes."
- **Owner-dashboard login:** Sunny's Gmail. It is kept in the git-ignored deployment configs and the Access policy, not in committed files.

Details: PROPOSAL_QUOTATION_WORKFLOW.md §18, "Manual email release mode"; runbook docs/QUOTATION_RUNBOOK.md.

**Update 2026-10-17 (owner instruction): public academic demo first.**
- **Immediate release target:** a public, browser-only academic demo of the whole flow (request → owner approval → customer acceptance → demo checkout) at `/academic-demo/`, `/academic-demo/owner/` and `/academic-demo/quote/`. It needs no Cloudflare Access.
- **Supersedes** the requirement to finish real owner authentication before publishing the presentation. Real quotation-workflow activation (Access for Sunny, D1, Workers, the cutover) remains separate and pending.
- **Isolation rules:** fictional sample identities only, no personal-data fields; demo state only in the visitor's browser; no D1, owner secrets, real link tokens, emails, Formspree or provider calls (enforced by a `connect-src 'none'; form-action 'none'` policy); real owner Workers stay disabled; test wrappers and mocked-authentication backends are never deployed.
- **Wording:** labelled "Academic demo"; approval and email delivery are described as demonstrated. The demo is never described as a live operational quotation service.

Details: PROPOSAL_QUOTATION_WORKFLOW.md §18, "Public academic demo".

## Deferred release/design decisions

Formspree spam settings; review of proposed font/tokens/layouts (ADR-020; logo supplied, ADR-027); hosting/domain/budget; final image assets/licenses. These do not reopen the settled product scope. They must not be presented as completed or silently fabricated.

Publication update 2026-10-13: the estimator core and form share validated bounds and six-decimal input precision (trailing zeros excluded); derived values remain exact. Changed or invalid inputs retain the last result with explicit visible status, also included in reopening announcements. Provider configuration stays null/null/false. CE validation, eligibility, banking support and both Formspree gates remain pending. No live payment feature is approved.
