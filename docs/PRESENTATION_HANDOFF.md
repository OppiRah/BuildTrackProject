# BuildTrack Presentation Handoff

Prepared 2026-10-05; updated 2026-10-13 for the approved academic review version. Public address: https://buildtrack.sunnydelacruz.workers.dev/

**Which version this describes.** The owner authorized publication of the current academic review version on 2026-10-13, including the slower drawn capabilities, shared navigation, revised demo shell, concrete estimator with CE validation pending, and disconnected payment simulation. This supersedes the 2026-10-11 redesign walkthrough. The exact manifest and publication/live verification are recorded in `docs/PUBLICATION_MANIFEST.md` and `docs/PROJECT_STATE.md`. Recipient verification and a production test request remain pending (section 3).

BuildTrack is an **academic business proposal**. The website is real and public. The request form is connected to a real form service. The BuildTrack platform, hardware tracking and dashboard data are **proposed or simulated**. Say this early and plainly. The site says it too.

## 1. Five-minute walkthrough

| Time | Route | What to do and say |
|---|---|---|
| 0:00–0:50 | `/` (Home) | Read the headline and the "Academic review version" label. Scroll slowly: the laptop and phone show the demo (fictional data); each capability's screen is gradually drawn as an outline and built into the demo screenshot as you scroll, with its description beneath its heading; Tab jumps straight to the finished screen; the three photo cards (Record, Monitor, Review) each open their step on How It Works; **Who we serve** turns and enlarges seven stock videos with native scrolling, one per audience. Point to the "Illustrative stock footage" line and the **Pause videos** button. |
| 0:50–1:40 | `/how-it-works/` | Three steps: **Record** (tag resources with QR, RFID or IoT, then scan), **Monitor**, **Review**. Each step says whether it is proposed hardware, a concept or simulated. Show the QR / RFID / IoT comparison. Scroll to the **prototype blueprint**: green **Working** (this website), blue **Simulated** (the demo), dashed **Concept only** (platform, hardware, app, integrations) and the yellow **Still to come** notice. Open **View scope details** to show the full lists. |
| 1:40–3:00 | `/product-demo/` | Below the usual website header, the demo opens as the application: its sidebar (on a phone, **Sections**) switches sections, and **Back to website** is at the top of the sidebar. Read the "Demonstration data" notice aloud. On **Overview**, change **Project** to "Sample Bridge Rehabilitation", then back to "All sample projects". Open **Materials** and **Equipment** and use a filter. Open **Activity**, press **Simulate scan** once or twice (limit 5), then **Reset**. Say: "Nothing is stored or sent. This is what the dashboard *would* look like." |
| 3:00–3:45 | `/pricing/` | Read across the three columns: Starter ₱2,990, Professional ₱7,990, Enterprise ₱19,990 per organization per month, with their inclusions, onboarding and support, and limits in large numbers. Show the comparison table (✓ Included, – Not included) and the **Separately quoted** list. Point to the disclosure at the top: proposed academic pricing, no subscription is activated. |
| 3:45–4:30 | `/pricing/` → **Avail Professional** → `/contact/?type=service&plan=professional` | The form opens with "Avail a Service" and "Professional" chosen, and both can still be changed. The phone number, location (Lingayen, Pangasinan) and coverage are in the navy panel. Press **Send service request** with the fields empty to show the error summary. **Do not submit** unless the production test below has passed and you mean to send a real request. |
| 4:30–5:00 | `/about/` | The three site questions BuildTrack starts from, the proposal, mission and vision, Philippines coverage, and **What is real and what is proposed**. Close by saying what is real and what is proposed. |

**Optional extra minute (academic review version, publication authorized):** in the Product Demo sidebar, under **Tools**, open **Concrete estimate**, change Length to 10 and press **Calculate** (21 batches, 2 h 6 min); point to the exact breakdown and the assumption note, and say "a working calculation for teaching; a civil engineer has not reviewed it yet". Then go to **Pricing**, choose **Try the payment demo** (`/payment-demo/`) and follow section 3a. The **Avail** buttons on Pricing still send ordinary requests through Contact.

Use a phone too if you can: below about 1200 px wide (or with enlarged browser text) the navigation becomes a **Menu** button. On phones and with reduced motion, Home shows the audiences and capabilities as simple lists instead of moving sequences.

## 2. The technology in plain language

- **Astro** is the tool that builds the website. You write pages once, and Astro turns them into ordinary HTML files ahead of time ("static site"). No server program runs while people browse.
- **TypeScript** is JavaScript with type labels. It powers the interactive parts (menu, demo, form) and catches mistakes such as a misspelled field before the site is built.
- **CSS** controls the look: colours, spacing, fonts and the mobile layout. Shared colours and sizes live in one "tokens" file, so the brand stays consistent.
- **GitHub** stores the source code and its full history (repository `OppiRah/BuildTrackProject`, private). Every saved change is a "commit".
- **Cloudflare** hosts the site. When a commit reaches the `main` branch on GitHub, Cloudflare (Workers Builds) builds the site and publishes it, usually within a minute. It also provides HTTPS (the padlock) and the `workers.dev` address.
- **Formspree** is a third-party form service. The site has no server of its own, so Formspree receives each request and emails it to the BuildTrack contact. The recipient address is set in the Formspree account, not in the code.

## 3. What genuinely works vs. what is simulated

| Genuinely works | Simulated / fictional | Concept only (not built) |
|---|---|---|
| Public website at an HTTPS address, 7 pages + a 404 page, desktop and mobile | The four sample projects and all their figures | The cloud platform that would collect real site data |
| Navigation, mobile menu, keyboard access, reduced-motion and enlarged-text layouts | Inventory, equipment, deliveries, tracking events and device states | Real QR/RFID/IoT hardware tracking |
| Links that preselect the request type, service or plan on the Contact form | "Simulate scan" (adds a fake event in the browser only; reset on reload) | Mobile app, accounts, logins, payments and subscriptions |
| Form validation, error messages and confirmation | Payment demo: quotation, email previews, checkout and result (no money or email; section 3a) | Integrations with other business systems |
| Sending the request to Formspree (connected; see the delivery status below) | | |

Delivery status: a labelled **local test** request was received by the contact on 2026-10-04. A test request sent **from the live website** has **not** yet been confirmed as received. Until it is, say "connected, and tested locally", not "proven to deliver".

### 3a. The payment demo: what works, what is simulated, and the real future process

*Approved by the owner for publication on 2026-10-13 (ADR-042).*

**What works:** the page itself, its seven steps, the buttons, keyboard use, focus moving to each step and the restart. It runs entirely in your browser.

**What is simulated:** everything about money and email. Nothing is collected, charged, emailed or verified, and no payment provider is connected. The notice says so on every step: "Academic payment demonstration — no real payment or email is sent."

**How to show it (about one minute):**
1. **Sample quotation.** The navy **Owner step** label means BuildTrack prepares it. Point to the reference, service and illustrative price. Press **Preview the quotation email**.
2. **Quotation email preview.** Say: "This is the email BuildTrack would send; nothing is sent." Press **Continue as the customer**.
3. **Customer decision.** The yellow **Customer step** label means the customer decides, not BuildTrack. Press **Accept quotation (simulated)**. Declining ends the process with no payment invitation.
4. **Payment invitation email preview.** A real email would contain a payment link; this sample has none.
5. **Payment method.** Choose **Card (simulated)**.
6. **Fictional checkout.** Say: "A real payment provider would show this page; we never handle card details." Press **Simulate failure**, then **Start again**.
7. **Result.** Run it again to **Simulate success**. Read the line "Simulated—no money moved. Not a payment receipt."

**How the real process would work in future (not built; it needs a separate decision):**
1. A customer sends a request through the Contact form. This part is real today.
2. The owner prepares a quotation and emails it from their own email account.
3. The customer accepts by replying to that email.
4. The owner creates a payment link in a payment provider's dashboard, for example PayMongo, and emails it to the customer.
5. The customer pays on the provider's own secure page by card or online banking. BuildTrack never sees card or bank details.
6. The owner confirms payment in the provider's dashboard. A screenshot, a return to the website or a customer's message is never proof.

This needs a provider account, the owner's identity verification, and business registration documents (DTI and BIR) before live payments. That is why it was deferred for this academic project. No backend, database or automatic emails would be needed for this manual version.

## 4. How an inquiry reaches the recipient

1. A visitor fills in the form on `/contact/`. The browser checks the required fields first.
2. The browser sends the fields directly to Formspree (`https://formspree.io/f/mljgrgjr`). The BuildTrack website never stores them.
3. Formspree checks the request for spam. A hidden "honeypot" field catches simple bots.
4. If Formspree accepts it, the page shows **Request submitted**. This only means Formspree received it.
5. Formspree emails the request to the address registered in the Formspree account, with the visitor's email set as Reply-To. The contact replies from their own email or by phone.

Things that can stop the email even after "Request submitted": the free plan's 50 submissions per month (later ones are stored without being emailed), the spam folder, or Formspree spam filtering. This is why a successful screen is not proof of delivery; the contact must see the email.

## 5. Where to edit content

Edit files under `src/`. After you commit and push to `main`, Cloudflare rebuilds and republishes the site.

| What | File |
|---|---|
| Location, phone, coverage, customer segments | `src/config/business.ts` |
| Plan prices, limits, inclusions, exclusions, pricing disclosure | `src/config/pricing.ts` |
| Service names and descriptions | `src/config/services.ts` |
| Site name, tagline, page titles and descriptions, live URL | `src/config/site.ts` |
| Form endpoint, request types, privacy wording | `src/config/inquiry.ts` |
| "What is real" wording on About and How It Works (working and still-to-come items) | `src/lib/disclosures.ts` |
| Page text (headlines, problem questions, mission, vision, step and capability descriptions) | `src/pages/*.astro` (e.g. `index.astro`, `about.astro`, `how-it-works.astro`) |
| Home audience videos and posters; workflow and audience photos | `public/media/home/` (sources and licences: `design/media-source/`, `design/home-visual-samples/`) |
| Website screenshot on How It Works | `public/media/site/website-contact.webp` (how it was captured: `docs/UX_BRAND.md` §11.5) |
| Demo sample data | `src/data/demo/fixtures.ts` |
| Payment demo steps and wording | `src/components/payment/PaymentDemo.astro`, `src/lib/payment-walkthrough.ts` |
| Colours, spacing, fonts | `src/styles/tokens.css`, `src/styles/global.css` |
| Logo in the header and footer | `src/components/site/Wordmark.astro` uses `public/buildtrack-mark.webp`, the emblem cut from the owner's original `design/BuildTrackLogo.jpeg`. To change it, replace the image with one of the same proportions, or ask the developer to re-crop from a new original. |

Run the tests after any change (next section). Some tests check that prices, labels and disclosures stay consistent, so a test can fail on purpose after a price change. Update the matching test, or ask the developer to.

## 6. Download and run the source

The repository is private, so you need access first: the owner invites your GitHub account, or sends a ZIP made with **Code → Download ZIP**.

Requirements: **Node.js 24** (https://nodejs.org, LTS 24.x) and Git.

```sh
git clone https://github.com/OppiRah/BuildTrackProject.git
cd BuildTrackProject
npm ci            # install the exact dependency versions from package-lock.json
npm run dev       # local site with live reload at the address it prints (usually http://localhost:4321)
```

Other commands:

| Command | Purpose |
|---|---|
| `npm run build` | Build the final site into `dist/` (what Cloudflare publishes) |
| `npm run preview` | Serve the built `dist/` locally |
| `npm run check` | Type and template check (should show 0 errors) |
| `npm test` | Unit tests (180 should pass) |
| `npm run test:browser` | Browser tests: 21 inquiry-form scenarios (form-service responses mocked; nothing is sent), then 55 standard UI scenarios (Home, demo, navigation, payment demo). Setting the optional `EVIDENCE_DIR` folder adds two screenshot-capture scenarios, so the UI count becomes 57. Needs `CHROME_PATH` set to a Chromium that plays H.264 video (see `docs/ARCHITECTURE.md` §8) |
| `npm run check:release` | Release checklist: automated values, the two open manual gates, and recorded approvals |

Do not submit the form from `npm run dev` unless you intend to: the local site posts to the real Formspree endpoint.

## 6a. Quotation workflow (built and tested locally; not live)

The owner approved a small backend for real quotation requests (ADR-043). It is **built and tested on the developer's computer only**. It is switched off, and the public site does not use it. If asked, explain it like this:
1. A customer fills in the quotation form. The request is stored in a Cloudflare database, and BuildTrack gets an email.
2. BuildTrack opens a private owner page (protected by a Cloudflare login), prepares the quotation and approves it. The customer gets an email with a private link.
3. The customer opens the link, accepts or declines, and can try a **simulated** checkout. No money moves, ever.
4. The owner can withdraw a link, send a new one, dismiss a request or delete it. Records are deleted automatically 90 days after the last activity.

It is not live because it needs:
- the owner's Cloudflare and email-service setup;
- a verified sending domain;
- approval of the privacy wording;
- a controlled test (docs/QUOTATION_RUNBOOK.md).

An email that has already been sent cannot be taken back; withdrawing only stops its link from working.

## 6b. Academic quotation demo (public; browser-only)

The website's quotation buttons lead into the **academic demo**: Home and Pricing "Request a Quotation" (a plan's link carries the plan), and on Contact the **Request a quotation — academic demo** box (it carries `?service=` and `?plan=`). Contact's own request form stays real (Formspree). Record in one browser window; the demo uses three tabs that update each other.

**Recording steps** (start at `https://buildtrack.sunnydelacruz.workers.dev/`):
1. **Tab 1, website.** On Home, click **Pricing** in the menu. Under **Professional**, click **Request a quotation**. The quotation form opens with Plan of interest: Professional.
   - Choose **Service of interest: Delivery monitoring** and a **Sample customer** (for example Jose Reyes). The sample details fill in; they are fictional.
   - Tick **I understand this is an academic demo…**, then click **Send demo quotation request**.
   - "Quotation request received (academic demo)" shows the reference, service and plan. Click **Open demo owner dashboard** (a new tab).
   - Alternative start: Home → **Contact** → **Request a quotation — academic demo**.
2. **Tab 2, Demo owner dashboard** (it represents Sunny's review and approval). Click the request reference (DEMO-R-0001). The scope and amount are prefilled from the plan and service; edit them if you like.
   - Click **Save draft and review**, then **Approve quotation**.
   - Click **Open demo customer invitation** (a new tab). It represents the link that would be emailed; no email is sent.
3. **Tab 3, customer quotation.** The summary shows the service, plan, scope and amount. Click **Accept quotation**, then **Yes, accept this quotation**.
   - Choose **Card — demo** or **Bank transfer — demo**, click **Use sample code**, **Continue**, then **Complete demo payment**.
   - **Demo confirmation** shows "Simulated—no money moved. Not a payment receipt."
   - Switch to tab 2: it shows "accepted" and the simulated result, never paid.
4. To record again: in tab 2, **All requests** → **Reset demo data**. Tab 1's **Send another demo request** starts a new request.

Reloading any tab keeps its place (request received, the open request, the quotation). How to explain it: "This is an academic demonstration of the workflow. The customers are fictional, everything stays in this browser, and no request, email or payment is real. Approval and email delivery are demonstrated." Do not call it a live quotation service.

## 7. Current limitations

- Delivery of a request sent **from the live site** is not yet confirmed (see section 8).
- Home's seven audience clips are licensed Pexels stock footage, approved for publication on 2026-10-11. Each is a four-second loop with a visible cut; they are illustrative, not BuildTrack customers or projects.
- Pricing, plan contents and limits are a proposal and have not been validated with customers.
- The demo data is a fixed, fictional snapshot (28 Sep 2026, 8:00 AM). It does not change over time and saves nothing.
- No live hardware, platform backend, accounts or real payments exist. The estimator is a teaching calculation pending CE review; the payment page is an explicitly labelled simulation.
- The logo was supplied as a JPEG with a white background and no transparency. The site shows only its emblem, because the lettering and tagline are unreadable at header size; on the dark footer the emblem sits on a white tile. The browser-tab icon and the link-preview image still use the earlier designs, because the logo is unreadable at icon size. A vector (SVG) or transparent PNG version would allow a cleaner result.
- The address is a free `workers.dev` subdomain. A custom domain would need to be bought.
- Formspree's free plan allows 50 submissions per month.
- Testing has used Chromium-based browsers, automated accessibility checks, simulated mobile widths and enlarged browser text (up to 32 px). It has not covered Firefox/Safari, real phones, real touch scrolling, screen readers or browser zoom.

## 8. Likely questions and honest answers

- **"Is this a real company? Do you have customers?"** No. It is an academic business proposal. There are no customers, deployments or partners, and the site says so on every page.
- **"Is the dashboard live?"** No. It uses fictional sample projects to show how the proposed platform would present data. No site or device is connected.
- **"Does the form actually work?"** It is connected to Formspree and was tested locally, and the contact received that test. *(Only after the production test passes:)* A test sent from the live site was also received on <date>.
- **"Where is my data stored?"** The website stores nothing. Formspree receives the request and emails it to the BuildTrack contact. Formspree keeps submissions in its dashboard under its own policy.
- **"Can customers pay online?"** No. The payment demo shows the proposed process with sample emails and a fictional checkout; nothing is charged or sent. Real payments would go through a payment provider's own page and were deferred because they need a provider account, identity verification and business registration (section 3a).
- **"How did you choose the prices?"** They are a proposal informed by public pricing of comparable tools (Sortly, Fieldwire, EZOfficeInventory). They are not a currency conversion of those prices and have not been validated with Philippine customers.
- **"Why is Enterprise labelled 'Custom' when it has a price?"** "Basic / Advanced / Custom" are the capability tiers from the business plan. Enterprise has a proposed starting price, and anything beyond its limits is quoted separately.
- **"What would QR, RFID and IoT each do?"** QR labels are scanned up close with a phone. RFID tags are read without line of sight, for example at a gate. IoT devices report location or status by themselves. See the table on How It Works.
- **"How much would hardware cost?"** It is not priced. Hardware, installation and integration are quoted per project.
- **"Who built the website, and how is it hosted?"** It is built with Astro (a static-site builder), hosted on Cloudflare and published automatically from GitHub. It has no server or database of its own.
- **"What would it take to make it real?"** A backend platform with accounts and a database, hardware pilots on a real site, a mobile scanning app, and customer validation of pricing.
- **"Could it expand beyond the Philippines?"** Southeast Asian expansion is stated as a future vision only. Current proposed coverage is the Philippines.
