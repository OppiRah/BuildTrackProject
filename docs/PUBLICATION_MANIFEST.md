# Publication manifests

## Seven-step simulated payment walkthrough — 2026-10-13

On 2026-10-13 the owner explicitly approved the seven-step simulated payment walkthrough (ADR-042) for publication. Base: published source `4ac95aec376a5a6dca6aa066f2439cef0937a2d0` with its docs-only follow-up `dd59c82dc229e4e10c85d6f22964f6f3ad7f919e` (origin/main). Committed with the owner's configured Git identity and existing conventions (no agent attribution), merged into main without rewriting history, and pushed to origin/main, which authorizes Cloudflare's automatic deployment. Payments and emails stay simulated, provider integration stays deferred, and CE review and both Formspree gates remain pending.

### Exact source commit (17 paths)

- `docs/ARCHITECTURE.md`
- `docs/DECISIONS.md`
- `docs/PRESENTATION_HANDOFF.md`
- `docs/PROJECT_STATE.md`
- `docs/PROPOSALS_ENGINEERING_PAYMENT.md`
- `docs/PUBLICATION_MANIFEST.md`
- `docs/UX_BRAND.md`
- `src/components/payment/PaymentDemo.astro`
- `src/config/payment-sandbox.ts` (deleted)
- `src/config/site.ts`
- `src/lib/disclosures.ts`
- `src/lib/payment-sandbox.ts` (deleted)
- `src/lib/payment-walkthrough.ts`
- `src/pages/payment-demo.astro`
- `src/scripts/payment-demo.ts`
- `tests/browser/home-demo-ui.ts`
- `tests/payment-walkthrough.test.ts`

### Exclusions

- `docs/anotherpromptthatistoolongforclaudecodetoread.md`: personal prompt, untracked, must stay uncommitted.
- `src/layouts/BaseLayout.astro`: line-ending-only working-copy status, with no content change when line endings are ignored.
- Ignored and temporary artifacts: `design/references/` (including the `payment-journey/shots/` screenshots), `dist/`, `.astro/`, `node_modules/`, `.wrangler/`, `.claude/`, environment files and scratch builds.

### Validation before commit

The results are recorded in PROJECT_STATE.md. In summary: type check, 180 unit tests, build, 21 inquiry scenarios (mocked) and 55 standard UI scenarios (57 with optional evidence capture), release check and `git diff --check`. No real inquiry, email, payment, provider request, account or dependency installation.

### Live verification and docs-only follow-up

2026-10-13: source commit `8263494165b4f568c7a1734c59e56a99f708bf00` fast-forwarded into main and pushed to origin/main; Cloudflare deployed it automatically. 117 read-only live checks passed (details in PROJECT_STATE.md), with only same-site GET requests allowed. The single blocked request was the probe's deliberate inquiry submission, failed in the browser before sending. Live payment-page, About, How It Works and Pricing HTML match the tested build by SHA-256. This follow-up changes only `docs/PROJECT_STATE.md` and `docs/PUBLICATION_MANIFEST.md`. The source manifest above is unchanged.

---

## Historical manifest (preserved as evidence; describes source 4ac95ae)

# Academic review-version publication manifest — 2026-10-13

Owner explicitly authorized publication, including the simulated payment page and estimator with CE validation pending. Source commit: `4ac95aec376a5a6dca6aa066f2439cef0937a2d0`, created on home-drawn-capabilities against cc93f70, fast-forwarded into main and pushed to origin/main on 2026-10-13. Cloudflare's automatic deployment is verified at https://buildtrack.sunnydelacruz.workers.dev/ . This records the exact source commit; the publication/live record is a separate docs-only follow-up. No agent attribution was added; configured Git identity and existing conventions were used.

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

## Live verification and docs-only follow-up

2026-10-13: 129 read-only Chromium checks passed on the public version. Verified all eight routes, unknown-route 404, metadata, current navigation/hover/focus precedence, Pricing link, three laptop capability layouts, rendered holds/reversal/scroll-stop stability, keyboard scrolling and activation, stale-focus/Pricing preference transitions, non-sticky Product Demo header, estimator input precision and retained-result behavior, disconnected payment simulation and every simulated outcome, and enlarged no-JS fallbacks. Browser requests were limited to same-site GET; no inquiries or provider requests were sent. A fixed probe timeout was replaced with waiting for actual frame/transition completion before the completed passing run.

Both published Home/demo scripts, all six updated screenshots, social image and font match the tested build by SHA-256. Robots, both sitemaps and the payment-page trailing-slash redirect pass. Evidence is ignored and excluded. This follow-up changes only `docs/PROJECT_STATE.md` and `docs/PUBLICATION_MANIFEST.md`; the source manifest above is unchanged. The personal prompt and pre-existing BaseLayout line-ending-only status remain outside both commits. CE, provider/banking and both Formspree gates remain pending.
