# BuildTrack Presentation Handoff

Prepared 2026-10-05 for the walkthrough with the project owner. Live site: https://buildtrack.sunnydelacruz.workers.dev/

BuildTrack is an **academic business proposal**. The website is real and public. The request form is connected to a real form service. The BuildTrack platform, hardware tracking and dashboard data are **proposed or simulated**. Say this early and plainly. The site says it too.

## 1. Five-minute walkthrough

| Time | Route | What to do and say |
|---|---|---|
| 0:00–0:45 | `/` (Home) | Read the headline. Point to the line under the buttons: "Academic business proposal. The platform is proposed; the demo uses fictional data." Scroll to **The problem** (fragmented visibility, loss and waste, delays) and **Tag it, scan it, see it** (four steps). |
| 0:45–1:30 | `/how-it-works/` | Walk through the four steps (tag, capture, cloud platform, dashboards). Show the QR / RFID / IoT comparison table. Scroll to **Honest scope**, which lists what works, what is simulated and what is a concept only. |
| 1:30–3:00 | `/product-demo/` | Read the blue "Demonstration data" notice aloud. On **Overview**, change **Project** to "Sample Bridge Rehabilitation", then back to "All sample projects". Open **Inventory** and **Equipment** and use a filter. Open **Tracking events**, press **Simulate scan** once or twice (limit 5), then **Reset demo**. Say: "Nothing is stored or sent. This is what the dashboard *would* look like." |
| 3:00–3:45 | `/pricing/` | Three proposed plans: Starter ₱2,990, Professional ₱7,990 and Enterprise ₱19,990 per organization per month. Show the comparison table, the limits and the "quoted separately" list (hardware, installation, integrations). Point to the disclosure: proposed academic pricing, no subscription is activated. |
| 3:45–4:45 | `/pricing/` → **Avail Professional** → `/contact/?type=service&plan=professional` | Show that the form opens with "Avail a Service" and "Professional" already chosen, and that both can still be changed. Press **Send service request** with the fields empty to show the error summary. **Do not submit** unless the production test below has passed and you mean to send a real request. |
| 4:45–5:00 | `/about/` | Mission, vision, Philippines coverage, and the **Academic disclosure** list. Close by saying what is real and what is proposed. |

Use a phone too if you can: below about 1200 px wide the navigation becomes a **Menu** button.

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
| Navigation, mobile menu, keyboard access | Inventory, equipment, deliveries, tracking events and device states | Real QR/RFID/IoT hardware tracking |
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
| "What is real" lists on About and How It Works | `src/lib/disclosures.ts` |
| Page text (headlines, problem, mission, vision, etc.) | `src/pages/*.astro` (e.g. `index.astro`, `about.astro`) |
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
| `npm run test:browser` | Form tests in a headless browser; needs `CHROME_PATH` set (see `docs/ARCHITECTURE.md` §8) |
| `npm run check:release` | Release checklist: automated values plus manual gates |

Do not submit the form from `npm run dev` unless you intend to: the local site posts to the real Formspree endpoint.

## 7. Current limitations

- Delivery of a request sent **from the live site** is not yet confirmed (see section 8).
- Pricing, plan contents and limits are a proposal and have not been validated with customers.
- The demo data is a fixed, fictional snapshot (28 Sep 2026, 8:00 AM). It does not change over time and saves nothing.
- No hardware, platform backend, accounts or payments exist.
- The logo was supplied as a JPEG with a white background and no transparency. The site shows only its emblem, because the lettering and tagline are unreadable at header size; on the dark footer the emblem sits on a white tile. The browser-tab icon and the link-preview image still use the earlier designs, because the logo is unreadable at icon size. A vector (SVG) or transparent PNG version would allow a cleaner result.
- The address is a free `workers.dev` subdomain. A custom domain would need to be bought.
- Formspree's free plan allows 50 submissions per month.
- Testing has used Chromium-based browsers, automated accessibility checks and simulated mobile widths. It has not covered Firefox/Safari, real phones or screen readers.

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
