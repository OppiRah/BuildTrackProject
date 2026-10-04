# BuildTrack UX & Brand

Status: Phase 2 specification, 2026-10-04, revised after independent review. The human approved the color direction and self-hosted Inter for foundation work; rendered layouts are not yet reviewed or accepted. Logo artwork is provisional (text wordmark only). Contrast ratios below are calculated (WCAG 2.x relative luminance), not measured in a browser.

## 1. Identity
Keep BuildTrack and "Smart Construction. Smarter Delivery." Construction + technology + logistics + data. Modern, professional, clean and credible. The blue/yellow direction takes priority over the BMC's green palette. The final logo treatment is open; preserve the concept and do not present an unapproved mark as final.

Proposed logo direction (pending review): a "BuildTrack" wordmark in the brand font, 700 weight, with "Track" in primary blue on light backgrounds and accent yellow on dark ones, plus a simple geometric mark (a stacked-beam/location-pin hybrid) as an inline SVG. Phase 4 may ship the wordmark only until a mark is approved.

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
- Light: white bg, bottom border `--color-border`. Sticky at top on desktop and when JavaScript has enabled the collapsible mobile menu; **not sticky in the no-JS mobile fallback**, where the wrapped link list is tall enough to cover in-page targets such as the skip-link destination.
- Desktop (≥ the measured header breakpoint, see below): wordmark left; seven links (Home, Solutions, How It Works, Product Demo, Pricing, About, Contact) right-aligned; "Request a Demo" primary button (→ `/contact/?type=demo`) at far right. Current page: `aria-current="page"`, 600 weight, 3px primary-blue underline.
- Below the breakpoint: wordmark left; "Menu" button (icon + visible text) right, `aria-expanded`, `aria-controls`. Opens a full-width panel under the header with links stacked (each 48px tall) and the CTA button last. The panel's height is capped to the space below the header and scrolls internally, so all items remain reachable on short/landscape viewports. Escape closes it and returns focus to the Menu button; activating a link navigates. Not a modal: no focus trap, no scroll lock.
- Breakpoint: determined by the header fit check (`ARCHITECTURE.md` §3.1): the desktop header is used only where wordmark + seven links + CTA fit on one line. Measured value is recorded here in Phase 3.
- **Measured 2026-10-04 (headless Chromium):** one-line header needs 1,054 px with Inter and 1,028 px with the fallback stack (including gutters), so 64rem (1,024 px) fails. **Desktop header from 75rem (1,200 px)**; Menu button below that, including at 1024 px. Re-measure if nav labels or the CTA change.
- No-JS: the Menu button is hidden and the link list wraps visibly below the wordmark.
- First focusable element on every page: "Skip to main content" link, visible on focus.

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
1. Page header: H1 "Solutions", lead, no CTA.
2. Four capability sections: Materials & inventory; Equipment tracking & utilization; Delivery monitoring; Project dashboards & analytics. Each: H2, problem it addresses, what the proposed platform does (3–4 bullets), a figure (photo or demo screenshot labelled "Sample data"), button "Request a Quotation" with that service id. Desktop: alternating text 6 / media 6; mobile: text then media.
3. Supporting services: hardware deployment, onboarding & training, custom integration, maintenance & support. Four cards, each with a quotation link. Note: hardware/implementation/integration quoted separately.
4. Who it serves: seven segments, each with one line on how they would use BuildTrack (equal grid as Home).
5. CTA band.

### 4.3 How It Works (`/how-it-works/`)
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
| `src/components/graphics/SamplePanel.astro` | Original SVG created for this project; illustrative shapes, captioned "illustration, not real data" | Project-owned |
| `src/components/site/icons.ts` (line icons) | Original paths drawn for this project | Project-owned |
| `public/favicon.svg` | Original provisional "B" mark | Project-owned; provisional pending logo |
| `design/og-image.svg` → `public/og-image.png` (1200×630, 184 KB) | Original; rendered with headless Chromium using the self-hosted Inter | Project-owned; contains Inter glyphs (OFL permits embedding in documents/images) |
| `public/fonts/InterVariable-latin.woff2` | Inter 4.1 official release (github.com/rsms/inter, `web/InterVariable.woff2`), subset to Latin + ₱ with fontTools | SIL Open Font License 1.1; notice kept in `public/fonts/OFL.txt`, Copyright (c) 2016 The Inter Project Authors |

No photography is used yet. Phase 4 uses original vector graphics instead of stock photos so no third-party image licences are involved; licensed construction photography can be added later and logged here.

## 10. Copy integrity
Describe the operational platform as proposed. Explain the academic prototype clearly without overwhelming every paragraph. Use "Interactive Platform Demo" and "Demonstration data shown for illustration purposes." Do not claim live QR/RFID/IoT tracking. Prices are proposed academic pricing. Never invent international coverage, customers, offices, partners or measured results. Draft headlines in this document are proposals for owner review.
