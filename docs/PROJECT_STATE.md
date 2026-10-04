# BuildTrack Project State

Updated: 2026-10-04.

## Milestone
**Phase 8 independent review complete 2026-10-04**: its three findings are resolved (evidence below). Pending: deployment and production URL (Phase 9), production delivery verification, and human approval of draft privacy wording, confirmation copy and page copy. **Phase 7 QA and targeted fixes completed 2026-10-04** (evidence below); release still blocked by hosting/production URL, production delivery verification and manual approvals. Phases 0–4 complete; Phase 5 demo implemented, pending human review. **Phase 6 inquiry form implemented 2026-10-04**, with independent-review fixes applied the same day (recognised-success contract, timeout during body reading, configuration-independent browser harness, explicit standalone browser setup). Code is complete and verified with mocked provider responses only. **Formspree endpoint configured 2026-10-04** (`https://formspree.io/f/mljgrgjr`, supplied by the human; the recipient address stays in the Formspree account, not in the repository). The built Contact page now renders the form posting to that endpoint. **Local delivery verification: passed 2026-10-04** (labelled local test request received by the designated contact, as reported by the human). This meets the ROADMAP Phase 6 delivery gate. **Production delivery verification is pending** until deployment (Phase 9). The site is **not release-ready** (see open items and `npm run check:release`).

## Repository status
Local Git repository on `main` with `origin` = GitHub `OppiRah/BuildTrackProject`. First local checkpoint commit ("feat: build BuildTrack website and interactive demo") created 2026-10-04; **not pushed** (the remote is still empty). Local instruction files, tool settings, environment files and private editor state are git-ignored.

Implemented: Astro static site; complete content for Home, Solutions, How It Works, Pricing, About and Contact; Interactive Platform Demo (fictional data, six sections, project selection, filters, bounded simulated scans, reset); original graphics and social card; metadata.

Implemented in Phase 6: `InquiryForm` + `Field` components, `src/scripts/inquiry.ts`, pure `src/lib/inquiry-params.ts` / `inquiry-validate.ts` / `inquiry-submit.ts`; allowlisted editable preselection; approved fields with (required)/(optional) labels; draft privacy acknowledgment (visibly marked pending review); client validation with field errors, focused error summary and focus links; submitting, accepted and failure/retry states; single in-flight request; values kept on failure; textContent-only rendering; native POST fallback; uncertain outcomes (unrecognised 2xx body, timeout before headers or during the body) reported as unconfirmed with values kept and a duplicate-on-retry warning; `npm run test:browser` with fixture builds and a request guard. Formspree success contract re-read 2026-10-04 from the official `@formspree/core` source: 2xx, no `error`/`errors`, string `next` (ADR-024).

Public contact configured 2026-10-04 in `src/config/business.ts`: location "Lingayen, Pangasinan" (shown as "Based in Lingayen, Pangasinan"; city/province only, no street address or office claimed), phone shown as 09510519642 and linked as `tel:+639510519642`. Coverage remains Philippines. Rendered in the Contact aside, the footer on every page, and the form's failure/confirmation fallback lines.

Proposed academic pricing configured 2026-10-04 (ADR-025) in `src/config/pricing.ts`: Starter ₱2,990, Professional ₱7,990, Enterprise ₱19,990 per organization per month; per-organization limits; cumulative inclusions via `allPlanInclusions` + `buildsOn`; per-plan onboarding/support; limit definitions; five separately quoted exclusions; required disclosure on Home and Pricing. Rendered on Home (preview cards), Pricing (cards, grouped comparison table, limit definitions, exclusions) and the inquiry plan options/confirmation (e.g. "Professional (₱7,990 / month)"). No payments, accounts, activation, overage charges, annual discounts or plan highlight. Competitor benchmarks (Sortly, Fieldwire, EZOfficeInventory) recorded in ADR-025 and kept distinct from BuildTrack's own unvalidated proposal.

Not done: deployment and production delivery verification (Phase 9). The site is not yet published and not release-ready.

## Settled decisions
- Astro static output, native components, TypeScript, plain CSS; `astro` is the only runtime dependency; Node 24 LTS (ADR-014, ADR-021).
- Real request flow through Formspree; endpoint configured; local delivery verified 2026-10-04, production delivery pending (ADR-015, ADR-024).
- Demo: fixed fictional snapshot (28 Sep 2026, 8:00 AM PHT) of four sample Philippine projects; schedule variance only per project; build-time rendering with in-memory visibility state (ADR-019, ADR-023).
- Cloudflare Workers static assets preferred, unconfigured (ADR-016).
- Philippines coverage; seven BMC segments with equal standing; proposed academic PHP pricing set by ADR-025 (ADR-018, ADR-022, ADR-025).

## Verification status (Phase 8 review findings, 2026-10-04)
Resolved:
1. Configuration vs verification: About and How It Works inferred receipt ("a test request was received") from the endpoint and publication from `site.productionUrl`. Copy now comes from `src/lib/disclosures.ts` (ADR-026), which takes only whether the form is rendered; publication and receipt from the published site always stay "still to come" until a person verifies them and edits the copy. Neither page reads `productionUrl`. Local receipt (human-confirmed 2026-10-04) stays recorded here only; production publication and receipt are pending. This supersedes the Phase 7 disclosure wording below.
2. Pricing table semantics: category headers used `scope="colgroup"` without column groups. Each category is now its own `<tbody>` headed by `th scope="rowgroup"` (full width); feature cells are `th scope="row"`; plan headers `th scope="col"`; every data cell lists its plan, category and feature header ids in `headers`.
3. Error summary: `aria-labelledby` on a generic `div`. It is now `role="group"`, named by its heading (`aria-labelledby`) and described by its message (`aria-describedby`), still focused on failure; it has no live region and the polite status region is cleared when the response arrives, so there is one announcement.

| Check | Result |
|---|---|
| `npm run check` / `npm test` / `npm run build` | 0 errors/warnings/hints; 136 tests passed (adds `tests/disclosures.test.ts`: no verification/publication claim with or without a rendered form, publication and production receipt always pending, form listed as working only when rendered, no production-URL input); 8 pages built |
| `npm run test:browser` | 21/21 with Chrome for Testing headless shell 154.0.8037.92 (adds: disclosure copy in the configured build with endpoint and synthetic production URL and in the unconfigured build; pricing table header associations for every cell and Chromium roles columnheader/rowheader/rowheader/cell; error summary role `group`, name from heading, description from message, focus, empty live region, no nested live region) |
| Regression proof | Reintroducing a "test request was received" claim, `scope="colgroup"` and a role-less summary made 2 unit tests and 3 browser scenarios fail; files restored |
| axe-core 4.13.0 (real `dist/`, off-origin requests blocked, nothing submitted) | 0 violations on Home, How It Works, About, Pricing (1280 and 390 px), Contact and Contact with the validation summary. Table rules `th-has-data-cells`, `td-headers-attr`, `scope-attr-valid` now pass on Pricing (previously incomplete); `aria-prohibited-attr` passes with the summary shown (previously incomplete). Remaining incompletes are the gradient-background contrast items measured manually in Phase 7 |
| Layout | No horizontal overflow on How It Works, About, Pricing and Contact at 320/360/768/1280 px with 16/32 px text; comparison table rendering unchanged (screenshot reviewed) |
| `npm run check:release` | Exit 1 as expected: `site.productionUrl` unset + 4 manual gates |

Not verified: screen-reader output (no NVDA, JAWS, VoiceOver or TalkBack available here). Semantics were checked through Chromium's accessibility tree and axe only, not by listening to announcements.

## Verification status (Phase 7 QA, 2026-10-04)
Fixed in Phase 7:
- How It Works disclosure was stale (listed the request form and request delivery as "Planned"). It now reads from config: "Working" lists the editable form and that a test request was received before publication; "Still to come" lists publication (until `site.productionUrl` is set) and confirming that requests from the published site are received. About's publication line now also follows `site.productionUrl`, and its form line mentions the pre-publication test.
- Pricing cards: "Everything in Starter, plus:" could imply cumulative onboarding/support. Capabilities now read "All Starter capabilities, plus:" / "All Professional capabilities, plus:", and higher tiers state "Replaces <plan>'s onboarding and support; they are not added together." The comparison table already shows per-plan totals ("Two … sessions in total").
- Reflow at 320 px with 32 px text: `.button` gained `max-width: 100%`, centred text and `overflow-wrap: anywhere` (long "Avail Professional" label); CoverageNote text column gained `min-width: 0`; demo delivery-count chips may wrap (`.status` stays nowrap inside tables).

| Check | Result |
|---|---|
| `npm run check` / `npm test` / `npm run build` | 0 errors/warnings/hints; 130 tests passed; 8 pages built |
| `npm run test:browser` | 18/18 with Chrome for Testing headless shell 154.0.8037.92 and 18/18 with full Chromium 151 |
| `npm run check:release` | Exit 1 as expected: 1 unmet (`site.productionUrl`) + 4 manual gates |
| Static audit of `dist/` (scratch script) | All 8 routes: no broken internal links, anchors or assets; unique titles/descriptions; `lang="en"`; Open Graph title/description/type; exactly one H1; no heading-level skips; no duplicate ids; no images without alt. Canonical, `og:url`/`og:image` and sitemap absent by design until the production URL exists; `robots.txt` allows all |
| 404 (`astro preview`) | Unknown routes return status 404 with the custom "Page not found" page. Slash-less URLs (e.g. `/pricing`) return 404 in preview because of `trailingSlash: 'always'`; all internal links use trailing slashes; host redirect behaviour is a Phase 9 check |
| Pricing | Unit tests (prices, limits, `buildsOn`, duplicate-free cumulative inclusions, per-plan onboarding/support, plan labels, disclosure); rendered cards, comparison table and inquiry options/confirmation ("Professional (₱7,990 / month)") checked; table scroll region keyboard-scrollable |
| Demo (Phase 5 script re-run on current `dist/`) | Identical results to Phase 5 for section switching, project selection, filters, empty state and Clear filters focus, five-scan limit, reset and announcements; network: same-origin only (document, CSS, script, font, favicon), no fetch/XHR |
| Form (mocked, `test:browser`) | Preselection (allowlisted, inferred, invalid ignored), validation and focus, single in-flight request, accepted, 422, 500 + retry, network failure, 429, unconfirmed 2xx, timeouts before headers and during body, no-JS POST, unconfigured build. On the real `dist/` (all off-origin requests blocked, nothing submitted) preselection stays editable |
| axe-core 4.13.0 (injected; WCAG 2.0/2.1/2.2 A/AA + best practice) | 0 violations in 12 states: all 8 routes, Home at 390 px and with the mobile menu open, Contact with validation errors, Demo after interaction. "Incomplete" items reviewed: colour contrast on gradient backgrounds (measured manually: ≥ 10.65:1 against both gradient stops), `th-has-data-cells` on the grouped comparison table (group header rows; accepted), `aria-labelledby` on the error summary (label is visible; accepted) |
| Keyboard | Tab through every route: first stop is the skip link, which moves focus to `main`; every stop has a visible focus indicator (radio cards via their label) |
| Reduced motion | Transitions and the submit spinner drop to ~0 under `prefers-reduced-motion: reduce` |
| Reflow / enlarged text | No horizontal page overflow on any of 8 routes at 320/360/390/640/768/1024/1280/1440 px × 16/32 px default text × JS on/off (256 combinations) |
| Zoom (emulated) | 1280 px window at 200% (640 CSS px, DPR 2) and 400% (320 CSS px, DPR 4): no overflow; menu button shown |
| Text spacing (WCAG 1.4.12 overrides) | No overflow or clipped content on any route at 360 and 1280 px |
| Lighthouse 12.8.2 (simulated mobile, local server) | Home, Demo, Pricing, Contact: Accessibility 100, Best Practices 100, SEO 100; Performance 97–100 (Home 92 on a cold first run, 100 on two re-runs). Text-compression and cache-TTL findings come from the local test server and are host configuration (Phase 9). Demo DOM size flagged (accepted ADR-023 trade-off) |
| Asset sizes | Largest page: Demo ≈85 KB HTML + 20 KB JS + 7 KB CSS; Contact form script 13 KB; Inter font 98 KB (preloaded, latin subset); `og-image.png` 180 KB (fetched only by link-preview crawlers). Lighthouse total transfer 133–222 KiB uncompressed. No material problem; no change made |

Tools: headless Chromium over the DevTools protocol (temporary scripts kept outside the repository), axe-core and Lighthouse via `npm pack`/`npx` in a temporary folder (no project dependency). No real inquiry was sent; off-origin requests were blocked during QA.

Not verified (gaps): Firefox and WebKit/Safari (no builds available here; Chromium only), real Chrome/Edge desktop browsers, Android/iOS devices, screen readers (NVDA/TalkBack/VoiceOver), true browser zoom (emulated only), Windows high-contrast/forced-colours mode, host compression/caching/redirects, production delivery, human visual review.

## Verification status (Phase 6, 2026-10-04)
| Check | Result |
|---|---|
| `npm run check` | Pass: 0 errors, 0 warnings, 0 hints |
| `npm test` | Pass: 122 tests in 9 files (inquiry params, validation, response classification incl. `{}`, missing/numeric/null/object/array `next`, errors-before-`next`, non-2xx `next`, timeout before headers and during body reading, body failure without timeout; no-test-endpoint config guard) |
| `npm run build` | Pass: 8 pages; `dist/contact/` has no `<form>` and loads no inquiry script; no test endpoint anywhere in `dist/` or `src/`. An unreferenced inquiry script chunk is emitted to `dist/_astro/` (Astro bundles component scripts at build; left as is) |
| `npm run test:browser` | Pass: 18 scenarios, 4 consecutive runs stable, with standalone Chrome for Testing headless shell 154.0.8037.92 via `CHROME_PATH` (also passes with full Chromium 151). Fixture builds (configured with `https://form-test.invalid/f/browser-test`, and unconfigured) swapped in by a Vite resolve hook; every page request intercepted; form `action` asserted before each submission; request-guard self-test blocks an unexpected destination. Covers preselection, validation/focus, single in-flight request, posted fields, accepted confirmation (`next` not followed), 422/500+retry/network/429, unrecognised 2xx (`{}`, numeric `next`, `ok` only) as unconfirmed, timeout before headers and during a stalled body, no-JS native POST, unconfigured build (no form/submit/script, JS on and off) |
| Regression proof | Removing the body-read timeout branch fails the unit test and the stalled-body browser scenario; giving the real config a (synthetic) endpoint leaves all 18 browser scenarios passing; original files restored |
| `npm run check:release` | Fails as expected (exit 1): **1 unmet** value after the pricing update (`site.productionUrl`) + 4 manual gates |
| Pricing update (2026-10-04) | `npm run check` 0/0/0; `npm test` 130 passed (adds approved prices/limits, `buildsOn` chain, duplicate-free cumulative inclusions, per-plan onboarding/support, plan labels, disclosure text and no popularity/overage/discount wording; release-check rules for onboarding/support and positive whole-number limits); `npm run build` pass; `npm run test:browser` 18 passed. Layout (headless Chromium, real `dist/`, no outbound requests): no page overflow on Home, Pricing and Contact at 360/390/768/1024/1440 px with 16/32 px text, JS on and off; the comparison table scrolls inside its labelled, focusable region (role=region, caption, sticky row headers) at 360/390 px and with 32 px text up to 1024 px, and ArrowRight scrolls it with a visible focus ring; screenshots reviewed at 390 and 1440 px |
| Contact update (2026-10-04) | `npm run check` 0/0/0, `npm test` 122 passed, `npm run build` pass, `npm run test:browser` 18 passed; built pages show "Based in Lingayen, Pangasinan" and `<a href="tel:+639510519642">09510519642</a>` (Contact aside, footer, form fallback lines); "Contact details pending approval" no longer shown; no horizontal overflow on Home/Contact/About at 360 px with 16/32 px text |
| Endpoint configured (production `dist/`) | Contact renders `<form action="https://formspree.io/f/mljgrgjr" method="POST">` and loads the inquiry script; About shows the connected disclosure. In headless Chromium with every non-local request blocked and nothing submitted: `?type=demo`, `?type=quotation&service=equipment-tracking`, `?type=service&plan=professional`, `?plan=enterprise` (→ service), `?service=onboarding-training` (→ quotation) preselect correctly; `?type=bogus&plan=gold` selects nothing; all preselected controls changed freely, none disabled/read-only; zero outbound requests. `npm run check`, `npm test` (122), `npm run build`, `npm run test:browser` (18) pass after the change |
| Layout (scratch CDP script, test build; before review fixes, which changed no markup or CSS) | No horizontal overflow on Contact at 360/390/768/1024/1440 px with 16 px and 32 px text, JS on and off, and with the error state at 360 px/32 px; screenshots reviewed at 390, 1440, 360/32 px and no-JS |
| Keyboard | Tab order follows UX §5 (radios → selects → fields → privacy → submit; honeypot skipped), visible 3 px focus ring, arrow keys move within radio group, Enter in a field submits |
| Local delivery (ARCHITECTURE §6.6 stage 1) | **Pass, 2026-10-04**: labelled local test request received by the designated contact (human-reported; no addresses or submission contents recorded) |
| Production delivery (§6.6 stage 3) | **Pending**: requires deployment (Phase 9) |

Not verified for Phase 6: production delivery from the public URL, Formspree's no-JS thank-you page, origin restriction behaviour, screen-reader announcements, real browsers/devices, browser zoom.

## Verification status (Phase 5, 2026-10-04)
| Check | Result |
|---|---|
| `npm run check` | Pass: 0 errors, 0 warnings, 0 hints |
| `npm test` | Pass: 58 tests in 6 files (fixture invariants, metrics, filtering, simulation limit, reset, release rules, links, config) |
| `npm run build` | Pass: 8 pages; demo page ≈87 KB HTML, demo script ≈20 KB |
| `npm run check:release` | Fails as expected: 17 unmet owner/config values + 4 manual gates |
| Review fix: enlarged text | No horizontal overflow on any route at 360/390 px with 16 px and 32 px default text, with and without JavaScript; also every demo section at 360/390/768 with 32 px |
| Review fix: disclosures | How It Works and About no longer claim working Contact preselection or a public deployment |
| Demo interactions | Section switching (keyboard Enter), project selection (keyboard ArrowDown), per-section filters, empty state + Clear filters (focus returns to filter), five-scan limit (`aria-disabled`, figures unchanged), Reset, reload reset, one status announcement per action, visible focus |
| Demo data shown | All projects: 4 low-stock of 18 materials, 53% utilization (382 h ÷ 720 h), 2 in transit, 2 delayed, no variance tile; e.g. Sample Mid-Rise Residential: −4 pts variance |
| Network | Demo page loads only same-origin document, CSS, script and font; no fetch/XHR/WebSocket, no off-origin requests |
| Reduced motion | Transitions drop to ~0 under `prefers-reduced-motion: reduce` |
| No JavaScript | All six sections visible, controls hidden, explanatory note shown, simulated events hidden |
| Site-wide regression | Nav breakpoint (menu below 1200 px), mobile menu keyboard flow, short-viewport menu, no-JS skip link, links/allowlisted CTAs, one H1 per page, Contact has no form |

Method: headless Chromium (pre-existing Playwright build, not a project dependency) over the DevTools protocol, measuring rendered visibility. A first pass that read the `hidden` property missed that author `display` rules overrode `hidden`; this was found in screenshots, fixed with a global `[hidden]` rule, and re-verified by rendered state. Not verified: real Chrome/Edge/Firefox, Android device, screen readers, Lighthouse, browser zoom, human visual review.

## Open items and release blockers
| Item | Owner | Timing |
|---|---|---|
| Review rendering; approve or edit draft copy | Human/friend | Before release (manual gate) |
| Owner approval of draft plan positioning lines (part of the page-copy gate) | Human/friend | Before release |
| Review Formspree spam settings; consider Restrict to Domain once the production domain exists | Human | Before production |
| Approve or edit draft privacy wording (`privacyNotice` in `src/config/inquiry.ts`) | Human/friend | Before release |
| Hosting, domain, production URL (enables canonical, sitemap, `og:image`) | Human + Phase 9 | Before production |
| Delivery evidence: local integration **passed 2026-10-04**; production receipt from the public URL still required (date + pass/fail only) | Human + Phase 9 | Release gate |

## Next action
Human review of rendering and approval or edits of the draft privacy wording, confirmation copy and page copy (including plan positioning) — none is approved yet. Optional before release: a check on a real phone and in Firefox/Safari, and a screen-reader pass. Phase 8 findings are resolved; next is Phase 9 hosting (production URL, host compression/caching/trailing-slash redirects), a labelled production test request received by the contact, and then updating the "still to come" disclosure items in `src/lib/disclosures.ts` once production is verified.
