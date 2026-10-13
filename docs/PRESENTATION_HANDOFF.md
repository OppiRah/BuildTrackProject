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

**Optional extra minute (academic review version, publication authorized):** in the Product Demo sidebar, under **Tools**, open **Concrete estimate**, change Length to 10 and press **Calculate** (21 batches, 2 h 6 min); point to the exact breakdown and the assumption note, and say "a working calculation for teaching; a civil engineer has not reviewed it yet". Then go to **Pricing**, choose **Try the payment demo** (`/payment-demo/`): read the notice "Academic payment demonstration — no real charge", press **Accept quotation (simulated)**, **Card (simulated)**, **Simulate failure**, then **Start again** and run it to **Simulate success**; say "nothing is charged; no payment provider is connected", and point to "Provider sandbox not connected." The **Avail** buttons on Pricing still send ordinary requests through Contact.

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
| Form validation, error messages and confirmation | | Integrations with other business systems |
| Sending the request to Formspree (connected; see the delivery status below) | | |

Delivery status: a labelled **local test** request was received by the contact on 2026-10-04. A test request sent **from the live website** has **not** yet been confirmed as received. Until it is, say "connected, and tested locally", not "proven to deliver".

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
| `npm test` | Unit tests (142 should pass) |
| `npm run test:browser` | Browser tests: 21 form scenarios, then 33 Home/demo/navigation scenarios; needs `CHROME_PATH` set to a Chromium that plays H.264 video (see `docs/ARCHITECTURE.md` §8) |
| `npm run check:release` | Release checklist: automated values, the two open manual gates, and recorded approvals |

Do not submit the form from `npm run dev` unless you intend to: the local site posts to the real Formspree endpoint.

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
- **"How did you choose the prices?"** They are a proposal informed by public pricing of comparable tools (Sortly, Fieldwire, EZOfficeInventory). They are not a currency conversion of those prices and have not been validated with Philippine customers.
- **"Why is Enterprise labelled 'Custom' when it has a price?"** "Basic / Advanced / Custom" are the capability tiers from the business plan. Enterprise has a proposed starting price, and anything beyond its limits is quoted separately.
- **"What would QR, RFID and IoT each do?"** QR labels are scanned up close with a phone. RFID tags are read without line of sight, for example at a gate. IoT devices report location or status by themselves. See the table on How It Works.
- **"How much would hardware cost?"** It is not priced. Hardware, installation and integration are quoted per project.
- **"Who built the website, and how is it hosted?"** It is built with Astro (a static-site builder), hosted on Cloudflare and published automatically from GitHub. It has no server or database of its own.
- **"What would it take to make it real?"** A backend platform with accounts and a database, hardware pilots on a real site, a mobile scanning app, and customer validation of pricing.
- **"Could it expand beyond the Philippines?"** Southeast Asian expansion is stated as a future vision only. Current proposed coverage is the Philippines.
