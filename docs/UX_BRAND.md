# BuildTrack UX & Brand

Status: academic review-version publication authorized by the owner on 2026-10-13, including current Home capabilities, shared navigation, Product Demo shell and tools. Sections below retain design history; the latest implemented sections supersede older main/prototype descriptions. CE validation and provider integration are not approved by publication.

## 1. Identity
Keep BuildTrack and "Smart Construction. Smarter Delivery." Construction + technology + logistics + data. Modern, professional, clean and credible. The blue/yellow direction takes priority over the BMC's green palette. The final logo treatment is open; preserve the concept and do not present an unapproved mark as final.

Proposed logo direction (pending review): a "BuildTrack" wordmark in the brand font, 700 weight, with "Track" in primary blue on light backgrounds and accent yellow on dark ones, plus a simple geometric mark (a stacked-beam/location-pin hybrid) as an inline SVG. Phase 4 may ship the wordmark only until a mark is approved.

**Implemented logo (2026-10-05, ADR-027):** the owner-supplied emblem (`public/buildtrack-mark.webp`, cropped from `design/BuildTrackLogo.jpeg`) is placed left of the live-text wordmark in the header and footer. It is `min(2.5rem, 12vw)` tall with explicit `width`/`height` attributes, which reserve its space before it loads (total page layout shift not independently measured). It is decorative (`alt=""`) because the link is already named "BuildTrack home". On light backgrounds it shows with no frame (its background is near-white, 249–255). On the navy footer it sits in a white tile with a 4px inset and `--radius-md` corners. At very large text on very narrow screens (320 px wide, 32 px text), the name wraps under the emblem instead of being clipped.

## 2. Design tokens (`src/styles/tokens.css`)
### 2.1 Color
| Token | Value | Use |
|---|---|---|
| `--color-ink` | #071A2B (deep navy) | Body text on light; dark section background |
| `--color-navy` | #0B2742 (construction navy) | Header/footer/dashboard background, hover of primary button |
| `--color-blue` | #1268B3 (primary blue) | Primary buttons on light, links, focus ring on light |
| `--color-blue-bright` | #20A4F3 (technology blue) | Accents and diagrams **on dark only**; never text on light |
| `--color-blue-pale` | #EAF6FF | Page-header bands, subtle panels |
| `--color-yellow` | #FFD43B (accent yellow) | CTAs on dark, active indicators, step numbers, highlights; never text on light |
| `--color-bg` | #F7FAFC (off white) | Page background |
| `--color-surface` | #FFFFFF | Cards, form fields |
| `--color-muted` | #475569 (slate) | Secondary text |
| `--color-border` | #CBD5E1 | Decorative card/section dividers only |
| `--color-border-strong` | #64748B | Form control borders, table rules that convey structure |
| `--color-success` / `-bg` | #166534 / #DCFCE7 | Status text/badges on light |
| `--color-warning` / `-bg` | #854D0E / #FEF9C3 | Status text/badges on light |
| `--color-danger` / `-bg` | #B91C1C / #FEE2E2 | Errors, status on light |
| `--dash-bg` | #0B2742 | Dashboard shell |
| `--dash-panel` | #12304F | Dashboard cards/tables |
| `--dash-text` / `--dash-muted` | #E2E8F0 / #94A3B8 | Dashboard text |
| `--dash-success` / `-warning` / `-danger` / `-info` | #4ADE80 / #FFD43B / #FCA5A5 / #7DD3FC | Dashboard status text/icons |

### 2.2 Contrast verification (calculated)
| Pair | Ratio | Requirement | Result |
|---|---|---|---|
| ink on white / off-white / pale blue | 17.62 / 16.81 / 16.05 | 4.5 text | Pass |
| slate on white / off-white / pale blue | 7.58 / 7.23 / 6.90 | 4.5 text | Pass |
| primary blue on white / off-white / pale blue (links) | 5.74 / 5.48 / 5.23 | 4.5 text | Pass |
| white on primary blue (button) | 5.74 | 4.5 text | Pass |
| white on navy (button hover, header/footer text) | 15.18 | 4.5 | Pass |
| white on ink | 17.62 | 4.5 | Pass |
| pale blue on navy | 13.83 | 4.5 | Pass |
| ink on yellow (CTA button) | 12.36 | 4.5 | Pass |
| yellow on ink / on navy | 12.36 / 10.65 | 4.5 | Pass |
| technology blue on ink / on navy | 6.43 / 5.54 | 4.5 | Pass |
| **technology blue on white** | 2.74 | 4.5 text / 3 graphic | **Fail: dark backgrounds only** |
| **yellow on white** | 1.43 | 4.5 text / 3 graphic | **Fail as text or as a required graphic.** A yellow-filled button with ink text on white still passes for its label (12.36); WCAG does not require a button's fill to contrast with the page when the text identifies it. Using blue primary buttons on light backgrounds is a design choice (stronger, consistent emphasis), not a WCAG prohibition. |
| dash text / muted on panel | 10.91 / 5.25 | 4.5 | Pass |
| dash muted on dash bg | 5.92 | 4.5 | Pass |
| technology blue chart bars on panel | 4.91 | 3 graphic | Pass |
| ink on hover yellow #F5C400 | 10.72 | 4.5 | Pass |
| dash success / warning / danger / info on panel | 7.72 / 9.44 / 7.09 / 8.07 | 4.5 | Pass |
| success / warning / danger text on white | 7.13 / 6.85 / 6.47 | 4.5 | Pass |
| success / warning / danger on their badge bg | 6.49 / 6.38 / 5.30 | 4.5 | Pass |
| strong border #64748B on white (inputs) | 4.76 | 3 non-text | Pass |
| decorative border #CBD5E1 on white | n/a | none (decorative) | Must not be the only indicator of a control |
| focus ring: primary blue on white; yellow on ink | 5.74; 12.36 | 3 non-text | Pass |

Recheck any new pair, and verify rendered pages (including gradients and text over photos) with browser tools in Phase 7. Text over photography always sits on a solid or ≥85%-opacity ink overlay.

### 2.3 Typography
- Family: **Inter** 4.1 (SIL Open Font License 1.1; approved 2026-10-04). Self-hosted as `public/fonts/InterVariable-latin.woff2`: the official upright variable font (weights 100–900, `opsz` axis) subset to Basic Latin, Latin-1, general punctuation and ₱ (≈100 KB), with the licence and copyright notice in `public/fonts/OFL.txt`. `font-display: swap`, preloaded. Italic is not shipped (the design uses none). Fallback stack: `system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`.
- Weights: 400 body, 600 labels/subheads, 700 headings/wordmark.
- Scale (`rem`, fluid where noted):

| Token | Size | Line height | Use |
|---|---|---|---|
| `--text-sm` | 0.875 | 1.5 | Hints, captions, table meta, badges (never below 0.875) |
| `--text-base` | 1 (1.0625 ≥ 60rem) | 1.6 | Body |
| `--text-lg` | 1.125 | 1.55 | Lead paragraphs, card titles |
| `--text-xl` | 1.25 | 1.4 | H4, plan names |
| `--text-2xl` | clamp(1.5, 1.2 + 1.2vw, 1.875) | 1.3 | H3 |
| `--text-3xl` | clamp(1.875, 1.4 + 2vw, 2.5) | 1.2 | H2 |
| `--text-4xl` | clamp(2.25, 1.6 + 3vw, 3.5) | 1.1 | H1 |

Measure: body text max `68ch`. One H1 per page; headings never skip levels.

### 2.4 Spacing, sizing and shape
- Spacing scale (4 px base): `--space-1` 0.25rem, `-2` 0.5, `-3` 0.75, `-4` 1, `-5` 1.5, `-6` 2, `-8` 3, `-10` 4, `-12` 6.
- Section vertical padding: `--space-8` mobile, `--space-12` ≥ 60rem.
- Container: max width 75rem; side gutter 1rem (< 40rem), 1.5rem (40–60rem), 2rem (≥ 60rem).
- Breakpoints (used as literal values in media queries): 40rem (640 px), 48rem (768 px), 64rem (1024 px), 75rem (1200 px). Layouts are mobile-first `min-width` queries.
- Target size: interactive controls ≥ 44×44 px (exceeds WCAG 2.2 AA 24 px minimum); inline text links exempt.
- Radius: `--radius-sm` 4px (badges, inputs), `--radius-md` 8px (cards, buttons), `--radius-lg` 12px (dashboard panels, images).
- Shadow: `--shadow-sm` `0 1px 2px rgb(7 26 43 / 0.08)`; `--shadow-md` `0 4px 12px rgb(7 26 43 / 0.10)`. Cards use a border or `--shadow-sm`, not both heavily.
- Header height: 4rem (≥ 64rem), 3.5rem below.

### 2.5 Components
| Component | Spec |
|---|---|
| Button, primary (light bg) | `--color-blue` bg, white text, 600 weight, `--radius-md`, min-height 44px, padding `0.75rem 1.25rem`; hover `--color-navy` |
| Button, primary (dark bg) | `--color-yellow` bg, ink text; hover darken to #F5C400 (ink on #F5C400 = 10.72) |
| Button, secondary | transparent, 2px border in `--color-blue` (light) or white (dark), matching text color |
| Text link | `--color-blue`, underlined; on dark, white underlined |
| Focus | `outline: 3px solid` primary blue (light) / yellow (dark), `outline-offset: 2px`, via `:focus-visible` on every interactive element |
| Card | surface bg, 1px `--color-border`, `--radius-md`, padding `--space-5`; whole card is not a link unless it has a single destination |
| Badge | `--text-sm` 600, `--radius-sm`, padding `0.125rem 0.5rem`, text plus icon for status |
| Page header band | `--color-blue-pale` bg, breadcrumb-free; H1 + one-line lead + optional CTA |
| CTA band | ink bg, H2 white, lead pale blue, yellow primary + white secondary buttons |
| Section heading | optional eyebrow (`--text-sm`, 600, uppercase, letter-spacing 0.06em, `--color-blue` on light / yellow on dark) + H2 + lead |
| Disclosure note | `--text-sm`, info icon, slate text on pale blue, left border 4px `--color-blue` |
| Icons | inline SVG, 24px grid, 2px stroke, `aria-hidden="true"` when paired with text |

## 3. Shared layout
### 3.1 Header
- Light: white bg, bottom border `--color-border`. (Prototype on `ui-redesign`: solid navy, see §11.2.) Sticky at top on desktop and when JavaScript has enabled the collapsible mobile menu; **not sticky in the no-JS mobile fallback**, where the wrapped link list is tall enough to cover in-page targets such as the skip-link destination.
- Desktop (≥ the measured header breakpoint, see below): wordmark left; seven links (Home, Solutions, How It Works, Product Demo, Pricing, About, Contact) right-aligned; "Request a Demo" primary button (→ `/contact/?type=demo`) at far right. Current page: `aria-current="page"`, 600 weight, 3px primary-blue underline.
- Below the breakpoint: wordmark left; "Menu" button (icon + visible text) right, `aria-expanded`, `aria-controls`. Opens a full-width panel under the header with links stacked (each 48px tall) and the CTA button last. The panel's height is capped to the space below the header's rendered height (measured by `src/scripts/nav.ts` with a ResizeObserver, since enlarged text can wrap the header far past `--header-height`; the token is the fallback) and scrolls internally, so all items remain reachable on short/landscape viewports. Escape closes it and returns focus to the Menu button; activating a link navigates. Not a modal: no focus trap, no scroll lock.
- Breakpoint: determined by the header fit check (`ARCHITECTURE.md` §3.1): the desktop header is used only where wordmark + seven links + CTA fit on one line. Measured value is recorded here in Phase 3.
- **Measured 2026-10-04 (headless Chromium):** one-line header needs 1,054 px with Inter and 1,028 px with the fallback stack (including gutters), so 64rem (1,024 px) fails. **Desktop header from 75rem (1,200 px)**; Menu button below that, including at 1024 px. Re-measure if nav labels or the CTA change. **Re-measured 2026-10-05 with the logo emblem:** 1,099 px (Inter) and 1,075 px (fallback); 75rem still fits.
- No-JS: the Menu button is hidden and the link list wraps visibly below the wordmark.
- First focusable element on every page: "Skip to main content" link, visible on focus.
- Scroll offsets: `html { scroll-padding-top }` = rendered header height (`--header-rendered`, set by `src/scripts/nav.ts`) + `--space-4`, falling back to `--header-height` without JavaScript, so skip-link, anchor and focus targets land below the sticky header even when large text makes it taller. The form error summary is aligned with `scrollIntoView({ block: "start" })` after focus because it can be taller than the viewport.

### 3.2 Footer
Navy bg, white/pale-blue text. ≥ 48rem: four columns: (1) wordmark, tagline, one-sentence description; (2) page links; (3) contact identity (location, phone, email, or "Contact details pending approval" while unset); (4) coverage: "Philippines-based". Mobile: single column in that order. Bottom row: academic disclosure: "BuildTrack is an academic business proposal. Platform features are proposed, prices are proposed academic pricing, and the product demo uses fictional data." Then © year BuildTrack.

### 3.3 CTA destinations
| Label | Destination |
|---|---|
| Request a Demo | `/contact/?type=demo` |
| Request a Quotation (per service) | `/contact/?type=quotation&service=<id>` |
| Avail this plan | `/contact/?type=service&plan=<id>` |
| Request a quotation (per plan) | `/contact/?type=quotation&plan=<id>` |
| Explore the Product Demo | `/product-demo/` |
| Contact us | `/contact/` |

## 4. Page specifications
Desktop = ≥ 64rem; tablet = 48–64rem; mobile = < 48rem (design checked at 360/390). "Cols" refers to a 12-column grid.

### 4.1 Home (`/`): complete pitch
Published `main` layout. The approved redesign replaces it on the `ui-redesign` prototype; see §11.

1. **Hero** (ink-to-navy vertical gradient). Desktop: text 7 cols / image 5 cols. Eyebrow tagline "Smart Construction. Smarter Delivery."; H1 value proposition: "Know where your materials and equipment are, how they are being used, and what your project needs next."; lead: one sentence on BuildTrack as a proposed smart materials & equipment management system for efficient project delivery; buttons: Request a Demo (yellow) and Explore the Product Demo (secondary white); small note "Academic business proposal. Demo uses fictional data." Image: construction-site photo (radius-lg) with an overlapping static sample-dashboard card labelled "Sample data". Mobile: single column; image after buttons, 4:3 crop; overlay card hidden below 40rem.
2. **Capability strip**: Materials, Equipment, Inventory, Project visibility: icon + label + one line. Desktop 4 across; mobile 2×2.
3. **Problem**: H2 "Construction teams lose track of resources" (draft); three points: fragmented visibility, losses and waste, avoidable delays and costs. Desktop text 6 / illustration 6; mobile stacked.
4. **Solution and how it works**: H2 + four numbered steps (Tag → Capture → Proposed cloud platform → Dashboards & decisions) in a row with connectors (desktop), vertical list (mobile). Link "How it works →" `/how-it-works/`.
5. **Demo preview** (navy band): three stat tiles rendered at build time from the demo fixtures, "Demonstration data" badge, button Explore the Product Demo.
6. **Proposed outcomes**: four benefit cards (reduced waste/loss, inventory accuracy/utilization, project visibility, fewer avoidable delays). Note: "Intended benefits of the proposed platform, not measured results." No percentages.
7. **Services**: compact 4×2 grid (mobile 1 col) of the eight catalogue services; link to `/solutions/`.
8. **Who we serve**: all seven BMC segments as identical cards in an `auto-fit, minmax(15rem, 1fr)` grid; same size, icon style and order as `business.ts`; no featured segment.
9. **Pricing preview**: three compact plan cards (name, tier, price or "Pending approval"); link to `/pricing/`.
10. **Coverage**: "Philippines-based" statement with a simple Philippines outline graphic; future vision line "Southeast Asian expansion is a future vision."
11. **Final CTA band**: Request a Demo + Request a Quotation (`/contact/?type=quotation`).

### 4.2 Solutions (`/solutions/`)
Layout superseded by §12.1 (2026-10-11); content requirements below still apply.
1. Page header: H1 "Solutions", lead, no CTA.
2. Four capability sections: Materials & inventory; Equipment tracking & utilization; Delivery monitoring; Project dashboards & analytics. Each: H2, problem it addresses, what the proposed platform does (3–4 bullets), a figure (photo or demo screenshot labelled "Sample data"), button "Request a Quotation" with that service id. Desktop: alternating text 6 / media 6; mobile: text then media.
3. Supporting services: hardware deployment, onboarding & training, custom integration, maintenance & support. Four cards, each with a quotation link. Note: hardware/implementation/integration quoted separately.
4. Who it serves: seven segments, each with one line on how they would use BuildTrack (equal grid as Home).
5. CTA band.

### 4.3 How It Works (`/how-it-works/`)
Layout and four-step flow superseded by §12.2 (2026-10-11): tagging is folded into Record; content requirements below still apply.
1. Page header.
2. Four-step flow: (1) Tag resources: QR labels, RFID tags, IoT devices; (2) Capture: scans at gates, stockpiles and equipment; device readings; (3) Proposed cloud platform consolidates records; (4) Dashboards, alerts and decisions. Desktop: horizontal steps with yellow numbered circles on ink band and arrow connectors; mobile: vertical with a left rail. Each step: what happens, who does it, what the demo simulates.
3. Technologies explained: comparison table QR vs RFID vs IoT sensor (how it is read, typical use, cost note "varies; quoted separately"). Table scrolls in a labelled region on mobile.
4. "What's real in this prototype": three columns (Actual / Simulated / Concept only), taken from `PROJECT_BRIEF.md`; mobile stacked.
5. CTA: Explore the Product Demo.

### 4.4 Product Demo (`/product-demo/`): see §6.

### 4.5 Pricing (`/pricing/`)
1. Page header with the required disclosure (ADR-025): "Proposed academic pricing for the envisioned BuildTrack platform. This website demonstrates the concept and accepts inquiries; it does not activate a production subscription."
2. "Included in every plan" card (the four all-plan capabilities), then plan cards: three equal cards, desktop 3 across, tablet/mobile stacked. Each: tier label (Basic / Advanced / Custom), plan name, price `₱2,990 / month` with "per organization", positioning, "Includes" introduced by "All capabilities included in every plan, plus:" or "All <previous plan> capabilities, plus:" and that plan's additions only (capabilities only), "Onboarding and support" (for higher tiers prefixed "Replaces <previous plan>'s onboarding and support; they are not added together."), "Limits per organization", primary "Avail <plan>", secondary "Request a quotation". No plan is highlighted; if one ever is, Professional may say "For growing teams", never "Most popular". Note below: prices are monthly per organization; additional capacity is quoted separately; choosing a package sends an inquiry only.
3. Comparison table grouped by Price, Capabilities, Onboarding and support, Limits per organization (one `<tbody>` per group, its first row a full-width `th scope="rowgroup"`; feature cells `th scope="row"`; plan headers `th scope="col"`; each data cell lists its plan, group and feature header ids in `headers`); cells "Included" / "Not included" / text, never icon-only. Horizontally scrollable labelled, focusable region with sticky row headers whenever it does not fit (mobile, and enlarged text at any width).
4. "How limits are counted": material record = one material type/SKU regardless of quantity; equipment record = one individually tracked asset; limits apply per organization across its active projects.
5. Separately quoted items: the owner-approved exclusions list.
6. Coverage note: Philippines-based.
7. CTA band: Avail a Service / Request a Quotation.

### 4.6 About (`/about/`)
1. Page header: H1 "About BuildTrack".
2. Background: academic Technopreneurship business proposal; what problem prompted it. Text 7 / image 5.
3. Mission and vision: two cards side by side (stacked mobile). Vision may mention Southeast Asia as future.
4. Coverage: Philippines-based.
5. Academic disclosure panel: what is real (website, request flow) vs proposed vs simulated.
6. CTA: Contact us.
No team photos, offices, partners, customers or awards unless supplied and approved.

### 4.7 Contact (`/contact/`)
1. Page header: H1 "Request a demo, quotation or service"; lead.
2. Desktop: form 7 cols, aside 5 cols (sticky top offset 6rem). Aside: contact identity (location, phone, email), coverage, "What happens next": 1) your request is sent to the BuildTrack contact through our form service, 2) they follow up by email or phone, 3) a request is not a payment, booking or subscription. Mobile: form first, aside after.
3. Form per §5.

### 4.8 404
H1 "Page not found", one line, buttons Home and Contact, plus the normal header/footer.

## 5. Inquiry form UX
- **Order:** Request type → Service → Plan → Name → Email → Organization → Phone → Organization type → Project need → Message → Privacy acknowledgment → Submit.
- **Request type:** three radio "cards" in a `fieldset` with `legend` "What would you like to do? (required)". Each card shows the label and one line: Demo "See a walkthrough of the proposed platform"; Quotation "Get proposed pricing for your project needs"; Service "Tell us you want to avail a plan or service". Selected card: 2px primary-blue border, pale-blue bg, check icon. Desktop 3 across, mobile stacked.
- **Labels:** visible, above the control, 600 weight. Required fields say "(required)" in text; optional fields say "(optional)". Hints below the label, linked by `aria-describedby`.
- **Controls:** full width up to 36rem; 44px min height; 1px `--color-border-strong` border; on focus the 3px focus ring.
- **Field errors:** below the control: danger icon + text (e.g. "Enter your email address, like name@company.com"); `aria-invalid="true"`; error id added to `aria-describedby`; red left border on the field group. Never color alone.
- **Error summary:** at top of form on failed submit: heading "Please fix the following", list of links to each invalid field; receives focus. Implemented as a focusable `role="group"` named by its heading and described by its message, with no live region of its own (one announcement on focus).
- **Privacy acknowledgment:** checkbox: "I understand my details will be sent to the BuildTrack contact through [provider] to respond to this request." Phase 6 draft (in `src/config/inquiry.ts`, shown with a "Draft privacy wording pending review" marker until approved): "…through Formspree, a third-party form service, to respond to this request." plus the hint "Only include details needed for this request. Do not enter payment or card details." No retention or provider-handling promise is made. Wording approved by the human on 2026-10-04 for the initial publication of the academic prototype (may be revised later); the draft marker is no longer shown.
- **Submit:** primary button, label matches type: "Send demo request" / "Send quotation request" / "Send service request" (generic "Send request" before a type is chosen).
- **Submitting:** button disabled, spinner icon (static under reduced motion), text "Sending request…"; polite live region announces "Sending your request".
- **Accepted:** (implemented with an added sentence: "This confirms that the form service received your request. It does not confirm that the request has reached or been read by the contact.") form replaced by panel (success-bg, focus moved to its heading): H2 "Request submitted"; "Thank you. Our form service has accepted your [request type] for the BuildTrack contact, who will follow up using the details you provided." Then: "If you don't hear back, you can also reach us at [configured phone/email]." Copy never says the contact has received or read the request. Below it a summary of type/service/plan, a note "This is a request only. No payment, booking or subscription has been made.", and links back to Home and the Product Demo. No guaranteed response time.
- **Failure:** values preserved; error summary (danger-bg) focused: provider validation: field-specific messages; provider/server error: "We couldn't send your request. Your details are still here. Please try again."; network: "We couldn't reach the form service. Check your connection and try again."; uncertain outcomes (a timeout before or after headers, or an unrecognised success response) use the heading "We couldn't confirm your request" and say the outcome is unknown, the details are still here and a retry may reach the contact twice; they never say the request was not sent Configured contact details are shown as an alternative. Button returns to "Send … request".
- **Keyboard:** natural tab order; radio group uses arrow keys natively; Enter submits; no custom key traps.
- **Not connected:** if the endpoint is unset, the page contains no form at all (no fields, no submit control, with or without JavaScript), only a notice: "The request form is not yet connected. Requests cannot be sent from this page yet." plus any configured contact details.

## 6. Product demo UX
Behaviour below is unchanged except where noted. On the `ui-redesign` prototype the demo is an application-style workspace (sidebar/drawer, light workspace, compact toolbar; Simulate scan lives in Activity; sections labelled Materials and Activity for the `inventory` and `events` ids) with `#demo-panel-<section>` entry points; see §11.4.

### 6.1 Page structure
1. Page header: H1 "Interactive Platform Demo"; lead explaining it shows how the proposed platform would look.
2. **Disclosure banner** (always visible, not dismissible), placed directly above the dashboard: "Demonstration data shown for illustration purposes. No real construction site, hardware or device is connected."
3. Dashboard shell (dark: `--dash-bg`, panels `--dash-panel`, `--radius-lg`).
4. Below shell: short "How to use this demo" list and CTA Request a Demo.

### 6.2 Shell layout
- **Desktop (≥ 64rem):** left sidebar 15rem: section nav buttons Overview, Inventory, Equipment, Deliveries, Tracking events, Devices (icon + text, active: yellow left bar + `aria-current="true"`). Main area: top bar with project `<select>` ("Project: All sample projects" + four projects), "Simulate scan" button, "Reset demo" button, and badge "SIMULATED DATA" (yellow text on panel). Content region below with an H2 for the active section.
- **Tablet (48–64rem):** sidebar collapses to a horizontal button row above the content; top bar wraps to two lines.
- **Mobile (< 48rem):** section nav is a horizontally scrollable row of buttons (with edge fade and visible scrollbar), project select full width, Simulate/Reset side by side, badge stays at top of the shell and is sticky while the shell is in view. Stat tiles 2×2; charts full width; tables in scroll regions.

### 6.3 Behavior
- Section buttons swap the visible section; focus stays on the button. A polite status line (visually shown under the top bar) announces e.g. "Showing Inventory · Sample Road Widening Package · 5 materials".
- Project select filters every section; filters are per section and reset when "Reset demo" is pressed.
- "Simulate scan" adds one labelled event ("Simulated" badge) to Tracking events and Overview's recent list; after 5 it is disabled with text "Simulation limit reached; reset to start again". No figures change.
- Reload restores everything.

### 6.4 Section contents
| Section | Content | Filters |
|---|---|---|
| Overview | Tiles: Low-stock materials (count), Equipment utilization last 7 days (%), Deliveries in transit / delayed, and Schedule variance (pts) **only when a single project is selected**; with "All sample projects" the variance tile is omitted. Planned-vs-actual progress bars per project. Alerts derived from low stock, delayed deliveries, maintenance and device problems. Five most recent events (simulated ones included once revealed). | Project |
| Inventory | Table: Material, Project, On hand (unit), Reorder level, Used / planned, Status badge (Low stock / OK). Bar chart: usage % per material. | Project, category, low-stock only |
| Equipment | Table: Equipment, Tag (QR/RFID), Location, Status, Utilization (7 days). Bar chart: utilization %. | Project, status |
| Deliveries | Count chips by status, table: Material, Quantity (unit), Project, Supplier, Scheduled, Status. | Project, status |
| Tracking events | Table: Time (PHT), Method, Item, Location, Summary; simulated rows badged. | Project |
| Devices | Table: Device, Project, Status (icon + text), Last seen. Caption "Illustrative device states". | Project |

### 6.5 Charts and status
- Horizontal bar charts built from HTML/CSS (`<div>` bars with width %) or inline SVG; each bar has its value as visible text; each chart has a caption and is followed by (or toggles to) its data table. Bars use `--color-blue-bright` on panel; threshold markers dashed yellow.
- Status uses icon + text + color: OK (check, success), Low stock / Delayed / Maintenance / Low battery (warning triangle, warning), Offline (cross, danger), In transit / Scheduled (arrow/clock, info).
- Tables: `<caption>`, `<th scope>`, numeric columns right-aligned with units in the header, scroll region `role="region"`, `aria-label`, `tabindex="0"`.
- **Empty state:** "No [items] match these filters." plus "Clear filters" button, inside the table area.

### 6.6 No-JS
All six sections are shown stacked for all sample projects (more useful than the overview alone); the controls are hidden and a note says "Interactive controls need JavaScript. All sample data for all four projects is shown below."

## 7. Motion
Applies to `main` and to every page except the Home prototype, whose approved motion (a pausable background video and, on desktop, a pinned scroll-driven capability section) is in §11.3 and ADR-029. The capability section's local "drawn, then built" prototype (§13, ADR-037) is not yet approved.

- Allowed: 150–200 ms opacity/color/transform transitions on hover, focus, menu open and section swap; one optional subtle step highlight on the How It Works flow.
- Not allowed: parallax, scroll-jacking, autoplaying video/carousels, particles, constant glow, 3D scenes, animated counters.
- `@media (prefers-reduced-motion: reduce)` sets transitions/animations to none; spinners become static icons. No content depends on an animation to appear.

## 8. Customer journey
Solutions/Pricing CTAs preselect service/plan/request type on Contact. Users can revise every choice. Labels and confirmation copy distinguish Request a Demo, Request a Quotation and Avail a Service. Availing expresses interest; it creates no payment, booked service or active subscription. Follow-up is explained without inventing a guaranteed response time.

## 9. Visual language and imagery
Relevant construction, equipment and material-yard photography paired with clear data UI and technical line graphics. Strong spacing and hierarchy, modest radius, subtle borders/shadows. Avoid floating glass cards everywhere, random futurism, fake client logos and excessive glow. A darker dashboard contrasts with the brighter marketing site. No login screen or app shell implying a real customer account.

Images: own photos or stock with a licence permitting this use; log each file's source, licence and alt text in an image log here during Phase 4. Philippine-context imagery preferred where available. Do not use photos with identifiable company branding.

### 9.1 Asset log
| Asset | Source | Licence / notice |
|---|---|---|
| `src/components/graphics/HeroIllustration.astro` | Original SVG created for this project (2026-10-04) | Project-owned; no third-party notice |
| `src/components/graphics/SamplePanel.astro` | Original SVG created for this project; illustrative shapes, captioned "illustration, not real data" | Project-owned; removed 2026-10-11 (Solutions uses demo screenshots) |
| `src/components/site/icons.ts` (line icons) | Original paths drawn for this project | Project-owned |
| `public/favicon.svg` | Original provisional "B" mark; kept after the owner logo arrived because the logo is illegible at 16–32 px (ADR-027) | Project-owned |
| `design/BuildTrackLogo.jpeg` (1254×1254, 70 KB, original, unmodified) → `public/buildtrack-mark.webp` (emblem crop 750×720 at x 262, y 127, scaled ×0.2 to 150×144, WebP q90, 6 KB) | Supplied by the project owner, 2026-10-05 | No licence or authorship terms supplied; none claimed |
| `design/og-image.svg` → `public/og-image.png` (1200×630, 184 KB) | Original; rendered with headless Chromium using the self-hosted Inter | Project-owned; contains Inter glyphs (OFL permits embedding in documents/images) |
| `public/fonts/InterVariable-latin.woff2` | Inter 4.1 official release (github.com/rsms/inter, `web/InterVariable.woff2`), subset to Latin + ₱ with fontTools | SIL Open Font License 1.1; notice kept in `public/fonts/OFL.txt`, Copyright (c) 2016 The Inter Project Authors |

| `public/media/construction-hero-candidate.mp4` (8 s, 1280×720 H.264, no audio, 1.97 MB, supplied derivative of the 720p source) | Pexels video 31009581 by David Pickup (https://www.pexels.com/video/construction-site-with-crane-and-framework-31009581/), via the owner's media starter pack, 2026-10-05 | Pexels License (https://www.pexels.com/license/), checked 2026-10-05 per the pack; not the project's licence. Stock footage of a timber-frame house build; never presented as a BuildTrack project, customer or Philippine site. A small company name is painted on the mobile crane's cab; under the hero overlay it is barely legible |
| `public/media/construction-hero-poster.jpg` (1280×720, supplied) → `construction-hero-640.webp` (q72, 33 KB) and `construction-hero-1280.webp` (q55, 87 KB) | Still from second 4 of the same clip (supplied in the pack); WebP derivatives made locally with sharp | Pexels License (as above) |
| `construction-wide.webp` (1920×1280, supplied; moved from `public/media/` to `design/media-source/` on 2026-10-05 so it is not deployed) → `public/media/construction-wide-1280.webp` (q70, 72 KB) | Pexels photo 5027559 by Ilya (https://www.pexels.com/photo/crane-on-a-building-5027559/), via the starter pack | Pexels License; stock photo used as the Home closing-band background, captioned as stock |
| `tower-crane.webp` (supplied; moved from `public/media/` to `design/media-source/` on 2026-10-05 so it is not deployed) | Pexels photo 7121536 by Audrey Walsh | Pexels License. **Not used**: a contractor's name is clearly legible on the crane (§9 forbids identifiable company branding). `ASSET_SOURCES.json` still lists the original `public/media/` paths; its checksums are unchanged |
| `design/media-source/` (source JPEGs, 28 s 720p clip, `ASSET_SOURCES.json`, `README.md`) | Owner's media starter pack, 2026-10-05; SHA-256 checksums verified against `ASSET_SOURCES.json` | Pexels License. Sources only, never loaded by the site |
| `public/media/demo/demo-laptop.webp` (1280×800, 60 KB), `demo-phone.webp` (440×952, 27 KB), `demo-overview` / `demo-inventory` / `demo-equipment` / `demo-deliveries.webp` (1088×816, 37–52 KB) | Screenshots of BuildTrack's own **application-style** Interactive Platform Demo, recaptured 2026-10-12 from the local build (settings and procedure in §11.5) | Project-owned; real fictional fixtures and the demo's own "Simulated data" labels; no edited or added interface elements |

Photography and video were added only by the Home redesign prototype (§11); `main` uses original vector graphics. Git ignores the starter ZIP and the 23 MB source clip (`.gitignore`); both stay on disk with their provenance records.

## 10. Copy integrity
Describe the operational platform as proposed. Explain the academic prototype clearly without overwhelming every paragraph. Use "Interactive Platform Demo" and "Demonstration data shown for illustration purposes." Do not claim live QR/RFID/IoT tracking. Prices are proposed academic pricing. Never invent international coverage, customers, offices, partners or measured results. Draft headlines in this document are proposals for owner review.

## 11. Home redesign (2026-10-05)
### 11.1 Approved direction (by the human, 2026-10-05)
Bold construction visuals; navy/blue backgrounds with restrained yellow accents; strong typography and generous spacing. Animation is a central design feature, excluding any rotating or scattered video collage. Astro, strict TypeScript, native components and plain CSS remain; no new dependencies. Business configuration, inquiry handling, preselection, demo calculations, routes and truthful disclosures are preserved. Home order: (1) solid navy header with the owner logo, navigation and "Request a Demo"; (2) full-width construction-video hero with a dark overlay, headline "Know your materials. Track your equipment. Keep projects moving.", supporting copy, CTAs Explore the Demo / Request a Quotation and the label "Academic business prototype"; (3) laptop-and-phone showcase of the actual demo labelled "Simulated platform demo" (the phone is the responsive website, not a native app); (4) four capabilities (materials, equipment, deliveries, reporting) in alternating visual/text rows; (5) three-step workflow keeping simulated behaviour distinct from conceptual hardware integration; (6) all seven segments equally; (7) three pricing previews from config with the pricing disclosure; (8) closing CTA and footer.

Motion: brief staggered hero entrance (about 1 s); one-time section reveals (16–24 px, 400–600 ms); laptop then phone enter and stay still; restrained hover/focus transitions; no scroll hijacking, pinned sections, spinning devices or perpetual floating; content visible without JavaScript or if animation fails; reduced motion disables entrances and video autoplay; keyboard focus never lands on invisible content. Media: compressed hero candidate only, visible accessible pause/play control and still fallback, still image by default on mobile (video on request), no implication that stock media shows BuildTrack projects or endorsements, source/licence records kept, CSS device frames, demo screenshots captured locally.

For Home and the shared header this direction supersedes the §7 ban on autoplaying video and the §3.1 white header (ADR-028).

**Approved changes, 2026-10-06 (ADR-029):** (a) the Product Demo becomes an application-style workspace (dark navy sidebar, light workspace, compact toolbar, mobile drawer), using the owner's dashboard reference as structural inspiration (the reference image itself was not available to the implementer); (b) the owner approves, for desktop only, a pinned capability section whose horizontal progression follows normal vertical page scrolling. This replaces the manual strip and its Previous/Next buttons, and supersedes, for that one section, the earlier "no pinned sections" line above and the §7 ban on scroll-jacking: the page keeps native scrolling and no input is captured. REQUIREMENTS' "respect reduced motion; avoid autoplay distractions" is met by the pause control, no autoplay under reduced motion or on small screens, and a muted, decorative clip.

### 11.2 Implemented prototype (local, unreviewed)
Current checkpoint: ADR-034 final-pose refinement, 2026-10-08, awaiting visual review. Reference-matched endpoint approximately 300.65 degrees (previous progress 71.33%); widened side frames and shortened inward portrait, continuous motion and original title/hold/release distances. Prior local playback review follows. The human permits the current seven candidates, including inspection and parked-equipment alternatives, for local playback review; final media and adjusted-composition approval remain pending. The left portrait is brought inward with a slight proportional reduction; upper frames align with its inside edge through a smooth precomputed path. Natural full-frame proportions, collective enlargement, upright counterrotation, final titles and approved hold/release stay. The ADR-033 laptop/phone entrance and workflow cards are preserved. Muted looping inline videos load only near an eligible desktop scene; one visible native Pause/Play button preserves explicit Pause across live layouts and scrolling. Off-screen/hidden-tab pause; synchronous reduced-motion/Save-Data cancellation; refused-autoplay retry and per-clip poster/error fallback. Mobile, reduced motion, Save-Data, enlarged text, short viewports and no JavaScript show the static poster/title grid without automatic video download. In static JS layouts the same control is focusable but aria-disabled, described as showing still images. Visible illustrative-stock disclosure remains. Earlier implementation notes are historical where superseded.
Status: implemented 2026-10-05 and revised 2026-10-06 on local branch `ui-redesign`; **awaiting visual and independent review; not committed, not deployed**. `main` and the live site are unchanged.
- **Header (all pages):** `on-dark` navy (`--color-navy`), white links, yellow current-page bar and yellow CTA; the logo emblem sits in its white tile (as in the footer). Bar column gap reduced to `--space-3` (a minimum only) so the tiled logo and the Menu button share one row at 320 px. One-line desktop width 1,095 px (Inter) / 1,071 px (fallback); breakpoint 75rem unchanged. `BaseLayout stickyHeader={false}` (used only by the Product Demo) keeps the header in the page flow (`.is-static`).
- **Hero:** `<picture>` still (640/1280 WebP, JPEG fallback, `fetchpriority="high"`) always present; `src/scripts/hero-video.ts` adds a muted, looping, inline `<video>` only at ≥ 48rem without reduced motion or Save-Data, or when the visitor presses Play. Control: a visible button "Pause/Play background video", shown only with JavaScript and MP4 support; it reads "Background video unavailable" (`aria-disabled`) if loading fails. Overlay: 86% ink below 64rem; from 64rem a gradient 92% → 86% (at 72%, beyond the widest hero text) → 50% at the right edge. Visible caption "Background: stock construction footage, not a BuildTrack project."
- **Showcase:** navy band; CSS laptop and phone frames around screenshots of the application-style demo (laptop: navy sidebar and light Overview workspace; phone: the real 390 px workspace with the Sections button); badge "Simulated platform demo"; copy states that the phone is this website and that there is no native app.
- **Capabilities (published version, ADR-029; replaced locally by the "drawn, then built" prototype in §13, awaiting review):** the four existing capability groups (Materials, Equipment, Deliveries, Reporting) stay; no group was added or removed, because these four match the platform's proposed scope and the demo's sections (Activity and Devices are supporting evidence inside them, not separate offerings). Each navy panel has a demo screenshot with a caption stating the view and that the data is fictional, a bold heading, one sentence and a link that opens that demo section (`/product-demo/#demo-panel-inventory`, `-equipment`, `-deliveries`, `-overview`). Live text-size changes (no resize or reload) re-measure available height, eligibility and travel: where pinning still fits, travel is updated and a focused panel link is moved back into view; where it no longer fits, the section stacks and the focused link is revealed below the measured header; returning to an eligible size pins again without scripted scrolling unless a panel link has focus.
  - **Desktop pinned mode (`.is-scrolly`):** from 64rem, without reduced motion, and only when the pinned block fits the space below the sticky header. The section becomes taller by exactly the track's horizontal travel (track width − viewport width, measured), its inner block sticks below the header, and the document's own scroll position inside the section moves the track 1:1 (`translate3d`). Scrolling up reverses it. The first panel starts fully visible; the last is fully visible before the section releases into the next one. No buttons, no horizontal scrollbar (`overflow: clip`), no wheel/touch/key capture. Panel width is `min(52rem, 62vw, (100vh − header − 16rem) × 2.1)` and the pinned heading and panel text are slightly more compact, so 1024×768, 1280×720, 1366×650, 1440×800, 1536×730 and 1920×950 viewports fit. Travel and fit are re-measured on resize, font loading and preference changes.
  - **Keyboard:** focus moving to a panel link jumps the page instantly to where that panel is fully shown (no smooth scrolling, no dead space); Shift+Tab works the same way; Tab after the last link continues into the next section.
  - **Fallback (default):** below 64rem, under reduced motion, without JavaScript, if a script fails, or when the block does not fit (short windows, enlarged text), the panels are an ordinary vertical stack (image and text side by side from 48rem); nothing is hidden or pinned.
- **Workflow (ADR-033, human-approved visual direction):** three large image-backed links on ink, readable navy gradient, two-digit step number, existing short title and one essential sentence; visible Explore this step cue, yellow hover/focus edge and restrained 1.035 image enlargement. Touch/no-JS content stays visible. Links to existing detailed steps: Record site activity -> `/how-it-works/#capture-events`; Monitor resources -> `#cloud-platform`; Review project information -> `#dashboards-decisions`. IDs added to detailed ProcessSteps only; content unchanged. Simulation/proposed-hardware and illustrative-stock disclosures retained.
- **Segments / "Who we serve" (ADR-034, local playback review awaiting owner approval):** compact irregular seven-media cluster, with the portrait moved inward and upper frames aligned smoothly. Natural full frames (six 16:9, one 9:16), fixed sizes per layout, shared 0.54-to-1 growth, native 300.65-degree turn with upright counterrotation; no per-frame packing. Final gradient-backed titles, approved modest hold/release and reversal retained. One audience at centre, no sidebar/selector/description directory/montage. Seven stock candidates now authorized for local playback review only, including active inspection/parked fleet alternatives; not final production assets. Optional muted looping inline H.264 playback, one native Pause/Play control, persistent explicit Pause, near/visible/document/preference gating and poster/refusal/error resilience. Static poster/title grid for mobile, short/enlarged text, reduced motion, Save-Data and no-JS; no automatic video downloads. Live focus/reading transitions preserved. Sources/licences: design/media-source/AUDIENCE_VIDEO_PROPOSAL.json; review: ignored design/references/audience-final-pose/REVIEW.md. Originals/captures excluded from deployment; only optimized runtime video/poster derivatives public. Focused final-pose and Home browser checks pass; earlier full-project results remain historical. Review/production manual gates unchanged.
- **Pricing:** open columns rendered from `pricing.ts` (tier label, name, `priceLabel`, `priceBasis`, positioning) under `pricingNote`, each with "Avail <plan>" → `/contact/?type=service&plan=<id>` (the same preselection as the Pricing page); "See pricing details" link kept.
- **Closing:** band over the stock photo (86% ink) with Request a Demo / Request a Quotation and a stock caption. Footer unchanged.
- Removed from Home (still on other pages or on `main`): capability strip and its Previous/Next controls (`strip.ts` deleted), problem cards, four-step process, demo stat tiles, outcomes, services grid and the coverage section (coverage remains in every footer). `HeroIllustration.astro` was deleted as orphaned.

### 11.3 Motion as implemented
- **Hero entrance:** CSS, four children, 600 ms each, delays 0/80/160/240 ms (ends at 840 ms); `:focus-within` cancels it. It runs only with JavaScript: an inline script sets `html.entrance-run` before the hero renders, so without JavaScript there is no entrance at all and nothing can replay when the preference changes. `src/scripts/reveal.ts` sets `html.entrance-done` once the entrance has finished or been cancelled, so it never replays.
- **Reveals:** `reveal.ts` (IntersectionObserver). The hidden start (opacity 0, translateY 20 px, 500 ms ease-out) applies only after setup (`html.reveal-ready`), never under reduced motion and never to blocks already on or above the screen; each block reveals once. Workflow steps stagger by 90 ms. Focus entering a hidden or fading block shows it instantly. Print shows everything.
- **Devices (`device-entrance.ts`):** live Ironcloud rise/right entrance inspected first; native Web Animations API, laptop 780ms (18px left/44px down, -3deg, 0.94 scale), phone follows after 280ms for 960ms (38px right/30px down, +5deg, 0.92 scale). Both settle to original readable layout; original screenshot proportions/disclosures retained. One-time IntersectionObserver trigger; live reduced motion cancels active animation instantly, restores final frames, and never replays. No JS/reduced motion shows final static devices.
- **Capability section:** published: scroll-linked horizontal movement on desktop only (§11.2); local prototype: scroll-linked drawing and reveal (§13). None under reduced motion.
- Otherwise only 150 ms button/link colour transitions and the video's 600 ms fade-in.
- **Hero reduced motion and autoplay, as implemented:** autoplay is attempted only at ≥ 48rem when reduced motion and Save-Data are off. Turning reduced motion **on** while the page is open: cancels a running hero entrance, shows every pending reveal at once, switches the capability section to the stack, switches the audience orbit to its complete static photo grid, and pauses automatic playback at once, including playback still loading (no automatic start follows when the response arrives; the control offers Pause while loading and Play afterwards). Turning it **off**: replays no entrance or reveal, restores the pinned capability section and audience orbit where they fit, and restarts autoplay only if the visitor has never used the video control. A visitor's own Pause or Play is never overridden in either direction (an explicitly started video keeps playing when reduction is turned on, because the visitor chose it).

### 11.4 Product Demo: application-style workspace (prototype, unreviewed)
- **Page (revised 2026-10-12, local, awaiting visual review; ADR-039):** the shared site header and top navigation stay, as on every page, and stay non-sticky here (`BaseLayout stickyHeader={false}`), so they scroll away and never cover the workspace. Below it the application leads: the former navy marketing intro and its "Launch interactive demo" link are replaced by a short introduction inside the workspace (H1 "Interactive Platform Demo", one sentence) and a fuller disclosure: "Simulated data" badge, "Demonstration data for illustration only. Fictional projects, quantities, suppliers and events; no live hardware is connected (no real construction site, QR/RFID hardware or IoT device). Snapshot as of ...". No website navigation is duplicated inside the workspace. Then "How to use this demo" and the CTA band. Scroll offset on this page is 0, so `#demo-app` and hash entry points align the workspace with the top of the window (the header scrolled off).
- **Application (`section#demo-app`, a named region, focus target of the Launch link):** full-width grid. **Sidebar** (navy with the quiet blueprint grid, 15rem from 64rem, the full height of the application, starting at the rendered bottom of the site header): "BuildTrack Platform demo", "Back to website", the six sections (Overview, Materials, Equipment, Deliveries, Activity, Devices; the internal ids `inventory` and `events` are unchanged) with a yellow bar and `aria-current` for the current one, and the persistent note "Simulated data. No live hardware is connected." **Workspace** (light): compact header (toolbar) with the section title (`aria-hidden`; the panel's own H2 stays for assistive technology and is visually hidden with JavaScript), project selector and Reset; the short introduction (H1) and the persistent disclosure described above; the status line; the panels. Simulate scan and its count moved into Activity. Metric tiles keep a white surface with a blue top edge; everything else is open (rules, readable bars, white table regions that scroll horizontally only). Light-background colour pairs from §2.2: primary blue for bars and focus, status colours `--color-success/warning/danger` and blue for info, "Simulated" badges as ink on yellow.
- **Sticky sidebar only when it fits:** `src/scripts/demo-layout.ts` sets `.sidebar-sticky` only while the sidebar's content fits the viewport, re-checked on resize and content size changes; otherwise it scrolls with the page. There are no nested vertical scroll areas in the page.
- **Mobile drawer (below 64rem, rem-based so it also applies to enlarged text):** below the site header (with its own Menu), the application's compact header has Sections and the section title, then project and Reset; the "Sections" button opens the sidebar as a modal drawer (`role="dialog"`, `aria-modal`, everything outside made `inert`, backdrop). Focus moves to the current section; Tab stays in the drawer (apart from the browser's own stop); Escape, Close, the backdrop or choosing a section closes it and returns focus to Sections; the drawer itself scrolls if it is taller than a short window. Without the layout script the sidebar is a static block above the workspace.
- **Stable entry points:** `/product-demo/#demo-panel-<section>` opens that section with the workspace at the top (re-aligned after load, because the browser's own fragment scroll can run later); unknown hashes are ignored; a hash change after load is announced in the status line so it never goes stale; nothing is announced on initial load. The URL is never written, so a plain reload resets; reloading a URL with a hash reopens that section (no scans or filters). Without JavaScript the hash jumps to the stacked section.
- **No JavaScript:** all six sections stacked with their visible headings; sidebar shows Back to website and the note; no toggle or controls.
- **Unchanged:** fixtures, calculations, project scoping, filters, empty states with Clear filters, five-scan limit, unchanged metrics after scans, Reset, announcements and keyboard behaviour; no storage, timers or data requests.

### 11.5 Demo screenshot capture
Recaptured 2026-10-12 from the revised application shell (§11.4; local build served from `dist/`) after the layout was stable (previously 2026-10-06); laptop and phone captured again after the site header was restored on this page (the four section crops were unchanged: no pixel differed by more than 7/255, so those files and the capability drawings were kept). Captured in Chromium with DevTools-protocol emulation: reduced motion on, scrollbars hidden, Inter loaded, device pixel ratio 2, no form or network interaction. Only plain viewport captures are used (capturing beyond the viewport resizes the page during capture and shifted the sticky sidebar and the workspace layout).

| File | Viewport | Region | State | Output |
|---|---|---|---|---|
| `demo-laptop.webp` | 1280×800 | the viewport at `/product-demo/#demo-app` (the non-sticky site header scrolled off) | Overview, all projects | 1280×800, WebP q80 (62,560 bytes) |
| `demo-phone.webp` | 390×844 mobile | the viewport at `/product-demo/#demo-app` (site header scrolled off) | Overview, all projects | 440×952, WebP q80 (39,744 bytes) |
| `site/website-contact.webp` (website screenshot, How It Works) | 1280×800 at DPR 2 | Contact page scrolled so the sticky header sits above "Send a request"; full viewport | empty form, nothing submitted; current build 2026-10-11 | 1280×800, WebP q80 (66,688 bytes; SHA-256 4f063bcd…a5872e6) |
| `demo-overview` / `-inventory` / `-equipment` / `-deliveries.webp` | 1280×800 | page scrolled to the toolbar; crop of the workspace content box plus 16 px each side, from 16 px above the toolbar, 4:3 | that section selected (status line shows the real announcement); Materials with the real "Low stock only" filter on. Since 2026-10-12 the crop includes the workspace introduction and disclosure, so less of each section shows (Equipment: five rows); Home's capability drawings were re-measured for these crops | 1088×816, WebP q78 (44-53 KB) |

Recapture procedure (after any demo change): (1) build and run the preview; (2) open `/product-demo/#demo-app` in Chromium/Edge DevTools with the device toolbar at the viewport above, DPR 2, "Emulate CSS prefers-reduced-motion: reduce"; (3) choose the section (and the Low stock only filter for Materials) with the demo's own controls; (4) take a normal viewport screenshot (not "full size") and crop to the region listed; (5) convert to WebP at the listed size and quality (sharp, Squoosh, Pillow or similar; 2026-10-12 used `design/references/demo-shell/capture.mjs` and `convert.py`, record in `screens-raw/capture-record.json`) and overwrite the file; (6) keep `width`/`height` in `src/pages/index.astro` equal to the output size, check that the "Simulated data" labels stay legible, update alt texts that name visible content, and re-check the capability drawings against the new crops (they are measured from them). Never edit the interface in a screenshot.

Audience playback follows ADR-034 eligibility independently of the hero: reduced motion or Save-Data always cancels/unloads audience videos immediately, including user-started/pending playback. Returning to an eligible layout resumes automatically only when explicit Pause/refused autoplay has not been set. Its shared control stays focusable but aria-disabled in static JS layouts; no-JS exposes posters/titles without a control.

## 12. Remaining-page redesign (2026-10-11)
Direction (ADR-035): less text, stronger visual storytelling; large images and purposeful demo screenshots; open layouts with rules rather than card containers; navy/ink and yellow accents; restrained, page-specific motion. Approval checkpoints are page by page; Solutions first.

### 12.1 Solutions (visual direction approved by the human 2026-10-11)
Supersedes §4.2's layout; §4.2's content requirements still apply.
1. Navy intro: eyebrow, H1 "Four capabilities. One view of every site.", one-sentence lead, 2×2 numbered jump links to the four capabilities, and a fanned stack of three demo screens labelled "Simulated platform demo" with a fictional-data caption.
2. Disclosure line: scanning, tags and readers are the proposed hardware concept; nothing is connected; the demo simulates the records.
3. Four capability rows (copy 5 / screenshot 7, alternating; stacked on mobile): number, icon and short label, H2 service name, summary, "The problem" with a yellow rule, all points, Request a Quotation (service preselected) and "See it in the demo" (section anchor). Screenshot caption: fictional sample data.
4. Supporting services on ink: four open columns with yellow top rules, icon, name, summary, quotation link; note that hardware, implementation and integration are quoted separately.
5. Who it serves: heading cell plus seven equal 4:5 photo tiles with name and need (4 columns desktop; 2 on phones; 1 with enlarged text); stock-photo credit.
6. CTA band.
Motion: one-time fan-out of the intro screens; copy fades up and each screenshot wipes in from its outer edge on first view (`reveal.ts`). Reduced motion and no JavaScript show the final layout.

### 12.2 How It Works (approved by the human 2026-10-11, including the prototype blueprint)
Three steps matching Home's workflow cards: Record, Monitor, Review. Home's anchors are kept: `#capture-events` (Record), `#cloud-platform` (Monitor), `#dashboards-decisions` (Review); `#tag-resources`, `#steps`, `#technologies` and `#reality` remain.
1. Navy intro: eyebrow, H1 "From site to decision in three steps.", one-sentence lead, and a three-node flow (icon, number, name, yellow connectors) that is also the page navigation. Connectors run from one circle's outer edge to the next (never through a circle), horizontally, or vertically when the flow stacks (narrow screens relative to the text size); revised 2026-10-12.
2. Steps (rail number / copy 5 / photo 6 on desktop; single column on phones): H3 title, summary, a status label (Record: proposed hardware, not connected, simulated in the demo; Monitor: proposed cloud platform, concept only, fixed sample data; Review: simulated in the demo), "Who is involved" and "In the demo" facts, and a demo-section link. Record also carries "First, tag resources" (QR labels, RFID tags or IoT devices) linking to the comparison. Photos are Home's workflow photos with a stock credit.
3. Technologies: the QR/RFID/IoT comparison stays a captioned table with row and column headers; on phones each row restacks into a block with visual labels (explicit table roles; labels have empty alternative text, so the real headers are announced).
4. Honest scope, "prototype blueprint" (approved 2026-10-11): navy with a subtle blueprint grid. Three marked parts, each with one sentence: **Working** (green label with check, real website screenshot `public/media/site/website-contact.webp` in a solid outline that draws once; published pages/navigation and, only when the form is rendered, the editable request form); **Simulated — fictional data** (half-filled-circle label, demo Overview screenshot in a solid light-blue frame; states that projects, figures, inventory, equipment, deliveries, events and device states are fictional and not connected to any hardware); **Concept only** (dashed-circle label, four dashed tiles with line drawings: operational cloud platform, QR/RFID/IoT hardware, native mobile app, production integrations; each tile labelled). A separate yellow "Still to come" notice lists `status.stillToCome` verbatim (published-site recipient delivery, still pending). A native `<details>` "View scope details" keeps all four original lists, each with its own marker (check only for working; dotted ring pending; half circle simulated; dashed circle concept). Phones: one column, square top-left screenshot crops for legibility, notice icon above text. Motion: screenshots fade in, the working outline and concept drawings draw once; nothing travels between hardware and dashboard; no JS / reduced motion show the complete static composition.
5. CTA band.
Motion: each step's rail line fills with its scroll position (CSS scroll-driven animation; full and static without support or under reduced motion); copy and photos reveal once (`reveal.ts`).

### 12.3 Pricing (approved by the human 2026-10-11)
Supersedes the Pricing layout in §4; all approved values come from `src/config/pricing.ts`.
1. Navy intro: eyebrow, H1 "Three proposed packages, in Philippine pesos.", and the required `pricingNote` in a yellow-ruled disclosure (icon above text on phones).
2. "Included in every plan": open two-column check list.
3. Packages: three open columns separated by rules, no card boxes, no highlighted plan. Rows align across plans with CSS subgrid (desktop): tier and name; large price (`formatPhp`, `/ month`, "per organization"); positioning; "Avail <plan>" and "Request a quotation" (Contact preselection `type=service|quotation&plan=`); Includes (cumulative "All X capabilities, plus:"); onboarding and support (replacement note); limits as large numbers. Phones: one column.
4. Comparison: unchanged table structure (caption, `scope="col"` plan headers, `scope="rowgroup"` group rows, `scope="row"` features, explicit `headers`). Included/Not included show decorative ✓ / – symbols (empty alternative text) beside the words. The caption text and group labels stay in view while the table scrolls; the feature column is pinned, narrower on phones, and unpinned when the screen is narrow relative to the text size (`max-width: 23.99em`) so whole words fit.
5. Fine print: limit definitions beside separately quoted items (neutral ring marker, not a check), then coverage and "not a payment, booking or active subscription".
6. CTA band. Motion: one-time fade-up reveals (`reveal.ts`) only; no counting animation.

### 12.4 About (approved by the human 2026-10-11)
References inspected 2026-10-11 (Linear, Stripe, Procore, Buildots About pages; links and notes in ignored `design/references/about-contact-redesign/REFERENCES.md`). Applied: split editorial statements, oversized type for the questions BuildTrack answers (not statistics), restraint over decoration.
1. Navy intro: H1 "Knowing what is on site, where it is and what comes next." beside a yellow-ruled academic disclosure (Technopreneurship course by a Civil Engineering student; website works, demo simulated, platform proposed) linking to `#real`.
2. Problem (`#background`): the approved site photo (`construction-wide-1280.webp`, credited) beside three oversized numbered questions from the approved background copy.
3. Proposal: heading left, statement and one explanatory paragraph right, links to Solutions and How It Works.
4. Mission and vision (`#mission-vision`) as large statements on ink, unchanged wording.
5. Coverage (`#coverage`): "Philippines-based" display type, "Based in Lingayen, Pangasinan" (city/province only), coverage statement and future-vision caveat from configuration.
6. What is real (`#real`, list block `#disclosure`): Working / Simulated / Proposed rows with the How It Works status markers; all five previous disclosure statements, with form wording from `disclosure()`; link to the prototype blueprint.
7. CTA band. Motion: one-time reveals only. No team, customers, history, office or achievements.

### 12.5 Contact (approved by the human 2026-10-11)
References inspected 2026-10-11 (Linear, Vercel, Stripe and Procore contact pages). Applied: the form dominates a quiet two-column split; supporting facts sit in a characterful but static side panel.
- Desktop: navy blueprint-grid panel (decorative element, `aria-hidden`) bleeding to the left edge behind the intro and details; form on the light page surface to the right. Phones: navy intro band, form, then navy details band (source order intro → form → details, so keyboard and screen readers reach the form first).
- Details: phone as large tel link, "Based in Lingayen, Pangasinan" (no street address or office), coverage and future-vision caveat, three numbered "What happens next" steps (wording unchanged; "Once the request form is connected:" when unconfigured).
- `InquiryForm` markup and behaviour unchanged (fields, required/optional labels, preselection, validation, error summary and focus, privacy text/status, submitting, retry, uncertainty, confirmation, native POST). One CSS-only addition: when the screen is narrow relative to the text size (`max-width: 22em`), the request-type marker sits above its label instead of overlapping long words.
- No motion. The unconfigured-provider branch keeps its notice and request-type list.

### 12.6 Consistency pass (2026-10-11; approved with the final redesign)
- 404: navy blueprint-grid panel filling the space above the footer; "Error 404" eyebrow, "Page not found", Go to Home and Contact BuildTrack, plus links to Solutions, How It Works, Product Demo, Pricing and About. Still `noindex` and served with status 404.
- Product Demo: intro gains the same radial highlight as other page intros; "How to use this demo" uses numbered-circle steps (two columns on desktop). Dashboard unchanged.
- Shared CTA band: heading steps down to `--text-xl` when the screen is narrow relative to the text size (`max-width: 22em`), so "Questions about BuildTrack?" no longer splits as "Question/s".
- Global: at that same narrow-relative-to-text condition, body text, links and buttons in `main` hyphenate instead of splitting words raw. How It Works' three-node flow stacks one step per row there. Pricing amounts are capped at `15vw` and never wrap.
- Header: focus is kept when enlarged or reduced browser text switches between desktop links and the Menu button (see `nav.ts`).

## 13. Home capabilities: "drawn, then built" (local prototype, 2026-10-12, awaiting visual review)
Status: local on branch `home-drawn-capabilities`, uncommitted; **not approved, not published**. The live site still shows the approved horizontal showcase (§11.2, ADR-029). Decisions: ADR-037. Implementation: `src/scripts/capability-stage.ts`, `src/pages/index.astro` (`#capabilities`).

- **Content:** unchanged: the four capabilities (Materials, Equipment, Deliveries, Reporting), each with number and label, title, one-sentence description, a demo link (`/product-demo/#demo-panel-inventory`, `-equipment`, `-deliveries`, `-overview`), the real demo screenshot and its "Fictional sample data" caption. The stage adds "Simulated platform demo" and, while any outline is visible, "Illustrative layout drawing".
- **Static (default):** an open list, every capability fully shown (image beside the text from 48rem). Used below 64rem, under reduced motion (also when it changes while the page is open), without JavaScript, after a failed start, at enlarged browser text (any default above 16 px, even where the pinned layout would fit) and in windows too short for the pinned layout.
- **Pinned (desktop):** the section intro and the "Explore all solutions and services" link scroll normally; only the track pins below the header: the capability list on the left, one stage frame on the right. Each description and demo link sits directly under its own heading (no repeated heading inside it, no detached slot); only the active capability's description is open. Closed descriptions have no height but stay in the tab order and the accessibility tree; each is a group named "<label>: <title>". Opening is instant with a 200 ms fade; the column keeps the height of its tallest open state, so the stage never moves. Fits common laptop content areas: 1024×700, 1280×600, 1280×720, 1366×650, 1440×790, 1536×730, 1440×900 and larger, without smaller text. Pinned track length: 3625 px at 1366×650 and 4007 px at 1440×900 (previously 2826 and 3507).
- **"Drawn, then built" (progression uses its own `data-cap-windows` attribute, never the entrance reveals' `data-reveal`, whose 500 ms transition had smoothed and delayed it; pacing revised 2026-10-12 after the human's review of a recording: the screenshot arrived after too little scrolling):** each screenshot's illustrative drawing is outlines of that demo screen's own regions, measured from the screenshot (title and project picker, simulated-data notice, filters, chips or summary cards, bars or table), split into 4-5 horizontal bands that tile the screen; 21-31 paths per screen, no text glyphs. Each capability gets 760-900 px of scroll (about one screen). Within it, the outlines draw one after another in reading order over the first ~40% (each over 7% of the segment, about four in progress at once); each band of the real screenshot is revealed by a soft top-to-bottom sweep, eased at both ends, from just before its first outline completes until 32% after its last one does, while its outlines and faint schematic fade; every band is revealed by 75%, and the exact screenshot holds for the last quarter. Construction now takes about 570-600 px of scrolling instead of about 270-330. A faint copy of the drawing is visible from the start. Everything follows the scroll position (no time-based smoothing, no wheel handling), so it stops when scrolling stops, reverses when scrolling up, and fast scrolling may skip stages; the finished screen fades out as the next capability's drawing begins. Keyboard focus jumps to the middle of the hold (87% of the segment), so it always shows the finished screen.
- **Keyboard and focus:** Tab and Shift+Tab reach every demo link; keyboard focus jumps instantly to that capability's finished screen with its description open. Pointer focus (click, Ctrl+click) never moves the page. A hidden link is never left focused: when scrolling or a layout switch changes the shown capability while a capability link has focus, focus moves first to the shown capability's link (without scrolling), so Enter opens what is shown. Layout switches (reduced motion, viewport, browser text size) follow focus only while it is engaged (placed by the keyboard or on screen at the last scroll); otherwise a visitor reading inside the section stays on the same capability, and anyone elsewhere stays where they are.

## 14. Shared header: moving navigation indicator (local prototype, 2026-10-12, awaiting visual review)
Status: local on `home-drawn-capabilities`, uncommitted; **not approved, not published**. Decisions: ADR-038. Implementation: `src/components/site/Header.astro`, `src/scripts/nav.ts`.

- **Desktop (from the 75rem header breakpoint, with JavaScript):** one yellow indicator (3 px) under the current page's link text replaces the static current-page marker. Hovering another link turns its text yellow and moves the same indicator under it (250 ms, transform only); when the pointer leaves, it returns to a keyboard-focused link if there is one, otherwise to the current page. Keyboard focus gives the same yellow text and indicator, and takes over from a pointer that is merely resting on a link; the yellow focus outline is unchanged and independent of the indicator. Routes without a matching link (404) show the indicator only on hover or focus. `aria-current` stays on the actual route. Under reduced motion the indicator moves at once.
- **Spacing:** links gain 0.5rem side padding (wider pointer targets, e.g. Home 48 → 64 px) while the gap between them shrinks from 1.5rem to 0.5rem, so the text spacing is unchanged; the navigation is 16 px wider in total and still fits one line at the 75rem breakpoint (96 px to spare at 1200 px).
- **Unchanged:** the mobile menu (its left-bar current marker, keyboard access, Escape and focus return), the no-JavaScript header (static current-page underline, yellow text and underline on hover), the breakpoint, sticky-header measurement and anchor offsets, and live text-size focus handling. Geometry is re-measured only on resize, font loading and layout changes (ResizeObserver), never while idle.

## 15. Shared blueprint grid (local, 2026-10-12, awaiting visual review)
Decision: ADR-040. Tokens in `src/styles/tokens.css`: `--blueprint-grid` (pale-blue `#7dd3fc` lines: major every 120 px at 10% opacity, minor every 24 px at 4%; from How It Works' prototype blueprint), `--blueprint-grid-quiet` (5.5% / 2.5%) and `--blueprint-grid-size`, layered first over a surface's own colour and glow. Applied to navy/ink background surfaces: page intros (Solutions, How It Works, Pricing, About), How It Works' prototype blueprint, Solutions' supporting services, About's mission and vision, Contact's navy panels, 404, Home's showcase, workflow and "Who we serve" sections, the CTA band, the dark `Section` tone and the footer; the quiet version on the site header (and its mobile menu panel) and the demo sidebar. Not applied to the Home hero (video), the photo-backed closing band, light surfaces, forms, tables, charts, screenshots or video. Static, never animated. Text contrast is unaffected in practice (lines at 10% or less over navy/ink).

## 16. Concrete estimate and payment demo (local, 2026-10-12, awaiting visual and independent technical review)
Decision: ADR-041. Owner authorization to build is not Civil Engineering validation or provider eligibility; CE validation, provider eligibility, hosted banking and both Formspree gates remain pending.
- **Concrete estimate (Product Demo, sidebar "Tools"):** opens like a section (toolbar title, `aria-current`, `#demo-panel-estimate`); the project picker is hidden there. Badge "Academic calculation"; `src/lib/concrete-estimate.ts`; docs/PROPOSALS_ENGINEERING_PAYMENT.md §A. One rectangular element, one batch mixer. Inputs with units, ranges and hints, plain numbers with at most six decimal places: length and width 0.1-100 m, depth 0.05-3 m, optional waste allowance 0-20% (the visitor's assumption), mixer output per batch 0.05-3 m³ (rated mixed output, not drum volume), cycle time 1-60 min. Calculate validates with an error summary (focused, linked to fields) and per-field messages. **Exact arithmetic:** inputs are exact decimals and every step is computed exactly, so a genuine remainder always adds a batch, an exact multiple never does, and the final batch is never more than the rated output. Results show volumes to 0.001 m³ and time to the minute; "≈" marks a rounded figure and "< 0.001 m³" a positive volume smaller than that, with a legend; the four-line breakdown shows operands as entered and exact results. Notes: the constant-cycle assumption including the final partial batch (pending CE review, not a physical rule, not shown to be conservative), "idealized", output is not drum volume, truck/continuous mixers not modelled, no cement bags or other materials, tracking figures unchanged. The last calculation stays while the visitor switches sections (reopening announces "with the values last calculated"); Reset or reload restores the example. Without JavaScript the example's result is shown and the fields are read-only.
- **Payment demo (website page `/payment-demo/`, shared header and footer, not in the main navigation; linked from Pricing as "Try the payment demo"):** navy intro ("Payment demo", H1 "How a quotation could be paid.") and a persistent notice above every step: **"Academic payment demonstration — no real charge."** Fictional quotation (Q-DEMO-0001, "Sample Client Builders (fictional)", Professional plan first month at its proposed academic price, "illustrative only; nothing will be charged") → Accept (simulated) or Decline → Card (simulated) or Bank transfer (simulated), with the explanation that card details belong only on a provider's own page and no bank details or transfer instructions are given → Simulate success, failure or cancellation (or Back) → a result that says "Simulated ...", "No money moved" and "Not a payment record". "Start over" and "Start again" return to the quotation, as does a reload. No input fields, forms, card/CVV or bank fields, account details, QR codes, uploads or payment records; independent of the inquiry form (Pricing's Avail and quotation links still open Contact). Focus moves to each step's heading; each step is announced in a polite status. Without JavaScript the quotation, notice and sandbox box are shown with a note.
- **Provider sandbox (on the payment demo page):** with no verified link (the default) **"Provider sandbox not connected."**, with an explanation that a provider-hosted test checkout can be linked only after the owner verifies one; eligibility and bank channels are not confirmed and live payments are outside this prototype. A link appears only for a supported provider (PayMongo) whose URL, parsed structurally, is exactly `https://pm.link/{handle}/test/{reference}` (no credentials, port, query or fragment; look-alike hosts, live routes, localhost and IP addresses rejected) and which the owner marked as verified test mode; it says its result is not proof of payment.
- **Sidebar focus:** sidebar links and buttons have `scroll-margin-block` so the complete focus outline stays visible when focus scrolls them into view in short windows and in the drawer.
- **Public wording:** How It Works and About list the estimate as working (not yet reviewed by a civil engineer) and the payment demo page as simulated with no payment provider connected (`src/lib/disclosures.ts`).
