# BuildTrack Requirements

Status: settled discovery baseline, 2026-10-04. Exact pricing/contact/provider configuration deferred, not invented.

## Required website
- Seven pages: Home, Solutions, How It Works, Product Demo, Pricing, About, Contact.
- Explain business/product, background, mission/vision, problems, proposed benefits and services.
- Include branding, meaningful construction/technology imagery and all BMC customer segments with equal standing.
- Clearly state Philippines-based coverage; any international expansion is future vision.
- Present Starter, Professional and Enterprise proposed PHP packages; Enterprise must eventually have a numeric amount, not only Contact Sales. Exact values, billing period and limits need approval before release.
- Show basic/advanced/custom capability distinctions; hardware, implementation and integration pricing is separate or explicitly described as included when approved.
- Public HTTPS deployment, usable navigation/footer/mobile menu, working links and 404 page.
- Basic SEO: unique titles/descriptions, favicon, social metadata/image, correct canonical URLs after domain selection, sitemap and robots configuration.

## Real service-request flow — core acceptance requirement
1. Visitor selects Request a Demo, Request a Quotation or Avail a Service.
2. Selected request type/service/plan carries to Contact and remains editable.
3. Form gathers name, email, organization, optional phone, company type, project need and message, plus a clear privacy acknowledgment. Required fields must be indicated; collect only useful information.
4. Validate fields and allowlisted selections. Invalid URL preselection values are ignored safely. Never render user content as raw HTML.
5. Submit to the configured form provider with request type, plan and service included.
6. Display submitting, success and actionable failure states. Prevent accidental concurrent submissions; retain entered data after failure and allow retry.
7. Show success only after provider acceptance. Do not claim payment, an active subscription, a booked appointment or completed fulfillment.
8. Designated contact receives the request with usable contact details and selected intent. Verify this in the deployed environment before academic evaluation.

The form endpoint and recipient require external setup. A fake success message, mailto link alone, console logging or a local mock does not satisfy delivery. Provider acceptance and recipient delivery are separate checks. Test entries use synthetic data and clear test labels. No card details or payment collection.

## Product demo — included baseline scope
Visible title: Interactive Platform Demo. Persistent disclosure: “Demonstration data shown for illustration purposes.” Also explain that no real site/hardware is connected.

Use local fictional data for four illustrative projects, inventory/material quantities, equipment status/utilization, delivery states, low-stock alerts, project progress, recent QR/RFID events and illustrative IoT device states.

Interactions: sidebar/section switching, project selection, useful filtering and changing tables/cards/charts. A bounded “Simulate scan/event” interaction is optional and must be explicitly labeled. Data resets on reload. No CRUD, accounts, persistence, polling, WebSockets or live hardware. Figures must agree across tables/charts/cards; units and timestamps must be understandable.

## Quality requirements
- Semantic HTML, logical headings, labels, keyboard operability, visible focus, descriptive alt text and status announcements.
- Aim for WCAG 2.2 AA: appropriate contrast, usable target sizing and reflow. Color cannot be the only status indicator. Verify key interactions manually as well as with available automated tools.
- Usable at representative 360, 390, 768, 1024 and 1440 px widths; no page-wide horizontal overflow. Demo tables can scroll within labeled containers.
- Respect reduced motion; avoid autoplay distractions and gratuitous effects.
- Optimize responsive images, lazy-load below-fold media and keep client JavaScript/dependencies limited. Record Lighthouse results; resolve material regressions rather than claiming perfect scores without evidence.
- Test Chrome, Edge and Firefox desktop and a real Android device when available. Report any untested environment honestly.
- No committed secrets, unsafe input rendering or unnecessary personal data collection. Configure provider spam protection and verify legitimate submissions still succeed.

## Content and privacy
No fake clients, testimonials, contracts, awards, offices, partner logos, measured savings or live statistics. Label academic proposed pricing and simulated data. Use authorized/licensed imagery and avoid unsupported factual claims. Explain that inquiry details are sent to the designated contact through the configured provider; finalize provider-specific privacy text before release. Placeholder location/phone/prices must not ship. A phone number does not automatically provide a form recipient email.

## Optional enhancements
FAQ, concise tracking animation, coverage graphic, richer filters or downloadable brochure only after core requirements work. Structured data only when supported by truthful final content; do not imply a purchasable operational SaaS.

## Excluded scope
Authentication/customer accounts, customer portal, persistent inventory backend, custom API/server, database, admin/CMS, online payments/billing, real QR/RFID/IoT integration, telemetry, native mobile app, multi-tenancy/RBAC and microservices.

## Release acceptance evidence
Record public URL/HTTPS; representative page and device checks; successful build/type/lint checks that exist; demo interactions and disclosures; all business placeholders resolved; form validation and failure behavior; a deployed test request and explicit receipt confirmation from the contact; metadata/navigation checks; review findings resolved or consciously accepted. No release claim while real inquiry delivery is unverified.
