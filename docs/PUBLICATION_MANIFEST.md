# Academic review-version publication manifest — 2026-10-13

Owner explicitly authorized publication, including the simulated payment page and estimator with CE validation pending. Branch: home-drawn-capabilities; comparison: cc93f70. This records the exact intended source commit; actual commit and live verification follow in a separate docs-only commit. No agent attribution is added; configured Git identity and existing conventions apply.

## Exact source commit (54 paths)

- `docs/ARCHITECTURE.md`
- `docs/DECISIONS.md`
- `docs/PRESENTATION_HANDOFF.md`
- `docs/PROJECT_STATE.md`
- `docs/PROPOSALS_ENGINEERING_PAYMENT.md`
- `docs/PUBLICATION_MANIFEST.md`
- `docs/REQUIREMENTS.md`
- `docs/UX_BRAND.md`
- `public/media/demo/demo-deliveries.webp`
- `public/media/demo/demo-equipment.webp`
- `public/media/demo/demo-inventory.webp`
- `public/media/demo/demo-laptop.webp`
- `public/media/demo/demo-overview.webp`
- `public/media/demo/demo-phone.webp`
- `src/components/demo/DemoDashboard.astro`
- `src/components/demo/EstimatePanel.astro`
- `src/components/demo/Panel.astro`
- `src/components/payment/PaymentDemo.astro`
- `src/components/site/CtaBand.astro`
- `src/components/site/Footer.astro`
- `src/components/site/Header.astro`
- `src/components/site/Section.astro`
- `src/config/payment-sandbox.ts`
- `src/config/site.ts`
- `src/data/demo/labels.ts`
- `src/lib/concrete-estimate.ts`
- `src/lib/demo-state.ts`
- `src/lib/disclosures.ts`
- `src/lib/payment-sandbox.ts`
- `src/lib/payment-walkthrough.ts`
- `src/pages/404.astro`
- `src/pages/about.astro`
- `src/pages/contact.astro`
- `src/pages/how-it-works.astro`
- `src/pages/index.astro`
- `src/pages/payment-demo.astro`
- `src/pages/pricing.astro`
- `src/pages/product-demo.astro`
- `src/pages/solutions.astro`
- `src/scripts/audience-sequence.ts`
- `src/scripts/capability-stage.ts`
- `src/scripts/demo-tools.ts`
- `src/scripts/demo.ts`
- `src/scripts/nav.ts`
- `src/scripts/payment-demo.ts`
- `src/scripts/scrolly.ts`
- `src/scripts/stable-position.ts`
- `src/styles/demo.css`
- `src/styles/tokens.css`
- `tests/browser/home-demo-ui.ts`
- `tests/concrete-estimate.test.ts`
- `tests/config.test.ts`
- `tests/disclosures.test.ts`
- `tests/payment-walkthrough.test.ts`

src/scripts/scrolly.ts is the sole deletion; capability-stage.ts replaces it. BaseLayout has no normalized content change and is excluded.

## Exclusions and audit

The untracked personal file docs/anotherpromptthatistoolongforclaudecodetoread.md must remain uncommitted. Excluded: design/references/ probes and evidence; dist/, .astro/, dependencies, environment files, browser profiles, downloaded source media, local agent instructions and generated output. Existing media provenance is in design/media-source/ and design/home-visual-samples/; the six changed demo WebP assets are local captures of this website's fictional demo, not stock client evidence or AI-generated artwork. Runtime references to removed scrolly.ts must be absent.

## Readiness and pending gates

The estimator and form enforce the same six-decimal input contract, ignoring insignificant trailing zeros. No input rounding; derived values are exact. Result cards label rounding, and the breakdown preserves exact operands. Changed or invalid inputs retain clearly labelled prior results until recalculation, example restore, Reset or reload.

An independent probe found a medium reading-position defect at the audience/Pricing boundary: with Pricing about 80 px below the viewport top, a live reduced-motion switch moved Pricing to about 923 px and returned the visitor to the audience heading. The audience transition now uses the shared midpoint rule to determine whether its section is being read; a trailing strip no longer overrides following content. A focused regression covers both preference directions.

The published payment flow is a local simulation, never a verified payment record. Provider sandbox remains provider null, testLinkUrl null, verifiedTestMode false. No real inquiry, provider request, account, transaction or dependency installation is authorized. CE validation, provider eligibility, banking support, Formspree recipient verification and production-request receipt remain pending. Automated release checks are distinct from those two manual gates.

Performance evidence uses headless rAF timestamp intervals separately from traced work duration, startup tasks, scrolling and first-render delay. It is not physical-device performance or proof of missed frames. The longer pinned section is a pacing/design tradeoff. Physical browsers/devices and screen-reader announcement behavior remain unverified.

## Validation

Final local validation (Node 24.11.1; headless Chromium 151):

- `npm run check`: 0 errors, 0 warnings; two pre-existing unused-variable hints in ignored evidence scripts.
- `npm test`: 209 tests across 13 files passed.
- `npm run build`: 9 pages (8 public routes plus 404), sitemap generated.
- `npm run test:browser`: 21 mocked inquiry scenarios and 55 UI scenarios passed, including the new audience/Pricing boundary regression and estimator retained-result coverage. No real submissions.
- `npm run check:release`: automated requirements met; both manual Formspree gates remain pending.
- Independent read-only Chromium probe: 120 checks passed across routes, metadata, assets, navigation precedence, Pricing reading position, laptop fit, rendered scroll-stop/reversal/holds, Tab/scroll/Enter activation, precision boundaries, retained results, payment outcomes and enlarged no-JS fallbacks. No off-origin requests or runtime errors.
- Exact manifest, credential patterns, deployed-output exclusions, removed runtime references, disconnected sandbox configuration and `git diff --check` audits passed. Existing provenance records inspected; changed screenshots are local fictional-demo captures.

Unavailable: Safari/Firefox, physical devices, screen-reader speech, true browser zoom, CE review and provider-account evidence. Longer pinning is a design tradeoff. The technical checks support the owner-authorized academic review publication; they do not close external validation gates.
