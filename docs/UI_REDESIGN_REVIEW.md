# ui-redesign review and proposed commit contents

Recorded 2026-10-11. Branch: `ui-redesign`. Current HEAD: `5864f4d`.
Review baseline: `aa9b977`; the intervening `5864f4d` documentation commit already exists and is not part of the proposed new commit.

## Review outcome

The independent redesign review identified Solutions label clipping/overlap at enlarged text, followed by a clipped bottom focus-outline stroke. Both findings are now resolved in the local working tree. No source changes were made during this final recheck.

Final focused verification used Node 24.11.1 and Chromium 151.0.7922.34 against a fresh static build, with all external requests blocked:

- Ran the two current Solutions regression scenarios in isolation: both passed. The label scenario covers 320/390px, genuine 32px browser default text, JavaScript on/off, text inside containers and clipping ancestors, and label overlap. The outline scenario covers native Tab scrolling at 390x844, genuine 32px text, JavaScript on/off, the sticky header and clipping ancestors.
- Independently Tabbed through all four jump links after native scrolling settled. Every full outline was visible. Reporting's outline bottom was 833.46875px with JavaScript and 832.859375px without JavaScript, inside the 844px viewport.
- Compared the fixed layout with the scroll margin temporarily removed in the browser, after reveal transitions settled. Document height and all four jump-link and four capability-label rectangles were identical in both JavaScript modes. An initial comparison during a reveal transition was discarded as measurement noise.
- The earlier subpixel box-bottom discrepancy did not clip text. The separate approximately 5px missing outline stroke is fixed by the native focus-scroll margin.
- `npm run build` passed (8 pages). `npm run check:release` passed its automated checks and still lists all four manual gates below.

The broader review was not repeated. Its independently run checks were: type checking with zero errors/warnings and one existing ignored-script hint, 142 unit tests, 21 inquiry browser scenarios and 33 Home/demo browser scenarios. The subsequent label recheck passed its new regression. The implementation handoff reports the latest complete suites as 21 inquiry and 35 Home/demo scenarios; this final recheck independently ran the two Solutions scenarios, not that entire suite.

Firefox/WebKit/Safari, physical devices, screen readers and true browser zoom remain unverified.

## Publication-content audit

- Git index is empty; nothing has been staged. There are 49 intended pre-record paths: 22 modifications, 21 additions and 6 deletions. This review record adds one file, making the proposed new commit 50 paths: 22 modifications, 22 additions and 6 deletions.
- Intended runtime additions are four audience/device source modules and 15 optimized public media files. New public media total 2,994,753 bytes: seven H.264 audience clips, seven full-frame WebP posters and the site's own Contact screenshot.
- All seven clip and seven poster SHA-256 hashes match `design/media-source/AUDIENCE_VIDEO_PROPOSAL.json`. The Contact screenshot hash is `4f063bcdd6014d590b74523313cdc95b85abf52a8cc52b00d2c03ced0a5872e6`, matching UX_BRAND section 11.5.
- Provenance records include creators, source URLs, Pexels licence references, source intervals, processing and hashes. `AUDIENCE_CENTRE_PROPOSAL.json` is a historical rejected/superseded proposal, not a runtime asset list. Previously approved audience photos remain used by Solutions.
- No references to the retired SamplePanel, CoverageNote, PlanCard, ProcessSteps, SegmentGrid, audience-stage or collage components/scripts remain in `src` or `tests`.
- `dist`, `.astro`, dependencies, environment files, Wrangler state, downloaded ZIPs/raw source media and `design/references` review captures/scripts stay ignored and outside this commit. Static hosting serves only `dist`; its generated contents contained no source documents, proposal JSON, local review scripts, archives or environment files.
- Credential-signature scans of proposed nondeleted text files and generated HTML/JS/CSS/JSON/TXT/XML found no matches for private keys, AWS credentials, GitHub tokens, Stripe/OpenAI secret keys or quoted credential assignments. This is a pattern scan, not a guarantee that every possible secret format is absent. The Formspree action URL is an intentionally public endpoint, not a credential.
- No dependency, lockfile or hosting-configuration changes are proposed. `git diff --check` reports only an existing added blank line at the end of `docs/UX_BRAND.md`; it is not a functional blocker and was left untouched.

## Readiness and remaining gates

The local technical review is complete and the contents below are prepared for a future commit. Nothing has been committed, merged, pushed or deployed, and no inquiry was sent. Publication is not yet cleared:

1. Verify the notification recipient in the provider account; do not commit the address.
2. Confirm receipt of a production test request, only when separately authorized; record date and pass/fail only.
3. Approve provider-specific privacy wording.
4. Obtain owner approval of public page copy.
5. Resolve final production-media approval: the audience provenance records explicitly say local playback approval only, not final production-asset approval. The recorded visual approvals do not explicitly close that restriction. Do not silently change the approval record or treat sourcing/hash verification as production approval.

The known four-second hard video loop cuts and unavailable environment checks remain disclosed limitations. No new runtime blocker was confirmed in this focused recheck.

## Approval addendum (2026-10-11, Claude Code)

The human approved the final redesign, audience media treatment, public page copy, and current privacy and confirmation wording, and authorized the commit, merge into `main` and push. Gates 3, 4 and 5 above are therefore closed by recorded decision (ADR-036); gates 1 and 2 (recipient verification, production test request receipt) remain open. Recording these approvals adds two paths to the manifest below, making 52: `M src/lib/release-check.ts` (open gates reduced to the two delivery gates; closed ones listed as dated `recordedApprovals`) and `M scripts/check-release.ts` (prints both lists). `design/media-source/AUDIENCE_VIDEO_PROPOSAL.json` records the publication approval for the seven runtime clips/posters; unused candidates stay unapproved.

## Exact proposed new commit manifest

Relative paths below are the complete allowlist against current HEAD. `M` means modify, `A` add and `D` delete. Do not include ignored evidence or unrelated later changes.

| Action | Path |
|---|---|
| M | `.gitignore` |
| A | `design/media-source/AUDIENCE_CENTRE_PROPOSAL.json` |
| A | `design/media-source/AUDIENCE_VIDEO_PROPOSAL.json` |
| M | `docs/ARCHITECTURE.md` |
| M | `docs/DECISIONS.md` |
| M | `docs/PRESENTATION_HANDOFF.md` |
| M | `docs/PROJECT_STATE.md` |
| A | `docs/UI_REDESIGN_REVIEW.md` |
| M | `docs/UX_BRAND.md` |
| A | `public/media/home/audience-construction-companies.mp4` |
| A | `public/media/home/audience-contractors.mp4` |
| A | `public/media/home/audience-engineering-firms.mp4` |
| A | `public/media/home/audience-equipment-rental.mp4` |
| A | `public/media/home/audience-government-projects.mp4` |
| A | `public/media/home/audience-project-managers.mp4` |
| A | `public/media/home/audience-real-estate-developers.mp4` |
| A | `public/media/home/candidate-construction-companies.webp` |
| A | `public/media/home/candidate-contractors.webp` |
| A | `public/media/home/candidate-engineering-firms.webp` |
| A | `public/media/home/candidate-equipment-rental.webp` |
| A | `public/media/home/candidate-government-projects.webp` |
| A | `public/media/home/candidate-project-managers.webp` |
| A | `public/media/home/candidate-real-estate-developers.webp` |
| A | `public/media/site/website-contact.webp` |
| M | `src/components/form/InquiryForm.astro` |
| D | `src/components/graphics/SamplePanel.astro` |
| D | `src/components/site/CoverageNote.astro` |
| M | `src/components/site/CtaBand.astro` |
| D | `src/components/site/PlanCard.astro` |
| D | `src/components/site/ProcessSteps.astro` |
| D | `src/components/site/SegmentGrid.astro` |
| A | `src/lib/audience-composition.ts` |
| M | `src/pages/404.astro` |
| M | `src/pages/about.astro` |
| M | `src/pages/contact.astro` |
| M | `src/pages/how-it-works.astro` |
| M | `src/pages/index.astro` |
| M | `src/pages/pricing.astro` |
| M | `src/pages/product-demo.astro` |
| M | `src/pages/solutions.astro` |
| M | `src/lib/release-check.ts` |
| M | `scripts/check-release.ts` |
| A | `src/scripts/audience-sequence.ts` |
| A | `src/scripts/audience-videos.ts` |
| D | `src/scripts/collage.ts` |
| A | `src/scripts/device-entrance.ts` |
| M | `src/scripts/nav.ts` |
| M | `src/scripts/reveal.ts` |
| M | `src/scripts/stable-position.ts` |
| M | `src/styles/global.css` |
| M | `tests/browser/home-demo-ui.ts` |
| M | `tests/browser/inquiry-form.ts` |
