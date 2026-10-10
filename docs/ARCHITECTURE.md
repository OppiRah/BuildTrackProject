# BuildTrack Architecture

Status: Phase 1 specification, 2026-10-04, revised after independent review the same day. Phases 3–5 implement sections 2, 3, 5, 8, 9 and 10; Phase 6 implements the inquiry form (§6); the Formspree endpoint is configured and local delivery was verified on 2026-10-04 (production delivery pending); hosting (§7) remains unimplemented.

## 1. Stack
| Concern | Choice | Notes |
|---|---|---|
| Site generator | Astro, `output: 'static'` | Installed: astro 7.3.5 (requires Node `>=22.12.0`); project runs on Node 24 LTS. Exact versions pinned in `package.json` and the lockfile. |
| Components/layouts | Native `.astro` components | No React/Vue/Svelte/Solid/Preact islands. |
| Language | TypeScript, `strict` | Typed config, demo fixtures, browser scripts and pure logic. |
| Styling | Plain CSS: one global token file + Astro scoped `<style>` | No Tailwind, Bootstrap, CSS-in-JS or component kits. |
| Client behavior | Small focused modules in `src/scripts/`, loaded by Astro `<script>` tags | Plain DOM APIs; no state-management, animation or chart libraries. |
| Charts | Accessible HTML/CSS bars and simple inline SVG | Each chart paired with a text/table equivalent. |
| Inquiries | External form provider (Formspree preferred, unconfigured) | Section 6. |
| Hosting | Static files on Cloudflare Workers static assets (preferred, unconfigured) | Section 7. No Astro adapter, no SSR. |

**Runtime dependencies:** `astro` only. It is a build-time framework; shipped pages contain only the small scripts written here. Any further runtime dependency requires a written requirement, alternatives considered and tradeoff, recorded in `DECISIONS.md` before installation.

**Explicitly excluded:** UI frameworks, Next.js, SSR/hybrid rendering, hosting adapters, custom backend/API, database, authentication, admin/CMS, payments, WebSockets/polling, real QR/RFID/IoT integration, telemetry, homegrown component frameworks or generic abstraction layers.

## 2. Directory structure
```text
astro.config.ts         # site URL, static output; no adapter; sitemap only once site URL is set
tsconfig.json           # extends astro/tsconfigs/strict
package.json            # scripts in section 8; "engines" for Node
.nvmrc                  # Node LTS major used for dev/CI/host
public/
  favicon.svg
  buildtrack-mark.webp  # 150×144 logo emblem cropped from design/BuildTrackLogo.jpeg (owner-supplied original)
  media/                # ui-redesign prototype: stock hero clip/stills (Pexels) and demo/ screenshots; see UX_BRAND §9.1
  og-image.png          # 1200×630 social card rendered from design/og-image.svg
  fonts/                # InterVariable-latin.woff2 + OFL.txt (licence)
src/
  assets/               # source images processed by astro:assets
  config/
    site.ts             # brand name, tagline, production URL, nav, page metadata
    business.ts         # contact identity, coverage, customer segments
    services.ts         # service catalogue (ids, names, summaries)
    pricing.ts          # Starter/Professional/Enterprise packages
    inquiry.ts          # request types, form provider settings, field limits
  data/demo/
    types.ts            # demo entity types
    fixtures.ts         # DEMO_AS_OF, projects, materials, equipment, deliveries, events,
                        # simulatedEventPool, devices (one file keeps cross-references visible)
    labels.ts           # display labels and status tones
  lib/
    demo-metrics.ts     # pure derived metrics, alerts and number/date formatting
    demo-state.ts       # pure demo state, actions and visibility predicates
    inquiry-params.ts   # pure URL-preselection parsing against allowlists
    inquiry-validate.ts # pure field validation
    inquiry-submit.ts   # pure response classification + submit state transitions
    release-check.ts    # pure: lists unmet release requirements for a given config
    contact-links.ts    # typed Contact URLs with allowlisted type/service/plan (all CTAs use it)
  layouts/
    BaseLayout.astro    # <html>, <head> metadata, skip link, header, footer
  components/
    site/               # Header (incl. mobile nav), Footer, Wordmark, PageHeader, Section, CtaBand,
                        # Icon (+ icons.ts) (ProcessSteps/SegmentGrid/PlanCard/CoverageNote removed 2026-10-11)
    demo/               # DemoDashboard (shell, nav, toolbar), Panel, Overview/Inventory/
                        # Equipment/Deliveries/Events/DevicesPanel, StatusBadge, EmptyState
    form/               # InquiryForm (form, error summary, status, confirmation), Field
  scripts/
    nav.ts              # mobile menu; keeps focus on an equivalent visible header control when text-size changes switch desktop links and the Menu button (the rem query fires no change event, so a ResizeObserver detects the switch)
    demo.ts             # in-memory state; shows/hides build-time markup; opens #demo-panel-<section> entry points
    inquiry.ts          # preselection, validation display, submission
    reveal.ts           # Home hero entrance completion and one-time section reveals (Home, Solutions, How It Works, Pricing, About); follows reduced-motion changes
    scrolly.ts          # Home prototype: desktop pinned capability section driven by native vertical scrolling; re-measured on live text-size changes
    audience-sequence.ts # Full-frame native sticky sequence; titles/hold/release and live static fallbacks
    audience-videos.ts   # Optional local stock playback; shared pause, eligibility and decoder/poster fallback
    device-entrance.ts   # One-time coordinated full-frame laptop/phone entrance, live cancellation
    stable-position.ts  # Home prototype: keeps the visible content in place when a section switches layout
    demo-layout.ts      # Demo: mobile sidebar drawer and sticky-when-fits sidebar
    hero-video.ts       # Home prototype: optional background video and its pause/play control
  styles/
    tokens.css          # all design tokens (UX_BRAND §Tokens)
    global.css          # reset, base typography, utilities used across pages
  pages/
    index.astro  solutions.astro  how-it-works.astro  product-demo.astro
    pricing.astro  about.astro  contact.astro  404.astro
    robots.txt.ts       # adds the Sitemap line once the site URL is set
scripts/
  check-release.ts      # runs release-check against the real config; prints report
tests/                  # Vitest unit tests for src/lib and fixture integrity
```
Component list is the expected set, not a quota; merge components that end up trivial. No barrel files, generic "UI system" layer, registry or plugin mechanism.

## 3. Routes
| Route | Page | Primary CTA destination |
|---|---|---|
| `/` | Home | `/contact/?type=demo` |
| `/solutions/` | Solutions | `/contact/?type=quotation&service=<id>` |
| `/how-it-works/` | How It Works | `/product-demo/` |
| `/product-demo/` | Product Demo | `/contact/?type=demo` |
| `/pricing/` | Pricing | `/contact/?type=service&plan=<id>` |
| `/about/` | About | `/contact/` |
| `/contact/` | Contact | form submit |
| `/404` | Not found | `/` and main nav |

Trailing-slash directory URLs (Astro `build.format: 'directory'`, `trailingSlash: 'always'`) so canonicals, sitemap and host behaviour agree. Header nav lists all seven pages; "Request a Demo" button is the persistent header CTA.

### 3.1 Shared layout implementation requirements
- **Header fit check:** the desktop header (wordmark + seven links + CTA on one line) is used only from a breakpoint at which it fits without wrapping, truncation or overlap at 100% zoom, with Inter and with the fallback font. Phase 3 measures the natural width; the switch breakpoint is the smallest of 64rem/75rem that passes and is recorded in `UX_BRAND.md` §3.1.
- **Mobile menu:** the open panel is limited to the viewport below the header (`max-height: calc(100dvh - header height)`, `100vh` fallback) and scrolls internally (`overflow-y: auto; overscroll-behavior: contain`), so every link and the CTA remain reachable on short viewports (checked at 360×560 and 640×360 landscape). No scroll lock or focus trap.
- **Progressive enhancement:** without JavaScript, nav links render as a visible wrapped list; the Menu button is hidden until `nav.ts` runs.

## 4. Boundaries
- **Marketing pages** read only from `src/config/*` (plus `contact-links.ts` for CTA URLs). They render to static HTML and need no JavaScript except `nav.ts` (the Home prototype adds `reveal.ts`, `hero-video.ts`, `scrolly.ts`, `audience-sequence.ts`, `audience-videos.ts`, `device-entrance.ts` and `stable-position.ts`, all optional enhancements; Solutions, How It Works, Pricing and About add only `reveal.ts` for one-time fade-ins; the demo adds `demo-layout.ts`; Contact and 404 add nothing beyond `nav.ts` and, on Contact, the inquiry script). `BaseLayout` takes `stickyHeader={false}` for the application-style demo page.
- **Demo** reads only `src/data/demo/*`, `src/lib/demo-metrics.ts` and `src/lib/demo-state.ts`. It never imports pricing/contact config and makes no network requests. Only `/product-demo/` loads `demo.ts`. Home's "demo preview" is a static, build-time render from the same fixtures (no script).
- **Inquiry** reads `src/config/inquiry.ts`, `services.ts` and `pricing.ts` (for allowlists and labels). Only `/contact/` loads `inquiry.ts`. The only network call in the whole site is the form POST to the provider.
- **Pure logic** in `src/lib/` has no DOM access, so it is unit-testable; scripts in `src/scripts/` wire it to the DOM.

## 5. Centralized configuration
All values the owner may edit live in `src/config/`. Unknown values are `null`, never placeholders that look real. Pages show a visible "Pending approval" marker where a `null` value would appear.

**Release requirements** (checked by `npm run check:release`, never by `npm test`):
| Requirement | Rule |
|---|---|
| `site.productionUrl` | non-null absolute `https://` URL |
| `contact.location`, `contact.phone` | non-null, non-blank |
| `formProvider.endpoint` | non-null `https://` URL |
| each plan `amountPhp` | non-null number > 0 (Enterprise included) |
| each plan `billingPeriod` | non-null |
| each plan `includes` | non-null array with at least one approved item (the plan's additions; see `buildsOn`) |
| each plan `onboarding`, `support` | non-null, non-blank |
| each plan `limits` | non-null; `activeProjects`, `namedUsers`, `materialRecords`, `equipmentRecords` all positive whole numbers |
| `exclusions` | non-null array (owner-approved, may be empty) |

**Optional, never blocks release:** `contact.publicEmail`.

**Manual release gates** (printed by the check as reminders; not verifiable from the repository): verified notification recipient configured in the provider account; production test request received by the designated contact. Former gates closed by recorded human decisions (privacy and confirmation wording, public page copy, final redesign and audience media; all 2026-10-11) are printed separately as `recordedApprovals`. Recipient addresses and test evidence (screenshots, inbox contents) stay out of the repository; `PROJECT_STATE.md` records only date and pass/fail.

```ts
// src/config/business.ts (shape)
export const contact = {
  location: null as string | null,      // friend supplies (city/province level is enough)
  phone: null as string | null,         // friend supplies; display text as approved (e.g. "09xx xxx xxxx")
  phoneHref: null as string | null,     // tel: link in international format (e.g. "tel:+639xxxxxxxxx"); set with phone
  publicEmail: null as string | null,   // optional public address; not the same as form recipient
};
export const coverage = {
  current: 'Philippines',
  futureVision: 'Southeast Asia (future vision, not current coverage)',
};
export const customerSegments = [ /* id + label + one-line need, all seven BMC segments, no ordering by priority */ ];
```
```ts
// src/config/pricing.ts (shape)
type PlanId = 'starter' | 'professional' | 'enterprise';
interface Plan {
  id: PlanId; name: string; tier: 'basic' | 'advanced' | 'custom';
  positioning: string;
  amountPhp: number | null;          // monthly PHP per organization (ADR-025)
  billingPeriod: 'month' | 'year' | null;
  buildsOn: PlanId | null;           // explicit inheritance: Professional -> Starter, Enterprise -> Professional
  includes: string[] | null;         // only this plan's additions; planInclusions(plan) resolves the full list
  onboarding: string | null; support: string | null; // per plan, replace (not add to) the base plan's
  limits: { activeProjects: number; namedUsers: number; materialRecords: number; equipmentRecords: number } | null;
}
export const allPlanInclusions: string[];   // capabilities in every plan
export const pricingNote: string;           // required disclosure (ADR-025)
export const limitDefinitions: string[];    // material record / equipment record / per-organization scope
export const exclusions: string[] | null;   // separately quoted items
// site.ts: productionUrl: string | null = null
```
Formatting: `new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 })`.

```ts
// src/config/services.ts: id (kebab-case, URL allowlist) + name + summary
// Proposed catalogue derived from the BMC revenue streams/activities:
// materials-inventory, equipment-tracking, delivery-monitoring, project-dashboards,
// hardware-deployment, onboarding-training, custom-integration, maintenance-support
```
```ts
// src/config/inquiry.ts (shape)
export const requestTypes = [
  { id: 'demo', label: 'Request a Demo' },
  { id: 'quotation', label: 'Request a Quotation' },
  { id: 'service', label: 'Avail a Service' },
] as const;
export const formProvider = {
  name: 'Formspree',
  endpoint: null as string | null,   // public form endpoint URL; not a secret; no API keys here
  timeoutMs: 15000,
};
```
The form endpoint is public by design and lives in config, not an environment variable. No private credentials exist in this project. If a future provider needs one, it may not be used client-side.

## 6. Inquiry flow
### 6.1 Preselection
Contact accepts `?type=`, `?service=` and `?plan=` (applied by `inquiry.ts` in the browser, so preselection needs JavaScript; without it every control starts empty). `inquiry-params.ts` parses `URLSearchParams` and accepts a value only if it exactly matches an id in `requestTypes`, `services` or plans; anything else is discarded silently (no error, no echo). Accepted values only set the `checked`/`selected` state of existing controls; query values are never inserted into the DOM as text. Default type with no valid parameter: none selected (user must choose). A plan preselection with no type implies `service`; a service preselection with no type implies `quotation`. All controls remain editable.

### 6.2 Fields
| Field | Name | Control | Rule |
|---|---|---|---|
| Request type | `request_type` | radio group | required; allowlist |
| Service of interest | `service` | select (catalogue + "Not sure yet") | optional; allowlist |
| Plan of interest | `plan` | select (3 plans + "Not sure yet") | optional; allowlist |
| Full name | `name` | text, `autocomplete="name"` | required; 2–100 chars after trim |
| Work email | `email` | email, `autocomplete="email"` | required; ≤254; browser email syntax |
| Organization | `organization` | text, `autocomplete="organization"` | required; ≤150 |
| Phone | `phone` | tel, `autocomplete="tel"` | optional; ≤20; digits, spaces, `+ - ( )` |
| Organization type | `organization_type` | select: seven BMC segments + "Other" | required |
| Project need | `project_need` | text | required; 5–200 chars |
| Message | `message` | textarea | optional; ≤2000 |
| Privacy acknowledgment | `privacy_ack` | checkbox | required |
| Honeypot | `_gotcha` | hidden (`display: none`), `tabindex="-1"`, `aria-hidden` | must be empty; Formspree silently ignores submissions that fill it |

A hidden `subject` (Formspree's current special field for the notification Subject header; `_subject` is no longer listed in its docs) defaults to "BuildTrack: Website request" for no-JS posts and is set at submit time from allowlisted labels, e.g. "BuildTrack: Request a Quotation (Professional plan)". The `email` field doubles as Formspree's Reply-To. Field names, honeypot and response format confirmed against help.formspree.io and the official `@formspree/core` source on 2026-10-04 (ADR-024).

### 6.3 Validation
Native constraint attributes (`required`, `maxlength`, `type`) remain in the HTML. `inquiry-validate.ts` repeats the rules so messages are consistent and testable. Validation runs on submit and on blur of a field already shown as invalid; it never blocks typing. Client validation is usability only; the provider's validation and spam controls decide acceptance.

### 6.4 Submission states
```
idle --submit(valid)--> submitting --2xx + ok body--> accepted
                          |--4xx with field errors--> failed(validation)
                          |--other 4xx/5xx--------> failed(provider)
                          |--network error/timeout-> failed(network)
failed(*) --edit/retry--> submitting
```
- `submitting`: button disabled and relabelled "Sending request…", `aria-busy` on form, further submits ignored (single in-flight request).
- Request: `fetch(endpoint, { method: 'POST', body: FormData, headers: { Accept: 'application/json' }, signal })` with an `AbortController` timeout of `timeoutMs`.
- `accepted` only for Formspree's recognised success shape, as checked by the official `@formspree/core` client (re-read 2026-10-04): a 2xx JSON object with **no** `error`/`errors` key and a **string** `next`. Provider errors are checked first, on any status. The `next` URL is never followed. A 2xx with any other body (`{}`, missing/non-string `next`, non-JSON, unreadable) is `unconfirmed`: the visitor is told the outcome is uncertain, that their details are kept and that retrying may send it twice; it is never shown as success or as definite non-delivery. 429 is the provider rate limit ("wait a minute and try again"). The `timeoutMs` limit covers both waiting for headers and reading the body; an abort at either point is `timeout`, with the same uncertainty wording. The form is replaced by a confirmation panel that receives focus (copy in UX_BRAND). The panel says the form service **accepted** the request; it must not claim the contact has received or read it. It restates the selected type/plan/service from the allowlisted labels (not user free text), explains that follow-up is by email/phone, and offers configured direct contact details in case no reply arrives. It must not mention payment, activation, booking or a guaranteed response time.
- `failed`: all entered values retained; an error summary at the top of the form receives focus (a `role="group"` named by its heading via `aria-labelledby` and described by its message via `aria-describedby`; it contains no live region, and the polite status region is cleared when the response arrives, so focus produces the only announcement); field-level provider errors map to fields where the field name is recognised; otherwise a generic message plus the retry button. Network failures suggest checking the connection and retrying; if contact details are configured they are offered as an alternative.
- No-JS fallback: the form has `action={endpoint} method="POST"`, so a native submission still reaches the provider and the provider's own confirmation page appears.
- If `endpoint` is `null`, Contact renders **no `<form>` element and no submit control at build time**, only an explanatory notice ("The request form is not yet connected…") plus any configured contact details. This holds with or without JavaScript, and `inquiry.ts` is not loaded. It never fakes success.

### 6.4.1 Configuration is not verification
An endpoint only means the form is rendered; a production URL only means the site is configured for one. Neither is evidence that requests are delivered or that the site is deployed. Public "what is real" copy comes from `src/lib/disclosures.ts`, which takes only whether the form is rendered and always lists publication and receipt of requests from the published site as still to come. A person updates that copy only after verification is recorded in `PROJECT_STATE.md` (Phase 9); local receipt was human-confirmed on 2026-10-04 and is recorded there, not on public pages.

### 6.5 Safe rendering
User-entered text is never written back into the page except as `<input>`/`<textarea>` values. Provider error messages are inserted with `textContent`. No `innerHTML` with any external or user-controlled value anywhere in the site.

### 6.6 Delivery evidence
Provider acceptance (2xx) proves only that the provider received the request. Formspree also keeps accepting submissions after the monthly limit but stores them in an Over Limit folder without sending notifications (help.formspree.io, read 2026-10-04), and "Restrict to Domain" sends submissions from other domains to spam; both are further reasons a 2xx is not delivery evidence. Recipient delivery is a separate check confirmed by the designated contact in their inbox (including spam folder). Testing happens in distinct stages, each recorded (date + pass/fail only) in `PROJECT_STATE.md`:
1. **Local integration (Phase 6):** `npm run dev`/`preview` on the developer machine submitting labelled synthetic data to the real configured endpoint, once the human authorizes provider setup and test submissions. Verifies the state machine and provider acceptance; the contact confirms receipt. If the provider restricts allowed origins, any localhost allowance is noted and removed if required for production.
2. **Hosted preview (only if needed, explicitly authorized):** a preview deployment to verify behaviour that differs on a real HTTPS origin (origin restrictions, redirects, headers). Requires separate authorization; nothing is deployed implicitly.
3. **Production (Phase 9):** repeat the synthetic submission from the public production URL and obtain the contact's receipt confirmation. This is the release gate; earlier stages do not substitute for it.

### 6.7 Form provider evaluation
| Provider | Free tier (as published) | Fit | Status |
|---|---|---|---|
| **Formspree (preferred)** | 50 submissions/month, unlimited forms, basic spam filtering, 30-day submission archive, AJAX on all plans (formspree.io/plans; help.formspree.io AJAX article, read 2026-10-04) | Mature, well documented, dashboard + recipient email verification, JSON responses with `Accept: application/json`, native-POST fallback | Endpoint configured 2026-10-04 (`https://formspree.io/f/mljgrgjr`); recipient address held only in the Formspree account; local delivery verified 2026-10-04 (stage 1); production delivery pending (stage 3) |
| Web3Forms (alternative) | Reported 250/month, hCaptcha, 30-day history; public access key | Higher quota; official pages could not be fetched from this environment, so details are unverified | Fallback if Formspree's quota or terms fail |
| Host-integrated forms (e.g. Netlify Forms) | Varies | Couples form delivery to one host | Not preferred |

Reasoning: an academic site needs tens of requests, not hundreds, so 50/month is adequate. Formspree's documentation is verifiable, it supports a working no-JS POST, and its JSON responses fit the state machine above. Before Phase 6, re-read current Formspree docs/terms for: free-plan limits, recipient verification, honeypot/spam options, response format, data retention and privacy text, and whether the free tier permits this use.

Local audience playback review (ADR-034, 2026-10-08): `audience-sequence.ts` passes measured layout eligibility to `audience-videos.ts`. Near-stage and visible-stage observers, document visibility, reduced motion and Save-Data gate loading/playback. No HTML video src is present in the static baseline; mobile/no-JS/preference/text/short-viewport fallbacks retain the seven semantic poster/title figures. The shared native button persists through layout switches; explicit Pause is an in-memory visitor choice, never overridden by scrolling or preference restoration. Synchronous preference cancellation, per-clip generation tickets, presented-frame reveal, refused-autoplay retry and independent poster errors protect pending playback. Seven exact-aspect H.264 derivatives are 2,339,673 bytes total; original source renditions and review captures stay ignored outside public/dist. No added runtime dependency/backend. Local review authorization is not final media or production approval.

## 7. Hosting and deployment
Cloudflare Workers static assets (ADR-016). Configuration prepared 2026-10-04 from current Cloudflare docs (Astro framework guide "If you have a static site", Static Site Generation and custom 404 pages, HTML handling, Headers, Workers Builds configuration and build image, Billing and limitations, workers.dev, Custom Domains, Compression). **Deployed 2026-10-04** by Workers Builds from `main` at `https://buildtrack.sunnydelacruz.workers.dev` (live checks in `PROJECT_STATE.md`).

### 7.1 Repository configuration
- `wrangler.jsonc`: `name: "buildtrack"`, `compatibility_date: "2026-10-04"`, `assets.directory: "./dist"`, `assets.not_found_handling: "404-page"`, `assets.html_handling: "auto-trailing-slash"`. No `main` (no Worker script), no Astro adapter, no SSR, no bindings.
- `public/_headers` (copied to `dist/`, applied by Cloudflare, never served): `/_astro/*` gets `Cache-Control: public, max-age=31536000, immutable` (Astro content-hashes those names); every path gets `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` (keeps the origin for Formspree's optional Restrict to Domain), `X-Frame-Options: DENY`, `Strict-Transport-Security: max-age=31536000`. HTML, the font and other unhashed files keep Cloudflare's default `public, max-age=0, must-revalidate` with an ETag, so updates appear immediately. No CSP yet: Astro inlines small scripts, so a CSP would need hashes (deferred).
- The 404 page uses `BaseLayout noindex`: `<meta name="robots" content="noindex">`, and no canonical or `og:url` (its file URL `/404` would otherwise get a non-canonical `/404/`). The sitemap integration already excludes it.
- `.gitignore` also ignores `.wrangler/` (local state) and `.dev.vars*` (local secrets; none are used).

### 7.2 Behaviour (from the docs; verified locally with `npx wrangler@4.147.0 dev --local` on 2026-10-04)
| Request | Result |
|---|---|
| `/`, `/pricing/`, `/contact/?type=demo` | 200 |
| `/pricing`, `/pricing/index.html` | 307 → `/pricing/` |
| `/no-such-page`, `/no-such-page/` | 404 with the custom "Page not found" page |
| `/404.html` | 307 → `/404` (200, `noindex`) |
| `/_headers` | 404 (not served) |
| `/_astro/*.js` | `Cache-Control: public, max-age=31536000, immutable` |
| HTML pages, `/fonts/*` | `Cache-Control: public, max-age=0, must-revalidate` + `ETag`; security headers present |

Not verifiable locally (check after deployment): edge compression (Cloudflare serves Gzip/Brotli/Zstandard for HTML, CSS and JavaScript automatically), HTTPS certificate, `CF-Cache-Status`. HTTPS: `workers.dev` and custom domains are served over HTTPS with Cloudflare-managed certificates; the `.dev` TLD is HSTS-preloaded. Free-plan limits: 20,000 asset files and 25 MiB per file per Worker version (the site has about 20 files); static asset requests are free and unlimited.

### 7.3 Build and deploy (Workers Builds, Git-connected)
| Setting | Value |
|---|---|
| Worker / project name | `buildtrack` (must equal `name` in `wrangler.jsonc`, or the build fails) |
| Production branch | `main` |
| Root directory | repository root (leave empty) |
| Build variable | `SKIP_DEPENDENCY_INSTALL` = `1` (so the lockfile install below is the only install) |
| Build command | `npm ci && npm run build` |
| Deploy command | `npx wrangler@4.147.0 deploy` (pinned; not a project dependency) |
| Node | `.nvmrc` = `24` (the build image preinstalls Node 24.18.0 and reads `.nvmrc`; `engines` requires 24.x) |
| Output | `dist/` (read by `wrangler.jsonc`) |

The first deploy publishes `https://buildtrack.<account-subdomain>.workers.dev`. The account subdomain is `sunnydelacruz`, so the live address is `https://buildtrack.sunnydelacruz.workers.dev`.

### 7.4 Production URL
After the first successful deploy, set `site.productionUrl` in `src/config/site.ts` to the exact HTTPS origin (workers.dev, or a custom domain if one is added later), commit and push; Workers Builds rebuilds. This turns on canonical links, `og:url`, absolute `og:image`, `@astrojs/sitemap` (`sitemap-index.xml` + `sitemap-0.xml`, seven pages, no 404) and the `Sitemap:` line in `robots.txt`. A throwaway build with a rehearsal URL (2026-10-04) produced exactly that. Setting the URL does not mean the site is deployed or verified (ADR-026).

### 7.5 Custom domain (optional, needs budget)
Requires a domain that is an active Cloudflare zone (registered or moved to Cloudflare DNS) and no existing CNAME on the hostname. Add it under the Worker's Settings > Domains & Routes > Add Custom Domain; Cloudflare creates the DNS record and certificate. Then change `site.productionUrl` to the custom domain and repeat the production checks. The `workers.dev` URL can stay enabled or be disabled.

### 7.6 Alternatives (unchanged)
| Option | Notes |
|---|---|
| Cloudflare Pages | Still works for static sites; not preferred for new projects per Cloudflare guidance. |
| Vercel / Netlify | Mature static hosting; check hobby-plan terms. |
| GitHub Pages | Free; weaker header/redirect control. |

## 8. Tooling and validation
| Tool | Kind | Purpose |
|---|---|---|
| `astro` | dependency | Build, dev server |
| `typescript` 6.0.3, `@astrojs/check` 0.9.10 | dev | `astro check` type/diagnostic gate for `.astro` and `.ts` |
| `vitest` 5.0.3 | dev | Unit tests for `src/lib/*` and fixture integrity (shares Astro's Vite 8) |
| `@astrojs/sitemap` 3.7.4 | dev (build-time integration) | Generates sitemap once `site.productionUrl` is set; emits no client code |

Compatibility (verified at install, 2026-10-04): `@astrojs/check` 0.9.10 declares `typescript ^5 || ^6`, so TypeScript 7 is not used; Vitest 5.0.3 accepts Vite `^8`, and npm dedupes a single Vite 8.3.2 shared with Astro 7.3.5. No ESLint, Prettier, Playwright or CI service initially. Add one only when a concrete recurring defect justifies it, and record why. Lighthouse (Chrome DevTools) and manual axe/keyboard checks are used during QA without adding dependencies.

Node: 24 LTS only (`.nvmrc` = `24`, `engines.node` = `>=24.0.0 <25.0.0`). Setup: install or select Node 24 (e.g. `nvm install 24` / `nvm use 24`, or an existing Node 24 installation), then `npm ci`. On the current development machine Node 24.11.1 is at `C:\Program Files\nodejs` while an nvm-managed v25.2.1 is first on `PATH`; project commands prepend the Node 24 directory to `PATH` for that command only, without changing system-wide Node.

Scripts:
```text
npm run dev            astro dev
npm run build          astro build
npm run preview        astro preview
npm run check          astro check
npm test               vitest run
npm run test:browser   node tests/browser/inquiry-form.ts && node tests/browser/home-demo-ui.ts   (form behaviour with a mocked provider, then Home/demo interaction regressions; headless Chromium; needs CHROME_PATH)
npm run check:release  node scripts/check-release.ts   (separate release gate)
```
Ordinary phase completion requires `npm run check`, `npm test` and `npm run build` to pass **with intentionally incomplete config**. `npm run check:release` is a separate release gate: it prints every unmet requirement (section 5) and the manual gates, and exits non-zero until all automated requirements are met. A failing release check before release is expected and is not a foundation failure. It runs the TypeScript script with Node's built-in type stripping (Node 24 LTS), so no extra runner dependency is needed.

Browser for `npm run test:browser` (developer machine only, never a project dependency). The script uses only the executable named by `CHROME_PATH`; it does not search for other installations, and it prints the browser version and path it used. Standalone setup verified 2026-10-04 with Chrome for Testing's headless shell, downloaded by the official `@puppeteer/browsers` CLI through `npx` (nothing is added to `package.json`):
```text
# Git Bash (Windows); any folder outside the repository works
npx @puppeteer/browsers install chrome-headless-shell@154.0.8037.92 --path "$LOCALAPPDATA/buildtrack-browser"
#   prints: chrome-headless-shell@154.0.8037.92 <folder>\chrome-headless-shell\win64-154.0.8037.92\chrome-headless-shell-win64\chrome-headless-shell.exe
export PATH="/c/Program Files/nodejs:$PATH"
CHROME_PATH="$LOCALAPPDATA/buildtrack-browser/chrome-headless-shell/win64-154.0.8037.92/chrome-headless-shell-win64/chrome-headless-shell.exe" npm run test:browser
```
PowerShell: `$env:CHROME_PATH = "$env:LOCALAPPDATA\buildtrack-browser\chrome-headless-shell\win64-154.0.8037.92\chrome-headless-shell-win64\chrome-headless-shell.exe"; npm run test:browser`. On macOS/Linux use the path the install command prints (`mac-…`/`linux64-…`). An installed Chrome, Chromium or Edge executable also works via `CHROME_PATH` (also verified with a full Chromium 151 build). Without a valid `CHROME_PATH` the script exits with these instructions.

Required unit tests:
- `inquiry-params`: valid values accepted; unknown, empty, differently cased, repeated and script-like values ignored; type inference rules.
- `inquiry-validate`: each required/limit rule; trimming; optional fields.
- `inquiry-submit`: response classification (2xx, 4xx with errors, 5xx, network, timeout) to states.
- Browser (`npm run test:browser`, not part of `npm test`): builds two temporary copies of the site in which a Vite `resolveId` hook swaps `src/config/*.ts` modules for fixtures: "configured" (`tests/browser/fixtures/inquiry-configured.ts`: synthetic endpoint `https://form-test.invalid/f/browser-test` and a 1.5 s limit; `site-with-production-url.ts`: a synthetic production URL) and "unconfigured" (`inquiry-unconfigured.ts`: endpoint `null`). It never edits or depends on the real endpoint value, so it keeps working once a real endpoint is configured. Each copy is served locally and driven in headless Chromium over the DevTools protocol with **every** page request intercepted: local test-server requests continue; synthetic-endpoint requests are answered (200/422/429/500, unrecognised 2xx bodies), failed (network), held (timeout before headers) or routed to a local route that sends headers then stalls (timeout during body); any other destination is blocked and fails the run (a self-test proves the block). Before any submission the test asserts the rendered form `action` equals the synthetic endpoint. Also covers preselection, validation/focus, single in-flight submission, confirmation (and that `next` is not followed), failure/retry with preserved values, the no-JS native POST, and the unconfigured build (no form, no submit, no inquiry script, with and without JS). Adds no dependency; nothing test-related reaches the repository config or `dist/`. It also checks, in both copies, that About and How It Works make no publication or delivery claim and keep publication and production receipt as still to come; that every pricing comparison cell is associated (via `headers`) with its plan column, `scope="rowgroup"` category and `scope="row"` feature header, with Chromium roles columnheader/rowheader/cell; and that the error summary is a focused, named and described group with no duplicate live announcement.
- **Initial three-section motion checkpoint (ADR-033; historical):** static Astro markup is the baseline. `audience-sequence.ts` progressively applies native sticky pinning and a transform-only scroll timeline, fixed natural image dimensions per layout, counterrotation, delayed title reveal and bounded scroll hold/release. Same figure DOM supports all static fallbacks/live focus and reading-position handling; no selected-description UI. `device-entrance.ts` uses one-time native Web Animations with reduced-motion cancellation. Workflow cards link to IDs in detailed ProcessSteps without changing How It Works content. No dependency added; GSAP comparison is in DECISIONS. Video sourcing/playback and full suite deferred. Recoverable source/tests/poster and captures outside deployment output in ignored `design/references/home-sequence/`.
- **Historical local centre-poster checkpoint (ADR-032, 2026-10-08):** the existing orbit/selection is resized around a fixed poster using upright-rectangle clearance and a tighter adaptive perimeter. The subsequent dense visual revision grows variable photo edges into free space, compares fill orders by actual image area, and reserves a fixed centre occupying 44% of stage width/height. Full-angle samples include caption/control bounds and focus clearance; transient corner gaps remain documented in PROJECT_STATE. Dense-revision evidence/recovery is ignored under `design/references/orbit-dense/`. No centre video source or playback yet. Type/build and focused capture/fallback checks run now; complete suite and playback checks await visual approval. The Stage 2 full-suite results below describe the preserved baseline; visual motion assertions need adaptation after this direction is reviewed. Recovery/raw clips/captures remain ignored outside deployment output. Poster/proposed montage provenance is `design/media-source/AUDIENCE_CENTRE_PROPOSAL.json`.
- Home/demo interaction (`tests/browser/home-demo-ui.ts`, second part of `npm run test:browser`): builds a fresh temporary site and drives Chromium over CDP with off-site requests blocked; no inquiry is submitted. Covers hero autoplay/reduced motion, shared navigation, demo drawer/fixtures and workflow. Audience coverage: all seven native photo buttons via click, Tab, Enter and Space; selected state, polite status, stable description dimensions, rapid selection, image failure, 21 motion/bounds samples, upright/readable labels, reverse scrolling, idle behavior, focus pause and jump-free resume. Static grids expose all seven photos/descriptions at 320/390px with genuine 16/32px browser default text (Page.setFontSizes), JS on/off, reduced motion and short desktop windows. Live width, height, text-size and reduced-motion transitions preserve selection/focus below the header and reading position; idle observer checks detect churn. Capability checks retain travel/live sizing and stable content below. Optional EVIDENCE_DIR saves local review screenshots outside shipped assets. Stage 2 awaits review; actual results are in PROJECT_STATE. Video tests require Chromium with H.264 support.
- `demo-metrics` and fixtures: referential integrity, unit consistency, derived totals (section 9.3).
- `release-check`: with synthetic configs: a complete config passes; each missing required field is reported individually; null `publicEmail` is not reported; empty `limits`/`exclusions` arrays pass; non-https URLs are reported. The real config is checked only for shape, so `npm test` passes while values are unresolved.

Manual checks (recorded per phase): widths 360/390/768/1024/1440; keyboard-only path through nav, demo and form; screen-reader announcement of form status; reduced motion; Chrome/Edge/Firefox desktop and a real Android device when available.

## 9. Demo data specification
### 9.1 Snapshot model
All demo data is a fixed fictional snapshot "as of" `DEMO_AS_OF = '2026-09-28T08:00:00+08:00'` (Asia/Manila). Nothing reads the real clock, so figures stay coherent. Timestamps display as `28 Sep 2026, 8:00 AM PHT` via `Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila' })`.

### 9.2 Entities
```ts
Project   { id; name; location /* city, province */; type: 'building'|'road'|'bridge'|'industrial';
            startDate; plannedEndDate; plannedProgressPct; actualProgressPct }
Material  { id; projectId; name; category: 'cement'|'aggregates'|'steel'|'masonry'|'formwork';
            unit; onHand; reorderLevel; plannedTotal; usedToDate }
Equipment { id; projectId | null /* null = central yard */; name; tag: 'QR'|'RFID';
            status: 'active'|'idle'|'maintenance'|'in-transit'; hoursUsed7d; hoursAvailable7d }
Delivery  { id; projectId; materialId; quantity; supplierLabel /* generic, e.g. "Supplier A" */;
            status: 'scheduled'|'in-transit'|'delivered'|'delayed'; scheduledAt; deliveredAt | null }
TrackingEvent { id; timestamp; projectId; method: 'QR scan'|'RFID gate read';
            subject: { kind: 'material'|'equipment'; id }; locationLabel; summary }
Device    { id; projectId; kind: 'RFID gate reader'|'GPS tracker'|'Site sensor hub'; label;
            status: 'online'|'offline'|'low-battery'; lastSeen }
```
Units (fixed per material): Portland cement `bags (40 kg)`, washed sand `m³`, gravel 3/4" `m³`, deformed bar 12 mm × 6 m `pcs`, CHB 4" `pcs`, marine plywood 1/2" `sheets`. Deliveries use the referenced material's unit.

### 9.3 Fixture content and invariants
Four clearly fictional projects, all labelled "Sample":
1. Sample Mid-Rise Residential: Pasig City, Metro Manila (building)
2. Sample Road Widening Package: Iloilo City, Iloilo (road)
3. Sample Warehouse Expansion: Mandaue City, Cebu (industrial)
4. Sample Bridge Rehabilitation: Cagayan de Oro, Misamis Oriental (bridge)

Target volume: 4–6 materials and 3–5 equipment per project, 3–6 deliveries per project, ~20 tracking events total, 2–3 devices per project, plus 2 yard equipment items. At least one low-stock material, one delayed delivery, one equipment item in maintenance, and one offline/low-battery device across the set, so every status appears.

Invariants enforced by tests:
- Every foreign key resolves; ids are unique.
- `0 ≤ usedToDate ≤ plannedTotal`; `onHand ≥ 0`; `hoursUsed7d ≤ hoursAvailable7d`.
- `deliveredAt` non-null iff status is `delivered`; delayed deliveries have `scheduledAt < DEMO_AS_OF`; scheduled ones are after it.
- All timestamps ≤ `DEMO_AS_OF` except future scheduled deliveries.
- Progress percentages 0–100; project dates consistent.

### 9.4 Derived metrics (pure functions, never stored)
- `isLowStock(m) = m.onHand <= m.reorderLevel`
- `materialUsagePct(m) = usedToDate / plannedTotal`
- `equipmentUtilizationPct(e) = hoursUsed7d / hoursAvailable7d` (0 if none available)
- `fleetUtilization(list)` = Σ hoursUsed ÷ Σ hoursAvailable (not an average of percentages)
- `deliveryCounts(list)` by status; `scheduleVariancePts(p) = actualProgressPct − plannedProgressPct`, defined for **one project only**. With "All sample projects" selected, the schedule-variance tile is omitted (no aggregate is computed or shown); per-project planned-vs-actual bars still appear.
- Overview tiles, tables and charts all call these on the same filtered list, so they cannot disagree.

### 9.5 Interactive state
```ts
interface DemoState {
  section: 'overview'|'inventory'|'equipment'|'deliveries'|'events'|'devices';
  projectId: 'all' | ProjectId;
  filters: { materialCategory: 'all'|Category; lowStockOnly: boolean;
             equipmentStatus: 'all'|Status; deliveryStatus: 'all'|Status };
  simulatedEvents: TrackingEvent[];   // max 5
}
```
- **Rendering (as implemented):** every panel, row, chart bar, alert and per-scope tile group (all + each project) is rendered at build time from the fixtures and pure functions. `demo.ts` keeps one in-memory `DemoState`, applies `reduce()`, and only toggles `hidden` using the same predicates the tests exercise (`materialVisible`, `eventVisible`, …). It never builds markup from data, so there is no `innerHTML` and no second rendering path that could disagree. A global `[hidden] { display: none !important }` rule guarantees author `display` styles cannot reveal hidden elements.
- "Simulate scan" reveals the next of five pre-written pool events (timestamps `DEMO_AS_OF` + 2…10 minutes, labelled "Simulated") in the events table and the Overview's latest-events list. It changes no quantity, status or metric. At five it becomes `aria-disabled` (still focusable) with a limit message. "Reset demo" restores `initialDemoState` (Overview, all projects, no filters, no simulated events).
- "Clear filters" (in each empty state) resets the section filters only and moves focus to the panel's first filter.
- One polite `role="status"` message per user action (section, project, filter, simulate, reset); nothing is announced on load.
- No `localStorage`, cookies, URL writes, timers or network calls. Reload restores fixtures.
- Without JavaScript all six panels are shown stacked for all projects (simulated events stay hidden), the controls stay hidden, and a note explains that interactive controls need JavaScript.

## 10. Content, metadata and performance
- Each page sets unique `title`/`description` via `BaseLayout` props; `og:title`, `og:description` and `twitter:card` always; canonical, `og:url` and `og:image` (absolute URL to `og-image.png`, which Open Graph requires) only once `site.productionUrl` is set; sitemap via `@astrojs/sitemap`; `robots.txt` allows all and references the sitemap once the URL exists.
- Images: current artwork is original inline SVG (no raster processing needed). If licensed photography is added later, use Astro's built-in `<Image>`/`<Picture>` from `src/assets/` for responsive sizes and lazy loading below the fold. Every asset has a recorded source and licence in `docs/UX_BRAND.md` §9.1.
- JavaScript budget: `nav.ts` on all pages, `demo.ts` only on Product Demo, `inquiry.ts` only on Contact. No third-party scripts other than the form POST target.
- Secrets: none required. `.env` files are not used unless a later decision introduces a build-time value; if so they stay git-ignored.

## 11. Operations
Domain purchase, provider sign-up, recipient verification and host account setup are human tasks. Redeployment and configuration steps are documented after Phase 9 implementation exists. Adding persistence or operational platform features requires a new explicit scope decision.

### Local photo-stage review preview (2026-10-07)
`http://127.0.0.1:4322/` serves the current `dist/` through a local Node built-in HTTP server with no-store responses (`design/references/revision-evidence/preview.mjs`, ignored, local only). The existing Astro preview on localhost:4321 was left running: its Home response before edits matched a fresh build of the inherited working tree byte for byte. Astro refuses a second preview instance for the same project; no `--force` or process termination was used. Rebuild with `npm run build` after source edits; the independent local server reads that output per request. Reference recordings are never static assets. Browser capture uses installed Chromium/CDP and FFmpeg, not project dependencies; its off-origin request guard sends nothing externally.
