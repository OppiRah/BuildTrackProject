# BuildTrack Project State

Updated: 2026-10-17.

## Academic quotation demo integrated into the website journey (2026-10-17; owner-authorized publication; live verification recorded separately)

The owner asked for the published demo to follow the main-website journey from their recording (DECISIONS ADR-043, update "the demo is the website's quotation journey"; PROPOSAL §18). The real workflow stays off; no backend was set up.
- **Entry points:**
  - Home and Pricing "Request a Quotation" open the demo quotation form; a plan's link carries the plan.
  - Contact has a prominent "Request a quotation — academic demo" box that carries the service and plan. Contact's real form is unchanged.
- **Request page:** laid out like the recorded quotation form (website header and footer, navy banner, "Your project", request-received panel). It uses fictional sample customers shown as plain text and a required academic-demo acknowledgment. Service and plan carry through the receipt, the owner review and approval, and the customer quotation.
- **Owner page:** labelled "Demo owner dashboard", representing Sunny's review and approval. The invitation button represents the emailed link; no email is sent.
- **Checks (local):**
  - `npm test` 593/593; `npm run check` 0 errors; build 12 pages.
  - `test:browser:academic-demo` 61/61: from Home, service/plan continuity, three-tab updates, reloads, reset, keyboard, 390 px, isolation, and the real Contact form unchanged.
  - `test:browser` 21/21 and 55/55.
  - `test:worker:e2e` 69/69; `test:worker` 30/30; `test:worker:owner` 25/25; `test:build:turnstile` passed.
  - Compared with the published `8263494`, Home now differs only in its two quotation link targets, and Contact only adds the demo box.
- **Not changed:** the Solutions page's quotation links still open the real Contact form (outside this request).

## Public academic demo of the quotation workflow (2026-10-17; published in `f42f9ec` and verified live)

**Live verification (2026-10-17):** Workers Builds deployed `f42f9ec` to `buildtrack` as version `2c01b847-3617-4577-a539-5e9ca1825900` (07:41 UTC).
- `/academic-demo/`, `/academic-demo/owner/` and `/academic-demo/quote/` return 200, each with `Content-Security-Policy: connect-src 'none'; form-action 'none'; frame-ancestors 'none'; base-uri 'none'` and `Cache-Control: no-store`.
- The three-tab journey against the live site passed 36/36 (same checks as `test:browser:academic-demo`, including only same-origin GET requests, no `/api/` call, no other origin, and the demo code never stored).
- The eight existing pages, `sitemap-0.xml` and `robots.txt` return 200. The sitemap adds only `/academic-demo/`; Pricing shows "Try the academic quotation demo". `/quote/`, `/contact/quotation/` and `/api/quotation-requests` return 404 on production.
- The real-workflow Workers stay off: `buildtrack-owner` and `buildtrack-owner-preview` return 503. `buildtrack-preview` serves its earlier static preview pages, but its intake refuses requests (503, "Nothing was sent or stored").


The owner changed the immediate release target to a public, browser-only academic demo (DECISIONS ADR-043, update "public academic demo first"; PROPOSAL §18, "Public academic demo"). The quotation workflow source (real Workers, migrations, manual email mode, tests) is committed with it, **switched off** (`QUOTATION_ON = false`; production stays assets-only; the hosted owner and public preview Workers stay disabled).
- **Three pages:** `/academic-demo/` (demo request with fictional sample customers), `/academic-demo/owner/` (demo owner dashboard: review, approve, "Open demo customer invitation"), `/academic-demo/quote/` (real customer page markup; accept, demo checkout, confirmation). State lives only in the visitor's browser, shared between tabs. Pricing links to it.
- **Isolation:** no network calls (CSP `connect-src 'none'; form-action 'none'`), no personal-data fields, no D1, secrets, real tokens, email or Formspree.
- **Checks (2026-10-17, local):**
  - `npm test` 590/590; `npm run check` 0 errors; `npm run build` 12 pages.
  - `test:browser:academic-demo` 36/36 (three-tab journey and isolation); `test:browser` 21/21 and 55/55.
  - `test:worker:e2e` 69/69 (real `/quote/` after the shared-component extraction); `test:worker` 30/30; `test:worker:owner` 25/25; `test:build:turnstile` passed; `test:deploy:templates` 6/6.
  - `check:published-build` against `8263494` now differs as intended: the three demo pages, the Pricing link, `_headers`, the sitemap (adds `/academic-demo/` only), and script chunking. `contact/` changes only a chunk name; `payment-demo/` loads its unchanged script as a shared chunk instead of inline.
- **Still pending, unchanged:** real workflow activation (Cloudflare Access for Sunny, production D1 and Workers, the cutover commit), CE validation, Formspree recipient verification and production receipt.

## Manual email release mode, the three outstanding findings, hosted-preview preparation (2026-10-17; local only, uncommitted; awaiting Codex's focused review and owner decisions)

The owner changed the plan: a free hosted academic version on the existing workers.dev site, with invitations sent manually from Sunny's own email. Nothing is provisioned, deployed, committed or sent; switches stay off. Details: PROPOSAL §18, "Manual email release mode"; setup: `docs/QUOTATION_RUNBOOK.md`; review packet: `docs/CODEX_HANDOFF_QUOTATION.md` §0b.
- **Manual email (release mode):**
  - Approval creates the link with no email job.
  - The owner page prepares the invitation (Prepare email / Copy email text / Copy quotation link). It is hash-verified and no-store.
  - An optional "Marked sent by owner" record (migration `0008`).
  - No notification emails: the dashboard is the inbox.
  - The scheduled run never sends; legacy waiting jobs are cancelled and kept as history.
- **Customer wording:** stored, reviewed, invitation sent manually after approval; no payment or booking.
- **Retention:** 5 requests per run (38 statements), under the Free plan's 50 D1 queries per invocation.
- **Findings repaired:**
  - Interception harness: outstanding and retired IDs.
  - Workflow-off build: identical to the published commit `8263494` (`npm run check:published-build`). It differed before.
  - Walkthrough: no `--test-scheduled`.
- **Templates and runbook:** manual mode, with no mail-provider settings, and a hostname-based Access application.
- **Checks (2026-10-17):**
  - `npm test` 582/582; `npm run check` 0 errors.
  - `test:worker:e2e` 69/69 (manual mode); `test:worker:owner` 25/25; `test:worker` 30/30.
  - `test:build:turnstile` passed; `test:deploy:templates` 6/6; `check:published-build` identical.
  - A 44-check browser journey on the manual walkthrough.
  - Regressions were shown to fail against seven defects.
- **Not verified (preview only):** real Access and its JWT header, edge `CF-Connecting-IP`, cron CPU time on Cloudflare, real mail-client `mailto:` handling, and whether Zero Trust signup asks for a payment method.
- **Owner decisions still open:** privacy wording, retention and validity reconfirmation, Turnstile (off), and authorization to provision and publish.

## Local presentation build and demo-checkout redesign (2026-10-17; local only, uncommitted; owner request; not reviewed)

Nothing committed, deployed, provisioned or sent; production switches and configuration unchanged; the committed build is byte-identical (the `/quote/` page exists only in workflow-enabled builds).
- **Presentation entry point:** `npm run walkthrough:quotation` now serves the complete website (Home, Pricing and all pages, shared header/footer) with the workflow enabled, plus a presentation hub, owner dashboard and captured-email inbox (runbook §0a). Owner and customer origins stay separate; mocked sign-in and email stay in test tooling.
- **Formspree safeguard:** the committed general Contact form points at the real Formspree endpoint; the presentation build replaces it with the no-endpoint fixture, refuses to start if a Formspree address appears in the built Contact page, and adds `form-action 'self'; connect-src 'self'` to website pages.
- **Demo checkout** (`src/routes/quote.astro`; UI-only changes in `src/scripts/quote.ts`): branded checkout card with order summary (approved reference, scope, amount), radio-group methods "Card — demo" / "Bank transfer — demo" with local SVG illustrations, method details, review with "Complete demo payment", and a "Demo confirmation" result with the exact disclaimer. No card/CVV/expiry/account fields; the browser-only demo code 12345678 is unchanged. Request fields, pending-action storage, retries, locks and link handling are untouched.
- **Verified:** a 38-check headless browser pass through the whole journey (desktop, 390 px, 320 px with 32 px text, keyboard, errors, all three results; demo code absent from all requests and storage; no request outside the two local origins), plus the suites listed in the handoff note.
- **Codex:** the three latest low-severity findings remain recorded and unresolved. The redesigned customer page should be included in the next recheck.

## Quotation workflow: Codex consolidated review findings repaired (2026-10-17; local, uncommitted; stopped for Codex's focused recheck)

All seven findings are repaired in one local pass. The workflow, sending, readiness and Turnstile stay off; production is unchanged; nothing was provisioned, deployed, sent or committed. Details: PROPOSAL_QUOTATION_WORKFLOW.md §18, "Codex consolidated review repairs"; review packet: `docs/CODEX_HANDOFF_QUOTATION.md` §0.
1. **Stale email completion:** only a job for the quotation's current link generation marks it `emailed`; an older generation's in-flight send keeps its own acceptance record.
2. **Resend guard:** "latest job" is compared within the link generation, so earlier-generation resends no longer block the new link's resend.
3. **Retention cost:** migration `0007` (additive partial index) removes the full `email_jobs` scan. Real local D1, realistic history: identical cost at 6,000 and 12,000 jobs (empty pass 6 rows read; full passes 1,477 / 780). Deleted cap warnings are counted from `RETURNING` (D1's change count includes trigger-deleted attempts).
4. **Expired cap-warning leases:** deleted (with attempts) once the lease has expired, even with sending off; live leases are kept.
5. **Templates:** filled copies go at the repository root under exact names (runbook, "Where filled configs go"); `npm run test:deploy:templates` checks this with Wrangler itself, with a `deploy/` negative control.
6. **Reload identity assertions:** exact request counts and identical action/fields; Set comparisons refused; self-test proves different identities fail.
7. **Cancellation errors:** only the exact error for a browser-confirmed cancelled interception is tolerated; anything else fails the scenario and the run, without skipping assertions.

Evidence: the handoff §0.

Follow-up the same day (owner request; also awaiting the recheck):
- **Owner email statement:** the main statement now describes the current link generation; older links' emails are listed separately as history. Regression added.
- **Local walkthrough:** `npm run walkthrough:quotation` (runbook §0a): request → owner review → approve → mock-inbox link → accept → simulated checkout, on loopback with mocked Access/email and Turnstile off. Verified by driving it over HTTP and loading the owner page and inbox in headless Chromium; only 127.0.0.1 listeners.

## Quotation workflow: local implementation complete (2026-10-17; local, uncommitted; awaiting Codex's consolidated review, no independent signoff)

The owner authorized completing the remaining local work in one pass. The review packet is `docs/CODEX_HANDOFF_QUOTATION.md`, and owner setup is in `docs/QUOTATION_RUNBOOK.md`. Details: PROPOSAL_QUOTATION_WORKFLOW.md §18, "Local completion".
- **Checkpoint 4 reload repair:**
  - Pending acceptances, declines and checkouts survive a reload through validated, tab-scoped metadata (no demo code or quotation content).
  - Codex's case now yields exactly one record. Invalid or new links never resurrect an action.
  - If storage fails, nothing is sent.
- **Owner lifecycle:** revoke, new link (same immutable snapshot and expiry), dismiss, and delete (refused during an in-flight send). Each is a confirmed POST with the existing guards. Migration `0006`.
- **Retention:** 90 days after `last_activity_at`, in bounded batches on the owner cron. Reference counters are kept.
- **Turnstile:** prepared and **off**. Requiring JavaScript for quotation intake is unapproved.
- **Deployment preparation:** templates in `deploy/` and the runbook. Nothing is provisioned or deployed.
- **Still off:** the workflow, sending, customer readiness and Turnstile. Production `wrangler.jsonc` and `public/_headers` are unchanged, and the build is byte-identical to the build before checkpoint 2.

Final checks are listed in the handoff, "Test results".

## Quotation workflow checkpoint 4: fourth review recovery defects repaired (2026-10-17; local, uncommitted; stopped for Codex's narrow recheck)

Later checkpoints stay paused. The workflow, sending and readiness stay off, and production is unchanged. Details: PROPOSAL_QUOTATION_WORKFLOW.md §18, "Checkpoint 4 fourth review repairs".
- **Display vs recovery:** displaying a link problem is now separate from ending recovery.
- **Link problems after an action:** after an acceptance, decline or checkout is sent, a link problem on the first answer or a retry shows the problem and the uncertainty, with the phone contact. It keeps the exact request, the lock and "Check again"; retries stay authorized normally.
- **When recovery ends:** only on a recognised settling answer, a session replacement or a fresh page load.
- **Unchanged:** the server and its authorized-snapshot SQL; A → B → A isolation; invalid explicit fragments still replace the session.
- **Browser matrix:** accept, decline and checkout × revoked, expired and superseded × initial and retry response (18 scenarios). All failed against the old page and pass now: problem plus uncertainty, request and lock kept, working retry once the link is valid, exactly one record.

Checks (mocked email; external browser requests blocked):
- `npm test`: 502/502.
- `npm run test:worker:e2e`: 60/60 three times in a row.
- `npm run test:worker:owner`: 19/19. `npm run test:worker`: 30/30.
- `npm run test:browser`: 21/21 + 55/55.
- `npm run check`: 0 errors.
- `npm run build`: byte-identical.

## Quotation workflow checkpoint 4: third review findings repaired (2026-10-16; local, uncommitted; rechecked by Codex, recovery defects repaired above)

Later checkpoints stay paused. The workflow, sending and readiness stay off, and production is unchanged. Details: PROPOSAL_QUOTATION_WORKFLOW.md §18, "Checkpoint 4 third review repairs".
1. **Refused checks keep the outcome unknown.**
   - A refused "Check again" (429, or any other refusal) keeps the exact request, attempt id and action lock, shows the Retry-After wait, and says the check was refused, not that the action failed.
   - First-request refusals that can follow a write also stay unknown.
   - **Tested end to end:** a committed checkout, acceptance or decline → lost answer → allowance used up → refused check → next hourly window → reconciled, with exactly one result.
2. **One authorized snapshot per response.**
   - All quotation data in a response (view, conflict view, history, stored attempt) comes from one `SELECT`. That statement also enforces the current link and generation, revocation, state and expiry at that time. No later unguarded reads.
   - **Tested** with revocation, a newer generation with newer history, expiry, and a version change just before the read (unit, and real D1).

The regressions failed against the old code and pass now:
- End to end: 3 scenarios against the old page script, 2 against the old server.
- Unit: 10 against the old server.

Checks (mocked email; external browser requests blocked):
- `npm test`: 500/500.
- `npm run test:worker:e2e`: 41/41 three times in a row.
- `npm run test:worker:owner`: 19/19. `npm run test:worker`: 30/30.
- `npm run test:browser`: 21/21 + 55/55.
- `npm run check`: 0 errors.
- `npm run build`: byte-identical.

## Quotation workflow checkpoint 4: second review findings repaired (2026-10-16; local, uncommitted; rechecked by Codex, remaining findings repaired above)

Later checkpoints stay paused. The workflow, sending and readiness stay off, and production is unchanged. Details: PROPOSAL_QUOTATION_WORKFLOW.md §18, "Checkpoint 4 second review repairs".
1. **Response uncertainty:** only fully recognised answers count. Interrupted, invalid, empty or mismatched responses, including HTTP 200, are uncertain. "Check again" repeats the exact request (token, action, version, method, outcome, attempt id), and no new decision or attempt starts meanwhile.
2. **`/quote/#`:** treated as an explicit invalid link. It clears the stored link, the session and the confirmation, on same-document navigation and on reload. A fragment-free reload still recovers.
3. **Checkout version:** simulated checkouts carry the displayed version, and the insert is bound to it. A change gives 409 with the current view and no row.
4. **Stored attempts:** a stored result is returned only after re-checking the link, revocation, state, version and expiry at a fresh time.
5. **Test identities:** one stable identity per customer journey in unit, API and browser tests. A normal journey stays under the limit, and deliberate exhaustion shows the 429 guidance.

Each finding's regressions failed against the defective code and pass now: 6 end-to-end scenarios against the old page script; 6 unit tests against the old server; the journey-bucket test against the old rotating helper.

Checks (mocked email; external browser requests blocked):
- `npm test`: 481/481.
- `npm run test:worker:e2e`: 36/36 three times in a row.
- `npm run test:worker:owner`: 19/19. `npm run test:worker`: 30/30.
- `npm run test:browser`: 21/21 + 55/55.
- `npm run check`: 0 errors.
- `npm run build`: byte-identical.

## Quotation workflow checkpoint 4: review findings repaired (2026-10-16; local, uncommitted; rechecked by Codex, second findings repaired above)

The next checkpoint is not started. The workflow, sending and readiness stay off, and production is unchanged. Details: PROPOSAL_QUOTATION_WORKFLOW.md §18, "Checkpoint 4 review repairs".
1. **Page state per link:** every link change aborts requests and discards late responses. Confirmations and checkout clicks use the exact token and version shown.
2. **Write-time authorization:** customer writes re-check the link, revocation, state, version and expiry (at a freshly read time) inside the write. A failed check leaves no acceptance, event or simulated row.
3. **Attempt conflicts:** reusing a checkout attempt with a different choice gives 409 and changes nothing. The incorrect unit test was fixed.
4. **Explicit fragments:** an invalid explicit fragment shows an error, clears the view and confirmation, and never reopens an earlier quotation.
5. **Uncertain outcomes:** they are stated as unknown, and "Check again" repeats the identical idempotent request. One request runs at a time.
6. **Runtime expiry:** real workerd/D1 expiry tests use short-lived immutable fixtures, including expiry during delayed actions. The earlier statement is corrected.

**Each finding's regressions failed against the defective code and pass now:** 7 end-to-end scenarios against the old page script; 4 end-to-end scenarios and 9 unit tests against the old server.

Checks (mocked email; external browser requests blocked):
- `npm test`: 458/458.
- `npm run test:worker:e2e`: 28/28 three times in a row.
- `npm run test:worker:owner`: 19/19. `npm run test:worker`: 30/30.
- `npm run test:browser`: 21/21 + 55/55. The Home/demo part was rerun after a Windows file lock stopped Chromium's start.
- `npm run check`: 0 errors.
- `npm run build`: byte-identical.

## Quotation workflow checkpoint 4: customer routes (2026-10-16; local, uncommitted; reviewed by Codex, findings repaired above)

**Checkpoint 3 is signed off by Codex.** **Checkpoint 4 is built locally and stopped for review.** Details: PROPOSAL_QUOTATION_WORKFLOW.md §18, "Checkpoint 4".
- **`/quote/` shell:**
  - The fragment token is removed at once, kept for reload in the tab, and sent only in POST bodies.
  - It shows the approved snapshot and version, and has a persistent no-real-payment disclosure and a no-JS explanation.
  - It is added only by the `quoteRoute()` integration while the workflow is enabled, so the committed build is byte-identical.
- **Shell headers:** served `no-store`, `noindex`, `no-referrer`, unframeable, with a same-origin CSP that hashes the inline scripts.
- **Customer API:**
  - POST JSON only, from the exact public origin, with no CORS and a per-client hourly limit.
  - Every action is validated server-side against the stored link hash and the quotation state.
  - The link states (invalid, expired, revoked, superseded) are clear but detail-free.
  - Viewing never changes anything.
  - Acceptance and decline are explicit, version-checked, atomic and idempotent (concurrency tested).
- **Simulated checkout:** card or bank with the "Demo code — enter 12345678" field and "Use sample code", checked only in the browser and never transmitted. Outcomes need an accepted quotation, are idempotent per attempt and labelled simulated; the quotation is never marked paid.
- **Origin under `no-referrer`:** tested directly. Fetch POSTs keep the exact Origin, so the owner-form workaround was not applied.

Checks (Node 24.11.1, wrangler 4.147.0, Chromium 151 headless; mocked email only):
- `npm test`: 445/445 (22 new customer tests).
- `npm run test:worker:e2e` (new): 15/15 in three consecutive runs. It covers request → owner approval → in-memory invitation → customer acceptance → simulated outcome, plus reload, no-JS, keyboard, mobile, races, and revoked and superseded links.
- `npm run test:worker:owner`: 19/19. `npm run test:worker`: 30/30. `npm run test:browser`: 21/21 + 55/55.
- `npm run check`: 0 errors. `npm run check:release`: passed.
- `npm run build`: byte-identical. Production `wrangler.jsonc` and `public/_headers`: unchanged.
- The workflow, sending and customer readiness all stay off in committed config.

Activation gates, all pending:
- Review of checkpoint 4.
- Customer readiness only after a controlled preview verifies the routes.
- Cutover config with `/quote/*` in `run_worker_first`.
- Owner revoke and new-link actions.
- Sending account, domain and controlled end-to-end test.
- IP-header preview verification.
- Turnstile and the no-JS decision.
- Real Access setup and preview check.
- Production config.
- Request retention.
- Privacy wording.

No email, inquiry, account, provisioning, dependency, commit, push, merge or deployment.

## Quotation workflow checkpoint 3: skipped-call bookkeeping repaired (2026-10-16; local, uncommitted; signed off by Codex)

Customer routes stay paused, and the workflow and sending stay disabled. Details: PROPOSAL_QUOTATION_WORKFLOW.md §18, "Checkpoint 3 skipped-call bookkeeping".
- **Intent versus invocation:** a lease-checked send intent (`send_intent_at`) is now separate from actual transport invocation (`provider_called_at`, recorded only after a real call).
- **Skipped calls:** when the final deadline, expiry or lease check prevents the call, the attempt is closed with that reason and the job is stopped or rescheduled. This happens atomically, only while this runner still owns the job, with no false call record and no added ambiguity; earlier ambiguity is kept. If ownership was lost, nothing is overwritten.
- **Recovery:** a job is marked ambiguous only if the open attempt had recorded an intent. Genuine crashes in the unavoidable database/network gap stay ambiguous.
- **Cancellation:** the AbortController behaviour is documented as it is; nothing about timeouts changed.

Checks (mocked transport only):
- `npm test`: 423/423 (new controlled-delay regressions; the key ones fail against the old behaviour).
- `npm run test:worker:owner`: 19/19 in three consecutive runs (real local Workers/D1, mocked provider).
- `npm run test:worker`: 30/30.
- `npm run check`: 0 errors.

## Quotation workflow checkpoint 3: review findings repaired (2026-10-16; local, uncommitted; rechecked by Codex, one bookkeeping defect repaired above)

Customer-route work stays paused, and the workflow and sending stay disabled. Details: PROPOSAL_QUOTATION_WORKFLOW.md §18, "Checkpoint 3 review repairs".
1. **Send boundary:**
   - Time is read afresh for each step.
   - The provider is called only after a lease-checked durable "call started" mark, then a final synchronous check of the 20-hour deadline, the quotation expiry and the remaining lease.
   - Stale runners never knowingly send. DB checks and an HTTP call cannot be atomic; provider idempotency stays the separate safeguard.
   - Controlled-clock and lease-loss regressions cover these cases.
2. **Duplicate warning:** it uses the quotation's whole email history. It holds after an ambiguous send followed by a rejected resend, and authorization stays bound to the latest job.
3. **Owner wording:** one statement each for queued, not accepted, unknown and accepted. "No email has been sent" never appears when an attempt may have reached the provider, and acceptance is never called delivery.
4. **Scheduled gate:** the owner pages' full configuration check, including Access and `OWNER_FORM_KEY`, runs before any D1 access. Invalid configuration gives zero D1 calls and zero transport calls.
5. **Attempt history:** `email_attempts` (migration `0004`) holds ids, times and codes only. It is written with the claim, keeps crashed attempts, and is deleted with its job.
6. **Readiness:** `customerRoutes.ready` is a committed constant, default false. Quotation emails are never claimed while it is false, whatever the credentials. Turning it on requires verified customer routes.

Checks (mocked transport only; no provider request):
- `npm test`: 419/419 (14 new tests; the key ones were confirmed to fail against weakened code).
- `npm run test:worker:owner`: 19/19 three times in a row.
- `npm run test:worker`: 30/30.
- `npm run check`: 0 errors.

## Quotation workflow checkpoint 3: durable email jobs (2026-10-16; local, uncommitted; reviewed, findings repaired above)

**Checkpoint 2 is signed off by Codex** and complete as a disabled local foundation. **Checkpoint 3 is built locally and stopped for review.** Customer routes are not started. Details: PROPOSAL_QUOTATION_WORKFLOW.md §18, "Checkpoint 3".

**Runner** (`worker/owner/sender.ts`, `scheduled.ts`; owner Worker cron every 5 minutes):
- sends owner notifications, approved quotations and at most one cap warning per UTC day;
- claims jobs atomically with 2-minute leases; an expired lease is retried as ambiguous;
- retries timeouts, network errors, 5xx and in-progress keys **only with the same key and payload**;
- stops automatic attempts 20 hours after the first attempt (Resend keeps keys 24 hours); definite rejections stop at once;
- records "accepted by the email provider" separately from delivery, which stays unknown;
- after the window, only an explicitly confirmed owner resend creates a new key, with a duplicate warning when an earlier attempt was ambiguous.

**Immutability and secrecy:**
- Each job's recipient, template version and payload hash are frozen at its first attempt; a payload that would differ is not sent.
- Triggers (migration `0003`) make job identity, frozen snapshots and approved quotation snapshots immutable.
- Customer links are rebuilt in memory and checked against the approved hash. They are never stored or logged.

**Sending fails closed.** It needs `SENDING_ENABLED=on`, `EMAIL_MODE=resend` with `RESEND_API_KEY`, `MAIL_FROM`, HTTPS `OWNER_ORIGIN` and `PUBLIC_ORIGIN`, and the owner configuration. The deployable entry has no mock mode. Tests inject an in-memory provider. **No provider request or email was made.**

**Provider facts** were verified against Resend's official docs (2026-10-16). Undocumented points are recorded as assumptions and handled on the safe side: the success status, the error-body field names, whether failures are cached under a key, and when the key period starts.

Checks (Node 24.11.1, wrangler 4.147.0, Chromium 151 headless):
- `npm test`: 405/405 (43 new email tests).
- `npm run test:worker:owner`: 19/19 three times in a row, plus one run after the local cron was added. New on the real runtime: concurrent scheduled runs send four due jobs exactly once; rebuilt links match the approved hashes; triggers hold on real D1.
- `npm run test:worker`: 30/30.
- `npm run check`: 0 errors. `npm run check:release`: passed.
- `npm run build`: byte-identical to the pre-checkpoint-2 build.
- Production config: untouched.

Activation gates, all pending:
- Review of checkpoint 3.
- **Sending stays off until the customer routes exist and are reviewed.**
- A verified sending domain, a sending-only key and a controlled end-to-end test.
- IP-header preview verification.
- Turnstile and the no-JS decision.
- Real Cloudflare Access setup and a preview check of the owner JWT verification.
- Production config.
- Request retention.
- Privacy wording.

No email, inquiry, account, purchase, dependency, commit, push or deployment.

## Quotation workflow checkpoint 2: Codex findings repaired (2026-10-16; local, uncommitted; signed off by Codex)

Checkpoint 3 remains paused; the workflow is disabled and production is unchanged.
0. **Deployment boundary (recheck finding):** the deployable owner entry now requires a canonical HTTPS `OWNER_ORIGIN`, with no flag or exception.
   - Loopback HTTP (`localhost`, `127.0.0.1`, `[::1]`) is accepted only by the test-only wrapper `tests/worker/owner-test-worker.ts`, which no production code imports.
   - The origin is checked first. With a loopback HTTP origin, public HTTPS GET and POST get 503 before any key lookup or D1 access (unit tests through the handler and the deployable entry; a real-runtime check of the fully configured deployable entry).
   - Checks: `npm test` 362/362 (four new tests that fail on the previous rule); `npm run test:worker:owner` 17/17 in three consecutive runs; `npm run check` 0 errors.
1. **`OWNER_ORIGIN` is validated** before the JWT check, any route and any D1 access.
   - The value must be one canonical serialized origin: no credentials, path (not even a trailing `/`), query or fragment; not `null`; not malformed.
   - HTTPS is required. *(Superseded by item 0: an earlier version accepted HTTP on a loopback host for local tests.)*
   - An invalid value gets 503 for GET and POST, with zero database calls (unit tests count every D1 call; the real runtime leaves D1 unchanged).
   - The exact-Origin check, the JWT and the form token are unchanged.
2. **Referrer-policy record corrected.** The observed `Origin: null` applies to native form submissions under `no-referrer`. Codex's independent Chromium tests found that same-origin `fetch` POSTs kept their actual Origin. The claim that the future `/quote/` fetch API needs the same workaround is withdrawn; its policy stays undecided until it is tested independently.

Checks (Node 24.11.1, Chromium 151 headless, wrangler 4.147.0):
- `npm test`: 358/358. There are 19 new tests; the 17 invalid-origin cases fail on the previous check.
- `npm run test:worker:owner`: 16/16 in three consecutive runs and one confirming run on the final files. That includes the new invalid-origin scenario: four values, GET and POST, all 503, D1 unchanged.
- `npm run check`: 0 errors.

## Quotation workflow checkpoint 2: owner review and approval (2026-10-16; local, uncommitted; reviewed by Codex, findings repaired above)

**Checkpoint 1 is complete as a disabled local foundation.** Its reviewed implementation is finished. The workflow is still disabled, production is unchanged, and every activation gate below is pending.

**Checkpoint 2 is built locally and stopped for review.** Details are in PROPOSAL_QUOTATION_WORKFLOW.md §18, "Checkpoint 2".
- **Owner Worker** (`worker/owner/`, local only; `wrangler.owner.local.jsonc` fails closed):
  - every request needs a Cloudflare Access JWT for the one owner email;
  - pages: the request list, the request with its draft form (scope, amount in PHP, validity), and an explicit confirmation page;
  - approval is one atomic D1 batch that freezes the snapshot, records the customer-link hash and expiry, and queues one quotation email job;
  - **nothing is sent:** there is no sender.
- **Protections:**
  - every POST needs the exact owner Origin and a strictly parsed form with the exact field set;
  - form tokens are signed, single-use and bound to owner, action, target and version, and expire after 10 minutes;
  - the change only applies at the version the page showed;
  - a second click, a replayed token or a stale page changes nothing (409);
  - GET pages write nothing.
- **Local Access fixtures** exist only in tests (a per-run key pair and a test-only wrapper that serves only 127.0.0.1). The deployable entry trusts only the team domain's published keys.
- **Decided while building:**
  - Signed form tokens instead of nonces stored on page view: a stored nonce would make GETs write.
  - `Referrer-Policy: same-origin` on owner pages: under `no-referrer` Chromium sent `Origin: null` on native form submissions, so every owner POST was refused. *(Corrected: this does not apply to same-origin `fetch`; the `/quote/` policy stays undecided until tested.)*
  - New owner settings: the secret `OWNER_FORM_KEY` and the vars `OWNER_ORIGIN`, `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD`.
- **Deferred:** revoke, delete, dismiss and resend; sending and its cron; customer links; retention, including cleanup of used form tokens.

Checks (Node 24.11.1, Chromium 151 headless, wrangler 4.147.0):
- `npm test`: 339/339 (34 new owner tests, simulated D1).
- `npm run test:worker:owner` (new): 15/15 three times in a row (real local Workers/D1 plus native-form browser checks).
- `npm run test:worker`: 30/30.
- `npm run check`: 0 errors. `npm run check:release`: passed.
- `npm run build`: every file byte-identical to the pre-checkpoint build.
- Production config: untouched. `npm run test:browser`: not run (no public page changed).

Activation gates, all pending:
- Codex's focused recheck of checkpoint 2.
- IP-header preview verification.
- Turnstile and the no-JS decision.
- Owner-warning email.
- Real Cloudflare Access setup and a preview check of the owner JWT verification.
- Production config.
- Request retention.
- Privacy wording.

No email, inquiry, account, purchase, dependency, commit, push or deployment.

## Quotation workflow checkpoint 1: remaining recheck findings (2026-10-16; local, uncommitted; complete as a disabled local foundation)

Checkpoint 2 remains paused; the workflow is disabled and production config is unchanged. No email, inquiry, account, dependency, commit, push or deployment.
1. **Leading BOM:** both strict UTF-8 decoders (no-JS form components in `src/lib/quotation/intake.ts`; the request body in `worker/public/intake.ts`) use `ignoreBOM: true`, so U+FEFF is kept instead of stripped. A BOM-prefixed field name is an unknown field (400); a BOM-prefixed value is kept; `privacy_ack` of BOM + `yes` fails before any database access (JSON 422 `privacy_ack`, no-JS 400); a body starting with a BOM is refused (400). Valid Unicode and the earlier strict-decoding refusals are unchanged.
2. **Test helper:** the routing probe in `tests/worker/quotation-intake.ts` now requires the GET's 405; any other status or a network failure fails the scenario with its cause.
3. **Cost wording:** observed local results only, none an upper bound or production-billing figure: Codex's independent review measured race losers that reached the batch at 23–30 reads / 2–10 writes and a forced reference-sequence refund at 26 reads / 12 writes; Claude Code's own race scenario sampled 24 reads / 2 writes (same in three runs; it does not force the costlier paths). Production billing stays unmeasured (PROPOSAL §18, "Costs and quotas, corrected").
4. **Privacy, explicit:** each request's `client_hash` is persistent (not per day) and links all stored requests from one client identity under one key version; request-retention deletion is not implemented, so requests and their hashes stay until deleted by hand. Both remain activation gates (PROPOSAL "Keyed hashes instead of salts"; ADR-043).

Checks (Node 24): `npm test` 305/305 (3 new BOM tests fail on the old decoders); `npm run check` 0 errors; `npm run test:worker` 30/30 in three consecutive runs (real local Workers/D1).

## Quotation workflow checkpoint 1: Codex review findings repaired (2026-10-16; local, uncommitted, awaiting a focused Codex recheck)

Checkpoint 2 remains paused and the workflow remains disabled. Details: PROPOSAL_QUOTATION_WORKFLOW.md §18, "Codex independent review".

Codex's four findings are repaired:
1. **Reference numbers** come from a per-year sequence row inside the atomic save, not a scan of the year's requests (about 18,000 rows read before).
2. **No-JS bodies** are decoded strictly: malformed escapes and invalid UTF-8 are refused before any database access.
3. **The privacy acknowledgment** must be exactly `yes`.
4. **Identical retries** reveal the reference only to the same visitor (stored keyed hash); others get a reference-free acknowledgment. Neither uses quota. After a key rotation the retry gets 409.

Measured D1 cost (real local runtime):

| Outcome | Rows read | Rows written |
|---|---|---|
| Accepted, empty database | 31 | 23 |
| Accepted, 36,000 earlier requests | 33 | 22 |
| Identical retry | 1 | 0 |
| Client at its limit | 3 | 0 |
| After the cap | 1 | 0 |
| Race losers reaching the batch (Codex's independent review; observed, not an upper bound) | 23–30 | 2–10 |
| Forced reference-sequence refund (Codex's independent review; observed) | 26 | 12 |
| Race loser, Claude Code's race scenario (sampled) | 24 | 2 |

Accepted-request cost is bounded but not constant. Ordinary refusals write nothing; race compensation does write. No claim is made about which quota runs out first.

Checks:
- `npm run check`: 0 errors.
- `npm test`: 302.
- `npm run test:browser`: 21/21 + 55/55.
- `npm run test:worker`: 29/29, three times.
- `npm run check:release`: passed.
- `git diff --check`: clean.
- Flag-off build: unchanged.
- Production config: untouched.

The Turnstile plan now separates submission idempotency from Siteverify retry keys; Siteverify's handling of repeated keys stays unresolved.

Activation gates, all pending:
- Codex recheck.
- IP-header preview verification.
- Turnstile and the no-JS decision.
- Owner-warning email.
- Production config.
- Request retention.
- Privacy wording.

## Quotation workflow checkpoint 1 second repairs (2026-10-16; local, uncommitted, awaiting Codex's independent review)

Checkpoint 2 remains paused. PROPOSAL_QUOTATION_WORKFLOW.md §18 ("second review" and "second repairs") has the details.

What changed:
- A one-row daily total replaces the per-request `COUNT(*)`.
- A read-only pre-check refuses visitors at their limit, and anything after the cap, with no writes.
- Reservation, storage and notification queueing are one atomic D1 batch. A failed save consumes nothing, and undo writes happen only in races.
- The cap-reached marker is the hook for one owner warning per day.
- The key-rotation retry message and the local-config comment are corrected, and the sizes are stated exactly (27,027 / 37,519 bytes).
- The Turnstile activation plan is written; it is not implemented.

Measured D1 cost (local runtime, D1's own metadata):

| Outcome | Rows read | Rows written |
|---|---|---|
| Accepted | 27 | 22 |
| Identical retry | 1 | 0 |
| Client at limit | 3 | 0 |
| After cap | 1 | 0 |
| Validation | 0 | 0 |

A failed batch leaves nothing behind; its billing in production is unverified. Refusals are bounded, not free. (The claim that Worker invocations are the practical flood ceiling is withdrawn; see the Codex review entry above.)

Checks:
- `npm run check`: 0 errors.
- `npm test`: 273.
- `npm run test:browser`: 21/21 + 55/55.
- `npm run test:worker`: 27/27, twice.
- `npm run check:release`: passed.
- `git diff --check`: clean.
- Flag-off build: unchanged.
- Production config: untouched.

Gates before activation:
- Codex review.
- Controlled preview verification of the IP header (a rate-limit result alone is not proof).
- Turnstile, including approval to end no-JS intake.
- Owner-warning email.
- Production config.
- Request retention.
- Privacy-wording approval.

## Quotation workflow checkpoint 1 repairs (2026-10-16; local, uncommitted, awaiting Codex's independent review)

Checkpoint 2 is paused. The checkpoint 1 review findings are repaired; PROPOSAL_QUOTATION_WORKFLOW.md §18 ("Checkpoint 1 review" and "Checkpoint 1 repairs") has the details and the trust boundary.

What changed:
- **Rate limits:** IPv6 is grouped by /64. A missing or invalid `CF-Connecting-IP` is refused. A global cap allows 200 new requests per day. (The "at most one refunded increment" claim made here was imprecise; superseded by the second repairs above.)
- **Keyed hashes:** keyed with an `INTAKE_HMAC_KEY` secret instead of a stored salt. Counters are deleted after 48 hours by a scheduled cleanup.
- **Body caps:** derived from worst-case encodings, with a useful 413 message.
- **Body contract:** strict JSON with no repeated keys.
- **Idempotency:** identical JSON retries return the earlier reference without using quota; a changed payload gets 409.
- **No-JS duplicates:** keyed on the full payload and the client, and the duplicate page never repeats a reference.
- **Refusal pages:** explain how to retry and how to call.

Production impact: none. `wrangler.jsonc`, `public/`, the lockfile and dependencies are unchanged. Against a build of the exact `HEAD` commit, the flag-off build differs only in Contact's CSS and script assets and their links; the only other differences are line endings in three public files from the git export.

Checks (Node 24.11.1):
- `npm run check`: 0 errors and warnings.
- `npm test`: 15 files, 268 tests (simulated D1).
- `npm run test:browser`: 21/21 + 55/55.
- `npm run test:worker`: 25/25 in three consecutive runs, on the real local Workers runtime and D1.
- `npm run check:release`: automated requirements met.
- `git diff --check`: clean.

Network, stated precisely: the browser in `test:worker` can reach only the local Worker, and that is enforced. Wrangler itself contacted the npm registry for its update check, and its metrics were off. The earlier claim that no requests left the machine applied to browser traffic only.

Open before enabling:
- verify Cloudflare's handling of a client-sent `CF-Connecting-IP`
- set the intake secret
- privacy-wording approval
- request-retention purge

Observed local-tooling issue: Wrangler's dev proxy fails the request after a streamed 413 (§18).

## Quotation workflow checkpoint 1: request storage and validation (2026-10-16; local, uncommitted, awaiting independent review)

The owner approved the revision-3 quotation design for local implementation (ADR-043). Approved defaults: 90-day retention, 14-day links, "Bank transfer (simulated)". The privacy wording stays draft. Checkpoint 1 is built and is the stopping point for independent review; PROPOSAL_QUOTATION_WORKFLOW.md §18 has the details and the resolved plan contradictions.

**What it adds** (all disabled in the committed config):
- A public Worker intake (`worker/public/`) and a local D1 schema (`migrations/`).
- `/contact/quotation/`, the Contact link card, legacy-link redirects and CTA routing.

**Production impact:** none. `wrangler.jsonc`, the published site and the deploy pipeline are unchanged. With the flag off, every page except Contact is byte-identical. Contact differs only in asset links, two CSS rules that match nothing, and inactive script code.

**Checks** (Node 24.11.1):
- `npm run check`: 0 errors and warnings.
- `npm test`: 15 files, 225 tests. This includes 34 new Worker intake tests that run the real migration SQL on node:sqlite, plus new client and link tests.
- `npm run build`: 9 pages.
- `npm run test:browser`: 21/21 + 55/55.
- `npm run test:worker` (new): 15/15, using the pinned wrangler 4.147.0 from the npx cache with real local D1 and Playwright's cached Chromium headless shell. It covers:
  - JSON intake and duplicates
  - origin and media-type refusals
  - validation without echoing values, and the honeypot
  - the quotation page with and without JS
  - Contact with the flag on, and legacy redirects
  - fit at 390 px and at 320 px with 32 px text
  - stored rows and queued jobs
  - no off-origin browser requests and no personal data in Worker output
- `npm run check:release`: automated requirements met.
- `git diff --check`: clean.

Screenshots (ignored): `design/references/quotation-intake/shots/`.

**Unchanged and still pending:** Formspree recipient verification and production receipt, and CE review.

**Not tested:** Firefox/Safari, real devices, screen readers.

Nothing was emailed, submitted for real, created, bought, committed, pushed or deployed.

## Seven-step payment walkthrough published and verified live (2026-10-13)

Source commit `8263494165b4f568c7a1734c59e56a99f708bf00` (17 paths; PUBLICATION_MANIFEST.md) was committed on `payment-journey` with the owner's configured identity. A fresh origin check found `main` still at `dd59c82`; `main` was fast-forwarded without rewriting history and pushed to `origin/main`, authorizing Cloudflare's automatic deployment, which was serving the new page on the first poll.

Live read-only verification at https://buildtrack.sunnydelacruz.workers.dev/ passed **117 headless Chromium checks**. Browser requests were limited to same-site GET and every other request was failed in the browser:
- **Routes:** eight routes return 200 and an unknown route returns 404.
- **Pricing:** "Try the payment demo" opens `/payment-demo/`; Avail and quotation links still open Contact inquiries.
- **Disclosures:** About and How It Works carry the shared disclosure "nothing is collected, charged or emailed, and no payment provider is connected", with the estimator still pending CE review.
- **Payment page basics:** metadata and the seven-step progress list are correct. There is no provider-sandbox box and no fields, forms, links, images, addresses or payment/bank detail terms.
- **Journey:** all six card/bank × success/failure/cancellation journeys pass, with the owner/customer/provider role labels, the persistent notice, focus on each heading, "illustrative, not sent" email previews, "This sample contains no link" and the exact "Simulated—no money moved. Not a payment receipt.".
- **Other paths:** decline (progress stays at Customer decision), Back, Start over, reload restart and keyboard Enter/Tab pass.
- **Layouts:** every step fits at 390 px and at 320 px / 32 px; the no-JS view shows the notice, quotation and explanation.
- **Inquiry regressions:** Contact preselects service + Professional, and an empty submit focuses the error summary. A completed fictional submit was blocked in the browser before sending, and the page showed "We couldn't send your request", not success. No runtime errors.

The live HTML for `/payment-demo/` (scripts inlined), About, How It Works and Pricing matches the tested local build by SHA-256. Evidence is ignored under `design/references/payment-journey-live/` (probe, results, screenshots).

No real inquiry, email, payment, provider request, account or dependency installation. Payments and emails stay simulated, provider integration stays deferred, and CE review and both Formspree gates (recipient verification, production-request receipt) remain pending. Safari/Firefox, real devices and screen-reader speech remain unverified. The personal prompt and BaseLayout line-ending-only status stay outside both commits.

## Payment demo extended to the seven-step journey; provider integration deferred (2026-10-13; approved for publication)

The owner approved the seven-step simulated payment walkthrough for publication on 2026-10-13. The exact source manifest is in PUBLICATION_MANIFEST.md (2026-10-13 payment-journey section). Payments and emails stay simulated, provider integration stays deferred, and CE review and both Formspree gates remain pending. The publication and live-verification record follows separately.

Owner decision (ADR-042): PayMongo setup dropped, payments stay entirely simulated. `/payment-demo/` was extended, not rebuilt:
- **Journey:** sample quotation (owner) → quotation-email preview → customer accepts or declines → payment-invitation email preview → Card / Bank transfer (simulated) → fictional checkout illustration (no fields) → simulated success / failure / cancellation with restart.
- **Labels:** owner, customer and illustrated-provider steps are labelled distinctly. The persistent notice reads "Academic payment demonstration — no real payment or email is sent." Every result reads "Simulated—no money moved. Not a payment receipt."
- **Email previews:** they contain no addresses or links and are not connected to Contact inquiries.
- **No-JS:** the quotation and notice are shown, with a note listing the remaining steps.
- **Removed:** the provider-sandbox box, `src/config/payment-sandbox.ts`, `src/lib/payment-sandbox.ts` and their 31 unit tests (nothing else used them).
- **Wording:** the page intro, meta description and payment disclosure now add "emailed". Pricing's demo link and inquiry CTAs are unchanged.
- **Docs:** DECISIONS ADR-042, UX_BRAND §16, ARCHITECTURE, PROPOSALS (deferral note; research preserved) and PRESENTATION_HANDOFF §3a (what works, what is simulated, the real future process).

Checks (Node 24.11.1, headless Chromium from the local Playwright cache, off-origin requests blocked, inquiry responses mocked, nothing submitted):
- `npm run check`: 0 errors/warnings.
- `npm test`: 13 files, 180 tests.
- `npm run build`: 9 pages.
- `npm run test:browser`: 21/21 + 57/57. The rewritten payment scenario covers every method × outcome, role labels, email previews, no fields/links/addresses, decline, Back, Start over from each step, reload, keyboard, every step at 320 px / 32 px and no-JS. The second number includes an `EVIDENCE_DIR` capture scenario.
- `npm run check:release`: automated requirements met.
- `git diff --check`: clean.

Visual review found the email/checkout label border stopping at the global paragraph measure; fixed. Screenshots (ignored): `design/references/payment-journey/shots/` (every step at 1440, 390 and 320 px / 32 px; bank checkout, failure, declined and no-JS at 1440). Not tested: Firefox/Safari, real devices, screen-reader speech. Nothing committed, pushed or deployed; no email, inquiry, account or transaction. The entry below is superseded by this decision.

## Provider TEST checkout preparation (2026-10-13; local, uncommitted; superseded the same day by ADR-042)

The PayMongo documentation was retrieved directly (no longer from search snippets) and recorded in PROPOSALS_ENGINEERING_PAYMENT.md B.1. The documented test-link format `https://pm.link/{business_handle}/test/{reference_number}` matches what `src/lib/payment-sandbox.ts` already accepts, so the validator logic is unchanged. Only its source comment was updated. The connected-state copy on `/payment-demo/` now warns against scanning a provider QR code with a real app, because PayMongo says test QR Ph codes are real. The config stays null/false. Planned first flow (manual): inquiry → owner emails quotation → customer accepts by reply → owner emails the TEST link → owner checks the PayMongo test dashboard. No automated emails, backend or database. Checks (Node 24.11.1): `npm run check` 0 errors/warnings; `npm test` 209/209; `npm run build` 9 pages; `npm run test:browser` 21/21 + 55/55; `npm run check:release` automated requirements met; `git diff --check` clean. The connected branch was rendered once with a fictional sample link in a scratch build, and the committed config was then restored. Unresolved and requiring the owner's account: whether test mode works before KYC/wallet activation, whether dashboard Test Mode creates a `/test/` link, and which methods (cards, BPI/UnionBank) the test link offers. No account, key, link, request, email or transaction.

## Academic review version published and verified live (2026-10-13)

Source commit `4ac95aec376a5a6dca6aa066f2439cef0937a2d0` was committed on `home-drawn-capabilities` using the owner's configured identity and existing attribution conventions. A fresh origin check found `main` still at `cc93f70`; `main` was fast-forwarded without rewriting history and pushed to `origin/main`, authorizing Cloudflare's automatic deployment. Exact source manifest: 54 paths in PUBLICATION_MANIFEST.md. The personal prompt, evidence, generated output, dependencies, environments and unchanged BaseLayout were excluded.

Live address: https://buildtrack.sunnydelacruz.workers.dev/ . Read-only verification on 2026-10-13 passed 129 independent headless Chromium checks with all non-GET and off-origin browser requests blocked: eight public routes return 200, unknown routes return 404, navigation/current-route metadata and review labels match, Product Demo has the non-sticky shared header, and Pricing links to the standalone simulated payment page. Capabilities fit the three requested laptop viewports, remain stable when scrolling stops, reverse and hold correctly, expose one description, permit pointer hit-testing, and activate Deliveries after keyboard focus followed by scrolling. Preference changes preserve Pricing's reading position, including retained capability focus. Estimator exact/partial batch boundaries, tiny derived remainders, excess-precision rejection, labelled retained results/error focus and example restore pass. All six card/bank simulated outcomes remain explicitly simulated, collect nothing and leave the provider disconnected. Enlarged-text/no-JS fallbacks pass; no runtime errors or external requests were observed.

Exact SHA-256 comparisons match the tested build for both Home and demo scripts, six revised demo screenshots, social image and font. Robots, both sitemap files (including payment-demo) and the canonical slash redirect pass. Inquiry behavior was tested locally only with mocked responses (21 scenarios); no live inquiry was sent. Local validation: 209 unit tests, 55 UI browser scenarios, type checks and build passed; automated release checks passed with both Formspree gates pending.

An initial live probe used a fixed settle timeout that was too short for a description transition under load. The probe was corrected to await rendered frames and actual transition completion; the completed live run passed. This is a probe timing correction, not a physical-device performance claim. Evidence and asset hashes remain ignored under design/references/publication-20261013/.

This record is a separate docs-only follow-up to the source publication. Still pending: CE validation, directly verified provider documentation/eligibility, hosted banking support, Formspree recipient verification and production-request receipt. No provider account, link, keys, transaction or dependency installation was created. Safari/Firefox, real devices, true browser zoom and screen-reader speech remain unverified. The existing BaseLayout line-ending-only status and untracked personal prompt are preserved outside publication.

## Academic review version authorized for publication (2026-10-13)

The owner explicitly approved publication of the current capabilities, shared navigation, demo shell, estimator and standalone simulated payment page, with CE validation pending. This approval supersedes the historical awaiting-review entries below for this version only. No provider link is connected, no real inquiry or transaction was made, and neither Formspree delivery gate is complete.

Final fixes: the estimator calculation function and form now share the same bounds and six-decimal input contract (insignificant trailing zeros allowed; excess precision rejected rather than rounded). Derived quantities retain finer exact precision. Tests include below/exact/above multiples and a genuine derived remainder of 0.000000002 m³. A visible polite result status distinguishes current results from retained results after changed or invalid inputs, including reopening; Reset and example restore reconcile inputs and outputs. Home, the demo sidebar, payment-page introduction and shared footer identify the academic review version.

Validation and publication details are recorded in PUBLICATION_MANIFEST.md. Physical-device performance, Safari/Firefox, screen-reader announcements, CE review, provider eligibility and hosted banking remain unverified. Recipient verification and production-request receipt remain pending.

Additional independent finding fixed: a trailing strip of the audience track above Pricing was treated as active reading during a reduced-motion change, pulling Pricing from about 80 px to about 923 px. The audience reading boundary now matches the shared midpoint preservation rule. A regression checks both preference directions while Pricing is at 80 px; the exact source manifest now contains 54 paths.

Historical entries below describe the state at their dates; they do not override this authorization or imply delivery verification.

## Review findings fixed and payment demo moved to the website (2026-10-13; local, uncommitted, awaiting visual and independent technical review)

Nothing committed, pushed, merged or deployed; no inquiry, provider request, transaction, account or dependency installation (browser tests block off-origin requests and mock inquiry responses). Civil Engineering validation, provider eligibility, hosted banking, recipient verification and production-request receipt all remain **pending**. Publication paths: [PUBLICATION_MANIFEST.md](PUBLICATION_MANIFEST.md) (53 paths, checked against `git status`).
- **Batch precision:** `concrete-estimate.ts` now uses exact decimal arithmetic (BigInt units and scale); inputs are limited to six decimal places ("Use at most 6 decimal places."); the floating-point tolerance is gone. Tests below, at and above batch multiples (including 0.20000000001 m³ with 0.2 m³ batches → 2 batches, last 0.00000000001 m³; 1 x 3 x 0.1 m with 0.1 m³ → 3) and a property loop (final batch > 0 and never above rated output). Reinstating the old tolerance fails 2 of them.
- **Explanations:** the breakdown shows operands as entered and exact results ("How it is calculated (exact values)"); result cards round to 0.001 m³ / the minute and mark rounding with "≈", a tiny positive volume as "< 0.001 m³", with a legend.
- **Reopening announcement:** "Showing Concrete estimate, an academic calculation, with the values last calculated."; Reset says the estimate is back at its example values.
- **Sandbox validation:** `payment-sandbox.ts` accepts only a supported provider (PayMongo) and its test-link route, parsed structurally: `https://pm.link/{handle}/test/{reference}`, no credentials, port, query or fragment, plus owner-marked verified test mode. 28 rejection cases (look-alike and unrelated hosts, credentials, localhost/IP, ports, live routes, encoded and malformed paths) and accepted test formats; no destination contacted. Applying the previous rule fails 21. The route format comes from PayMongo's published documentation as found in search and must be confirmed against the live docs before any link is configured; config stays null/false.
- **Payment demo page** (`/payment-demo/`, shared header and footer, outside the main nav, linked from Pricing as "Try the payment demo"; ADR-041 update, UX_BRAND §16): persistent "Academic payment demonstration — no real charge." notice; fictional quotation → simulated acceptance → Card / Bank transfer (simulated) → simulated success / failure / cancellation; "Start over" / "Start again" / reload return to the quotation; focus to each step heading with a polite status; no fields, forms, banking details or records; without JavaScript the quotation, notice and sandbox box with a note. Removed from the Product Demo (sidebar, panel, Reset). Pricing's Avail and quotation links still open Contact. Sitemap: eight pages including `/payment-demo/`.
- **Checks** (Node 24.11.1, Chromium 151): `npm run check` 0 errors/warnings; `npm test` 13 files, 208 tests; `npm run build` 9 pages; `npm run test:browser` 21/21 + 54/54 (payment page incl. keyboard, no-JS and every outcome; Pricing link, inquiries and sitemap; estimator precision and reopening; reflow of `/payment-demo/` at 320 px / 32 px); `npm run check:release` automated requirements met; `git diff --check` clean. Screenshots (ignored): `design/references/payment-page/shots/` (payment page at 1440 quotation and simulated failure, 390, 320 px / 32 px, no JavaScript; Pricing link; estimator tiny remainder and too-many-decimals).

## Demo tools and sidebar focus repair (2026-10-12; local, uncommitted, awaiting visual and independent technical review)

Built at the owner's direction on top of the UI baseline Codex reviewed (no blocking regressions). Nothing committed, pushed, merged or deployed; no inquiry, transaction, account or provider request. Owner authorization to build is not Civil Engineering validation of the estimator or provider eligibility for payments. Recipient verification and production-request receipt remain pending. Publication paths: [PUBLICATION_MANIFEST.md](PUBLICATION_MANIFEST.md) (49 paths; the earlier 32-file manifest covered only the reviewed UI baseline).
- **Sidebar focus outlines:** reproduced first at 1440x350 (forward Tab: "Equipment" outline cut 5.2 px at the bottom; Shift+Tab: "Activity" cut 3.8 px at the top) and in the drawer at 390x350 (5.2 / 4.8 px, clipped by the drawer's scroll area). Fix: `scroll-margin-block` on sidebar links and buttons (`demo.css`). Regression (1440x350; drawer at 390x350 and at 1440x350 with 24 px text, opened from the keyboard) fails without the margin and passes with it.
- **Concrete estimate** (ADR-041, UX_BRAND §16): working batch-mixer calculation (`concrete-estimate.ts`) with validated inputs and an error summary, volume / waste / batches / idealized time, a dimension sketch and calculation breakdown, the constant-cycle assumption (including the final partial batch) labelled as pending CE review, no cement bags, tracking figures untouched. Unit tests: worked example (13 batches, 78 min), floating-point exact multiples (1 x 3 x 0.1 m with 0.1 m3 batches gives 3, not 4; fails without the tolerance), partial batches, smallest/largest bounds, every field at and beyond its bounds, non-decimal inputs, durations, sketch bounds.
- **Payment walkthrough** (simulation): fictional quotation at the Professional plan's proposed price (illustrative), simulated acceptance or decline, Card / Bank transfer (simulated), simulated success / failure / cancellation; no fields, forms, account details, QR codes or uploads; every outcome says simulated and "No money moved"; focus and announcements per step. **Provider sandbox:** `src/config/payment-sandbox.ts` null by default, so the demo shows "Provider sandbox not connected."; `sandboxLink()` allows a link only for an https URL with a named provider marked as verified test mode (unit-tested, including javascript:, http: and credential URLs).
- **Placement and reset:** a "Tools" group under the six tracking sections; hash entry points `#demo-panel-estimate` and `#demo-panel-payment`; the project picker is hidden in tools; Reset (and reload) also restores the estimate's example and restarts the walkthrough, and the reset announcement says so. Public wording: How It Works and About list the estimate as working (not yet reviewed by a civil engineer) and the walkthrough as simulated with no payment provider connected; REQUIREMENTS' excluded scope (online payments) is unchanged and notes the tools.
- **Checks** (Node 24.11.1, Chromium 151, off-origin requests blocked, inquiry responses mocked): `npm run check` 0 errors/warnings; `npm test` 13 files, 179 tests; `npm run build` 8 pages; `npm run test:browser` 21/21 + 53/53 (one round found an overflow at 320 px / 32 px without JavaScript in the quotation's label/value rows, fixed; and a drawer test opened by mouse, corrected to keyboard); `npm run check:release` automated requirements met. Screenshots: `design/references/demo-tools/shots/` (estimate and payment at 1440x900, 390, 320/32 px; errors, custom result, simulated result).

## Site header restored on Product Demo (2026-10-12; local, uncommitted, awaiting review)

At the human's request the shared site header and top navigation are back on `/product-demo/` (non-sticky, as previously approved: `BaseLayout stickyHeader={false}` and the Header's `sticky` option restored to their earlier code). The application layout stays beneath it: full-height sidebar starting at the rendered bottom of the header (65 px desktop, 57 px mobile, 81 px at 20 px text, 246 px at 320 px/32 px where the header wraps), compact workspace toolbar, short introduction and disclosures. Removed as duplicates of the restored header: the workspace's mobile "Back to website" link and the emblem added to the sidebar's application name (back to the earlier "BuildTrack Platform demo" text); the sidebar's Back to website stays. Screenshots: laptop and phone recaptured at `#demo-app` (header scrolled off, as documented); the four section crops differed by at most 7/255 on anti-aliased pixels, so those files and the capability drawings are unchanged. Regression updated: header present, non-sticky, current page marked; sidebar at the header's bottom; no website links in the workspace; mobile Menu above the app toolbar; the navigation-indicator scenario again includes Product Demo. Checks: `npm run check` 0 errors/warnings; Home/demo browser suite 50/50. The entry below describes the interim header-free version for the demo page; the rest of it stands.

## Pacing fix, connectors, blueprint grid and demo shell (2026-10-12; local, uncommitted, awaiting visual review)

Nothing committed, pushed, deployed or sent. Recipient verification and production receipt remain pending; engineering/payment remain research-only.
- **Capability pacing regression (Codex):** the figures carried `data-reveal`, so the generic 500 ms entrance transition and `reveal.ts` also drove them (smoothing every scroll-driven change and continuing after scrolling stopped). Progression now uses `data-cap-windows`. New regression checks rendered figure opacity, running animations, stability 400 ms after scrolling stops, capability boundaries and Tab/Shift+Tab finished screens; against the defective attribute it fails (a finished screen rendered at opacity 0.156 with 5 running animations), with the fix it passes.
- **How It Works connectors** (screenshot 2026-10-12 20:08): drawn from one circle's outer edge to the next, never through a circle; vertical when the flow stacks. Regression: 0 px gaps and centred at 1440, 1024 and 390 px (16 px text), 1440 px (32 px) and stacked at 390/320 px (32 px).
- **Blueprint grid** (UX_BRAND §15, ADR-040 proposed): shared tokens in `tokens.css` on navy/ink background surfaces across pages; quiet on the header and demo sidebar; never on the Home hero video, photo-backed closing band, forms, tables, charts or screenshots. Regression checks placement on 18 surfaces and none on Contact's form, media or tables.
- **Product Demo shell** (UX_BRAND §11.4, ADR-039 proposed): no site header on the demo page (`BaseLayout siteHeader={false}`; the Header's now-unused sticky option removed); full-height sidebar (identity, Back to website, sections, simulation note); compact workspace header; the marketing intro replaced by a short introduction (the page's only h1) and a fuller disclosure; mobile app header with Back to website and the Sections drawer. Regression: shell with and without JavaScript, skip link, workspace header controls, hash entry points (fresh loads), mobile header, short window with 24 px text. Inspected at 1440x900, 1280x800, 1366x650, 1536x730, 390, 320/32 px, 1440/20 px and no JavaScript: one h1, no overflow, sidebar sticky where it fits.
- **Screenshots recaptured** from the new shell (UX_BRAND §11.5; record `design/references/demo-shell/screens-raw/capture-record.json`, previous files in `screens-before/`): laptop, phone and four section crops, used on Home, Solutions and How It Works. Capability drawings re-measured (21-31 paths; alignment `design/references/capabilities-drawn/align-sheet-shell.png`); alt texts for Equipment (Home and Solutions), laptop and phone updated.
- **Performance** (headless Chromium 151, fixed build vs the same build with only the old attribute, 3 interleaved runs each, recording separate; values per second of the 7.8 s pass): rAF callbacks 142-146 vs 145/s; callback intervals p50 6.1 ms and p95 11.9-12.0 ms in both (callback intervals are differences between requestAnimationFrame timestamps, not execution time or confirmed dropped frames; headless has no real display); style recalculations about 91 vs 68/s; main-thread task time about 138 vs 120 ms/s; no long tasks while scrolling in either (traces: startup tasks only). Earlier entries' "frame" wording should be read as callback intervals, and their per-pass work totals were not normalised by duration.
- **Checks:** `npm run check` 0 errors/warnings; `npm test` 142/142; `npm run build` 8 pages; `npm run test:browser` 21/21 + 50/50; `npm run check:release` automated requirements met. A test that loaded a hash on the already-open demo page hung (a same-page hash change fires no load event); it now loads a blank page first. Evidence (ignored): `design/references/shell-perf/` (recordings at 1366x650 and 1440x900, timing), `demo-shell/` (shots, grid, screens), `capabilities-drawn/`.

## Capabilities pacing revision (2026-10-12; local, uncommitted, awaiting visual review)

Inspected first: the human's Brave recording (`Videos/NVIDIA/Brave Browser/Brave Browser 2026.10.12 - 19.17.34.01.mp4`, 9 s, 1920x1080): each capability went from the faint schematic to a nearly complete screenshot within about half a second of scrolling. Change (`index.astro`, `capability-stage.ts`; UX_BRAND §13, ADR-037 update): 760-900 px per capability (was 560-760); outlines draw one after another in reading order over ~40% of each segment, about four at a time; each band of the screenshot is revealed with an eased sweep from just before its first outline completes, overlapping later outlines, until 75%; exact finished screen held for the last 25%; keyboard jumps land at 87%. Native scrolling only; everything is a function of scroll position. Pinned track: 2826 -> 3625 px at 1366x650, 3507 -> 4007 px at 1440x900. Construction at 1440x900: complete at about 600 px into the segment (was about 300 px); at 1366x650 about 540 px (was about 240 px), measured by equal-distance frames.

Regressions: the capability scenario now checks outlines completing progressively (2-6 in progress early, more completed at 12/20/28/36%), overlapping reveal, no reveal step above 0.15 between samples 2% apart, not finished at 70%, exact hold from 75%; it fails against the previous pacing (a 0.16 jump at 14%) and passes now. The navigation scenario now waits for the indicator's transition to finish instead of a fixed 350 ms (it once failed under load). Home/demo 46/46. Performance (headless Chromium 151, same pass for both builds, 3 runs each, timing separate from recording): rAF callback interval p50 6.1 ms both; p95 6.4 -> 12.1 ms (timestamp spacing, not work duration or evidence of missed frames; headless has no physical display); callback intervals over 50 ms 3-5 vs 4-6; style recalculation about 180 -> 290 ms per (13% longer) pass; no long tasks in the scroll phase in either (traces: startup tasks only). Evidence (ignored): `design/references/capabilities-pacing/` (`user-recording/` sheet, `recordings-before/` and `recordings-after/` at 1366x650 and 1440x900 with 100 px wheel notches every 150 ms, `frames/compare-*.jpg` equal-distance frames, `timing/`).

Proposal corrections (`docs/PROPOSALS_ENGINEERING_PAYMENT.md`): estimator limited to a batch mixer, constant cycle time including the final partial batch stated as an assumption pending CE review (not a physical rule or proven conservative), truck/continuous-mixer references separated as context; PayMongo test-link setup made conditional on verifying account eligibility and the creation workflow; manual API creation outside BuildTrack noted as needing no website backend; hosted banking flow kept unverified; webhook retries corrected (automatic retries up to 12 times with backoff, then manual resend). Nothing implemented.

## Post-launch enhancements on `home-drawn-capabilities` (2026-10-12; local, uncommitted, awaiting the human's visual and scope review)

Published baseline unchanged: `main`/`origin/main` at `cc93f70`; the live site still shows the approved redesign. Nothing committed, pushed, merged or deployed; no inquiry, account, key or transaction. Formspree recipient verification and the production test request remain **pending**. No visual approval is implied by automated checks.

**1. Capabilities focus defects (Codex review, both reproduced first at 1440x790 with real Tab, wheel and Enter):** (A) after Tab to "Open Materials" and scrolling to Deliveries, Materials kept focus inside its hidden description and Enter opened `#demo-panel-inventory`; (B) retained Materials focus overrode the reading position: turning on reduced motion at Deliveries pulled the page back to Materials (3208 -> 2031 px), and from Pricing back into the section (8108 -> 2031 px). Fix (`capability-stage.ts`): a hidden link is never left focused; when scrolling or a layout switch changes the shown capability, focus on a capability link moves first to the shown capability's link (no scrolling, once per change, never to BODY); layout switches follow focus only while it is engaged (keyboard-placed, or on screen at the last scroll), otherwise the reading position wins and visitors elsewhere are not moved; reading position is recorded only when no layout change is pending. New regressions: retained focus following the shown capability with Enter after scrolling, Tab/Shift+Tab after scrolling, Ctrl+click; and reduced-motion, viewport width, viewport height and text-size switches each with the visitor inside the section, beyond it at Pricing, and in the static list after Tabbing then scrolling. Against the defective script: 3 scenarios fail (including the Pricing drag-back in isolation); with the fix all pass.

**2. Capabilities visual refinement (UX_BRAND §13, ADR-037 proposed):** each screenshot's drawing is now outlines of its own measured regions (13-27 paths, no glyphs) in 4-5 bands; each band draws in, then that band of the screen fades in with a soft sweep (CSS mask) while its outlines fade; phases overlap; the yellow wipe edge is removed; the finished screen is exact and holds from 42-49% of each segment; everything follows the scroll position. Descriptions now sit under their own headings (shared slot removed; no repeated heading; collapsed ones stay focusable and named "<label>: <title>"); the column reserves its tallest open height so the stage never moves. Pins at 1024x700, 1280x600, 1280x720, 1366x650, 1440x790, 1536x730, 1440x900 and larger; static at enlarged text (kept deliberately), reduced motion, no JS, failed start, below 64rem. Static layouts pixel-identical to before (no-JS and reduced motion at 1440, 390/32px; other differences only lazy images). Paired headless timing, checkpoint-1 build vs this build, three runs each, recording separate: frame interval p50 6.1/6.1 ms, p95 6.6-12.0 vs 6.4-6.5 ms, frames over 50 ms 3-5 vs 4-5, observed long tasks 1 (56 ms) vs 0; style recalculation 141-153 vs 156-180 ms per pass; HTML +8 KB. Traces (thread_name metadata, startup and scroll phases separated): the startup task (Home script evaluation, about 175-215 ms) occurs in every run of both; scroll-phase GPU-raster commit waits (no main-thread script/style/layout) in 4/5 checkpoint-1 runs and 0/5 runs of this build. Headless measurements only, not device evidence.

**3. Shared navigation indicator (UX_BRAND §14, ADR-038 proposed):** one moving yellow indicator under the current page, a hovered link, or a keyboard-focused link (keyboard takes over from a resting pointer; return to focus, then the current page); routes without a matching link show it only on hover/focus; reduced motion moves it at once; no-JS and the mobile menu keep static markers; link padding with a smaller gap keeps text spacing (nav +16 px; 96 px spare at the 1200 px breakpoint). Checked on Home, Solutions, Pricing, Product Demo, Contact and 404. Observed, unchanged: a small yellow mark below the open mobile menu panel on Pricing, identical in the previous build.

**4. Engineering and payment proposals (research only):** `docs/PROPOSALS_ENGINEERING_PAYMENT.md`: a deterministic concrete quantity and mixer-batch estimator (equations, bounds, worked example, exclusions including cement bags, validation and required CE review), and a PayMongo test-mode payment demonstration (pre-created test Payment Link from a labelled button; what needs a server; bank transfer limits; activation requirements; copy implications). Both change scope and need decisions first.

**Checks (Node 24.11.1, Chromium 151, off-origin requests blocked, provider mocked, no inquiry):** `npm run check` 0 errors/warnings (1 existing hint); `npm test` 142/142; `npm run build` 8 pages; `npm run test:browser` 21/21 + 46/46 (three consecutive clean runs of the Home/demo suite during the work); `npm run check:release` automated requirements met, two manual gates open. Evidence (ignored): `design/references/capabilities-focus/`, `capabilities-drawn/` (recordings at 1366x650 and 1440x900, phase frames, holds, static screenshots, timing), `nav-indicator/` (recording, screenshots). Not tested: Firefox, Safari, real devices/touch, screen readers, true browser zoom.

## Milestone (final redesign approved and published, 2026-10-11)

**Approved by the human 2026-10-11 (ADR-036):** the final redesign of all pages, the Home audience media treatment and its seven licensed clips/posters for publication, the public page copy, and the current privacy and confirmation wording for this academic prototype. The human authorized committing the reviewed changes on `ui-redesign`, merging into `main` without history rewriting and pushing for Cloudflare's automatic deployment. **Not release acceptance:** Formspree notification-recipient verification and receipt of a production test request remain **pending** (the two open manual gates in `npm run check:release`). No inquiry has been sent. Commit, merge and live verification below.

### Publication and live verification (2026-10-11)

- **Commit:** `ce1fcbd` "feat: complete approved site redesign" on `ui-redesign` (author OppiRah, configured identity; no agent attribution), exactly the 52 paths in `docs/UI_REDESIGN_REVIEW.md` (22 added, 24 modified, 6 deleted). Pre-commit: working tree equal to the manifest; no agent names in `src`, `tests`, `public`, `scripts` or `dist`; credential-pattern scan clean; `git diff --check` only the documented blank line at the end of `UX_BRAND.md`.
- **Merge and push:** `main` fast-forwarded `aa9b977..ce1fcbd` (`origin/main` confirmed unchanged first; no force, no history rewrite) and pushed to `origin/main`. `ui-redesign`, `main` and `origin/main` all at `ce1fcbd`; the `ui-redesign` branch itself was not pushed.
- **Final local checks on the committed tree** (Node 24.11.1, Chrome 151, external requests blocked, provider responses mocked, no inquiry): `npm run check` 0 errors/warnings (1 existing ignored-script hint); `npm test` 142/142; `npm run build` 8 pages; `npm run test:browser` 21/21 + 35/35; `npm run check:release` automated requirements met, two open manual gates, three recorded approvals.
- **Deployment:** Cloudflare Workers Builds served the new build at https://buildtrack.sunnydelacruz.workers.dev about 17 s after polling began. **68/69 built files byte-identical** to the local build of `ce1fcbd`, including all seven audience MP4s and posters; the 69th, `_headers`, is hosting configuration consumed by Cloudflare (404 as intended) and its rules are in effect (immutable cache on `/_astro/*`; nosniff, Referrer-Policy, X-Frame-Options and HSTS on pages). Correct content types for HTML/CSS/JS/WebP/JPG/PNG/SVG/WOFF2/MP4/XML/TXT. Unknown URLs return the custom 404 page with status 404 and `noindex`.
- **Metadata:** all 7 routes have title, description, canonical and `og:url` equal to their live URL, and `og:image` (200, image/png); robots.txt Sitemap line and sitemap index present; sitemap lists the 7 routes and not the 404 page.
- **Live browser checks** (Chrome 151 headless, read-only; every request to any other origin blocked including Formspree; 0 POST requests, 0 page errors, 0 failed loads): desktop navigation (8 links, all 200, current page marked); one h1, header and footer with no horizontal overflow on all 7 routes at 1440 and 390px; mobile menu Enter/Tab/Escape with focus return; enlarged text keeps focus on the same header link with the menu open; Home loads all 20 images and decodes all seven audience videos at natural sizes; reduced motion requests no audience video and shows seven static titles; workflow cards open the three How It Works steps below the header; Contact preselection for `type=demo`, `type=quotation&service=equipment-tracking`, `type=service&plan=professional` and `plan=enterprise` applied and editable, script-like values ignored and not echoed; Pricing "Avail" links preselect each plan; an empty Contact submit focuses the error summary (7 errors) and sends nothing; prices ₱2,990/₱7,990/₱19,990; How It Works still lists production receipt as still to come; 404 renders. Product Demo: disclosure shown; project filter 18 → 6 materials; seven Simulate scan clicks add exactly 5 events (limit holds); Reset returns to Overview, all projects, "0 of 5" and the original 19 events, confirmed by direct inspection (the scripted check misread the post-Reset step: a harness sequencing issue, not a site defect).
- **Still pending (release gates):** Formspree notification-recipient verification and receipt of a production test request (record date and pass/fail only). Not tested: Firefox/Safari, real devices/touch, screen readers, true browser zoom. Known limitation: four-second hard loop cuts in the audience clips. Evidence: ignored `design/references/live-final/`.
- This live-verification record was committed separately after the push as a documentation-only change.

## Independent recheck and publication preparation (2026-10-11)

**Both Solutions findings are resolved.** Independent native Tab checks at 390x844 with genuine 32px default text, JavaScript on/off, expose every complete focus outline; the final outline ends at 833.47px / 832.86px. The two current Solutions regressions pass in isolation. Settled measurements confirm the focus-scroll margin does not change page height or label/link geometry. Fresh build and automated release checks pass. The broader redesign review was not repeated.

Publication-content audit and the exact proposed 50-path commit manifest are recorded in [UI_REDESIGN_REVIEW.md](UI_REDESIGN_REVIEW.md). Runtime source/media were preserved; only this state entry and the new review record were written. Nothing staged, committed, merged, pushed, deployed or submitted. Four manual release gates remain pending. Audience provenance still limits approval to local playback, so final production-media signoff also needs resolution before publication. Unavailable browser/device checks and four-second loop cuts remain disclosed limitations.

## Fix: Solutions final jump-link focus outline (2026-10-11)

**Fixed locally on `ui-redesign`; uncommitted; awaiting review.** No commit, push, merge, deployment or inquiry. Manual release gates unchanged and still pending.

Reproduced at 390x844 with a genuine 32px default font, Tabbing through all four jump links: after native focus scrolling, "04 Reporting" box ended exactly at the viewport bottom, so its 3px outline + 2px offset was cut off by 5.5px (JavaScript on) / 4.9px (off); links 1-3 were fine and no clipping ancestor was involved. Fix: `scroll-margin-block: var(--space-2)` on `.jump a` in `src/pages/solutions.astro`, so focus scrolling stops with the complete outline in view (now ends at 833 of 844px). The outline is unchanged, and page height plus every jump-link box are identical before/after at 390/32px (JS on/off), 320/32px, 390/16px and 1440/16px.

Regression: new `tests/browser/home-demo-ui.ts` scenario Tabs through the four links at 390px/32px with JavaScript on and off, waits for scrolling to settle, and checks each complete outline extent (box + offset + width) against the viewport, any sticky header and every clipping ancestor. It fails against the previous `solutions.astro` (34/35) and passes with the fix. Checks: `npm run check` 0 errors/warnings (1 existing hint); `npm test` 142/142; `npm run build` 8 pages; `npm run test:browser` 21/21 + 35/35; `npm run check:release` automated requirements met. Evidence: ignored `design/references/solutions-label-fix/` (`*-focus-04-390-32px.png`, `jump-outline.mjs`).

## Fix: Solutions labels at enlarged text (Codex medium finding, 2026-10-11)

**Fixed locally on `ui-redesign`; uncommitted; awaiting review.** No commit, push, merge, deployment or inquiry. Manual release gates unchanged and still pending (recipient verification, production test request, provider privacy wording, owner copy approval).

Reproduced at 320 and 390px with a genuine 32px browser default font (`Page.setFontSizes`), JavaScript on and off: all four capability jump links overran their grid cells ("01 Materials" / "02 Equipment" and "03 Deliveries" / "04 Reporting" overlapped, the right-hand links were cut off by the intro's overflow clipping), and at 320px every numbered capability label ("02 EQUIPMENT") ran past its column and was clipped by the section's `overflow-x: clip`. Page-wide overflow stayed 0, which is why the earlier sweeps passed.

Fix (`src/pages/solutions.astro`, CSS plus two wrapping spans, no hidden overflow, no smaller text): jump links keep two columns but stack one per row when the screen is narrow relative to the text size (`max-width: 22em`); number and name wrap independently and the name may shrink and wrap. Capability labels wrap, putting the number and icon+name on separate lines when they do not fit; the name may wrap. Desktop 1440x900 is pixel-identical to before; 390px with 16px text keeps two columns; 320px with 16px text now stacks (20em wide).

Regression: new `tests/browser/home-demo-ui.ts` scenario measures the rendered text of every jump link and capability label at 320/390px, 32px, JavaScript on/off: text inside its own box and on screen, not clipped by any overflow-clipping ancestor, no link-link or number-name overlap. It fails against the previous `solutions.astro` (33/34) and passes with the fix. Checks: `npm run check` 0 errors/warnings (1 existing hint); `npm test` 142/142; `npm run build` 8 pages; `npm run test:browser` 21/21 + 34/34; `npm run check:release` automated requirements met. Keyboard: Tab reaches the four jump links in order with visible outlines at 390px/32px. Evidence: ignored `design/references/solutions-label-fix/`.

## Milestone (consistency pass and review handoff, 2026-10-11)

**About and Contact visually approved by the human 2026-10-11. Final consistency pass done locally: header focus-loss fix, shared CTA heading wrapping, 404 aligned with the redesign, Product Demo intro/steps polish, narrow enlarged-text hyphenation, Pricing amounts kept on one line; `docs/PRESENTATION_HANDOFF.md` updated. Ready for Codex's independent review.** `ui-redesign`, uncommitted; `main` and `origin/main` remain `aa9b977` (the published review version, so the live site does not show the redesign). No commit, push, merge, deployment or inquiry.

Changes in this pass: `src/scripts/nav.ts` (focus handling), `tests/browser/home-demo-ui.ts` (new scenario), `src/components/site/CtaBand.astro`, `src/pages/404.astro`, `src/pages/product-demo.astro` (intro background, how-to steps), `src/styles/global.css` (narrow-text hyphenation), `src/pages/how-it-works.astro` (narrow flow), `src/pages/pricing.astro` (amount cap), docs.

Verification (Node 24.11.1, Chrome 151 headless, all off-origin requests blocked, provider responses mocked, no inquiry): `npm run check` 0 errors/warnings (1 existing hint in ignored `design/references/audience-natural/encode.mjs`); `npm test` 142/142; `npm run build` 8 pages; `npm run test:browser` 21/21 + 33/33; `npm run check:release` automated requirements met. Focus fix reproduced first on Pricing, Contact and Product Demo (focus to `body`, next Tab skipped the header in both directions); after the fix focus stays on the same link with the menu open, Tab continues inside it, and a hidden Menu button hands focus to the current page link. Page probes rerun: Pricing 22/22, How It Works blueprint 16/16, About/Contact 21/21. All 8 routes: no horizontal overflow at 320/390px 16/32px (JS on/off), 768, 1024/1440 16/32px. Words wider than their line: none on any route at 320px with 16px text; at 320-390px with 32px text many long words and headings still must break across all pages (mostly earlier-approved layouts), now hyphenated where the browser can; capitalised words such as "Philippine" or "Professional" can still split without a hyphen there. Prices never split.

### Handoff for Codex independent review
- **Scope:** all uncommitted `ui-redesign` changes versus `aa9b977` (`git status`; untracked audience media/scripts included). Pages redesigned and human-approved 2026-10-11: Home (Codex's audience sequence), Solutions, How It Works (with prototype blueprint), Pricing, About, Contact. This pass (not yet reviewed by the human): header focus fix, CTA heading, 404, demo polish, narrow-text rules, price cap.
- **Priorities:** (1) Contact/inquiry unchanged in behaviour: `InquiryForm.astro` changed by CSS only (request-type marker rule); confirm preselection, validation, error-summary focus, retry, uncertainty, no-JS POST and that no wording implies verified delivery. (2) `nav.ts` focus handling: deliberate blur not restored, Escape/menu behaviour, other engines' media-query events. (3) Disclosure logic on How It Works/About still derived from `disclosure()` (pending receipt stays pending). (4) Pricing values and comparison-table semantics. (5) Removed components (SegmentGrid, SamplePanel, ProcessSteps, PlanCard, CoverageNote, audience-stage.ts, collage.ts) have no remaining references. (6) New public media: `public/media/site/website-contact.webp` (own-site capture) and the Home audience MP4/WebP set (licences in `design/media-source/AUDIENCE_VIDEO_PROPOSAL.json`).
- **Run:** `npm run check`, `npm test`, `npm run build`, `npm run test:browser` with `CHROME_PATH` set to an H.264-capable Chromium, `npm run check:release`. Never submit a real inquiry.
- **Known remaining items:** extreme 320-390px + 32px text word breaks (above); Home audience clips loop with visible four-second cuts; untested Firefox/Safari, real phones/touch, screen readers and true zoom; manual release gates (recipient verification, production test request, provider privacy wording, owner copy approval) pending; redesign not published.
- **Evidence:** ignored `design/references/` packets (`solutions-redesign`, `how-it-works-redesign`, `how-it-works-reality`, `pricing-redesign`, `about-contact-redesign`, `consistency-pass`).

## Milestone (About and Contact redesign checkpoint, 2026-10-11)

**Pricing visually approved by the human 2026-10-11. About and Contact redesigned locally (UX_BRAND §12.4-12.5); both visually approved by the human 2026-10-11.** `ui-redesign`, uncommitted; no commit, push, merge, deployment or inquiry. Production delivery and recipient verification remain **pending**; the Contact page states only that requests are sent through a form service.

Research: real About/Contact pages inspected in headless Chromium (Linear, Stripe, Procore, Buildots About; Linear, Vercel, Stripe, Procore Contact). Fieldwire contact and Buildots request-a-demo URLs returned not-found pages and were not used. Notes and captures: ignored `design/references/about-contact-redesign/`.

Changes: `src/pages/about.astro` and `src/pages/contact.astro` rewritten; `src/components/form/InquiryForm.astro` CSS-only narrow-text rule (14 lines, no markup or script change); `src/components/site/CoverageNote.astro` removed (no remaining users); `src/scripts/reveal.ts` comment; ARCHITECTURE component list.

Verification (Node 24.11.1, Chrome 151 headless, off-origin requests blocked, provider responses mocked, no inquiry): `npm run check` 0 errors/warnings (1 existing hint); `npm test` 142/142; `npm run build` 8 pages; `npm run test:browser` 21/21 inquiry (preselection, validation and error-summary focus, submitting, retry, failures, uncertain outcomes, no-JS native POST, unconfigured build, disclosure wording on About) + 32/32 Home/demo (including 7-route reflow at 320/390px with 32px text); `npm run check:release` automated requirements met, four manual gates pending. About/Contact probe 21/21: Contact Tab order reaches the form before the details with every stop outlined and in view at 1440/16, 390/16 and 390/32px; decorative panel `aria-hidden`, no controls, never the click target; phone link yellow focus outline; empty submit focuses the error summary below the header at all three sizes (validation only, nothing sent); quotation/service preselection editable; no-JS native POST form, privacy hint, phone and steps visible. About links outlined and in view; anchors `#background`, `#mission-vision`, `#coverage`, `#real`, `#disclosure`; reduced motion static; no-JS shows everything with five disclosure statements; contrast 5.5:1 or higher on both pages. No horizontal overflow and no unhyphenated mid-word breaks at 320/390px 16/32px (JS on/off), 768, 1440 16/32px; phone number on one line, request-type markers never overlap labels, "Philippines" kept whole. Observed, not changed (shared component, also on other pages): the CTA band heading breaks "Question/s" at 320px with 32px text. Evidence: ignored `design/references/about-contact-redesign/`. Other engines, devices, screen readers and true zoom unverified.

## Milestone (Pricing redesign checkpoint, 2026-10-11)

**How It Works approved by the human 2026-10-11, including the prototype blueprint. Pricing redesigned locally (UX_BRAND §12.3); visually approved by the human 2026-10-11.** `ui-redesign`, uncommitted; no commit, push, merge, deployment or inquiry.

Changes: `src/pages/pricing.astro` rewritten (comparison data logic unchanged); `src/components/site/PlanCard.astro` removed (only user); `src/scripts/reveal.ts` comment; ARCHITECTURE component list.

Verification (Node 24.11.1, Chrome 151 headless, off-origin requests blocked, mocked provider, no inquiry): `npm run check` 0 errors/warnings (1 existing hint); `npm test` 142/142; `npm run build` 8 pages; `npm run test:browser` 21/21 (including the comparison-table header-association and accessibility-role scenario) + 32/32; `npm run check:release` automated requirements met, four manual gates pending. Pricing probe 22/22 (three runs; one run had a single block measured mid-fade at 320px, not reproduced in six targeted repeats or two further full runs): rendered prices, period, basis, limits, onboarding/support equal the approved values; disclosure, four every-plan inclusions, two replacement notes, three limit definitions, five exclusions and terms present; service/quotation links preselect each plan and the Contact form selects the plan editably; desktop plan rows aligned within 1px; comparison symbols excluded from accessible names (21 Included, 6 Not included, prices in table); no page overflow or off-screen text at 320/390px 16/32px (JS on/off), 768, 1024, 1440 16/32px; `#comparison`, `#limits`, `#separately-quoted` land below the header; reduced motion shows everything with no reveal setup; contrast 5.7:1 or higher (large price 14.5:1). Phone comparison: no clipped feature headers at 320/390px 16/32px; pinned at 390/16px, unpinned at 320/16px and 32px text. Evidence: ignored `design/references/pricing-redesign/` (desktop/tablet/mobile 16/32px full pages, desktop plans crop, comparison scroll crops, 32px intro/table, reveal frames, scripts). Other engines, real devices, screen readers and true zoom unverified. Production delivery and recipient verification remain **pending**.

## Milestone (How It Works honest-scope blueprint, 2026-10-11)

**Only the "Honest scope / What is real in this prototype" section of How It Works was redesigned ("prototype blueprint", UX_BRAND §12.2 item 4); approved by the human 2026-10-11.** `ui-redesign`, uncommitted; no commit, push, merge, deployment or inquiry. `#reality` and the disclosure logic are preserved; `status.stillToCome` (published-site recipient delivery) remains **pending** in a separate yellow notice.

Changes: `src/pages/how-it-works.astro` (section markup/styles, concept drawings in frontmatter); new `public/media/site/website-contact.webp` (own-site capture, record in UX_BRAND §11.5). No dependency.

Verification (Node 24.11.1, Chrome 151 headless, off-origin requests blocked, mocked provider, no inquiry): `npm run check` 0 errors/warnings (1 existing hint); `npm test` 142/142; `npm run build` 8 pages; `npm run test:browser` 21/21 + 32/32 (the disclosure scenario reads the preserved lists inside `<details>`); `npm run check:release` automated requirements met, four manual gates pending. Section probe 16/16: no overflow or off-screen content at 320/390px with 16/32px text (JS on/off; details closed and open) and 1440px 16/32px; no-JS shows all labels/notice/screenshots and the native details opens; Tab reaches the summary with a yellow outline, Enter and Space open/close it (CDP key events need key text; an earlier failure was harness-only); `#reality` lands below the header at 1440 and 390px; contrast 9.1:1 or higher for badges, body, concept labels, notice (12.4:1) and details; notice text equals the pending wording; reduced motion: no reveal setup, outlines complete, no animations. Page-wide sweep unchanged (only the intentional visually hidden heading). Fixed during the pass: incomplete outline drawing, missing details marker (custom chevron), illegible phone screenshots (square crops), notice/badge wrapping at 320px with 32px text. Evidence: ignored `design/references/how-it-works-reality/` (desktop/mobile/320px 32px, closed and open, notice crop, reveal and concept-drawing frame sheets, 2x website source, scripts). Other engines, devices, screen readers and true zoom unverified.

## Milestone (How It Works redesign checkpoint, 2026-10-11)

**Solutions visual direction approved by the human 2026-10-11. How It Works redesigned locally as three steps (Record, Monitor, Review; ADR-035, UX_BRAND §12.2); awaiting visual approval before any other page.** `ui-redesign`, uncommitted; no commit, push, merge, deployment or inquiry.

Changes: `src/pages/how-it-works.astro` rewritten; `src/components/site/ProcessSteps.astro` removed (only user; its uncommitted step ids now live on the page); untracked `src/scripts/audience-stage.ts` deleted (no imports or markup hooks; byte-identical copy in ignored `design/references/orbit-stage-1/audience-selector-baseline.zip`), its comment in `stable-position.ts` and ARCHITECTURE tree entry updated; the `tests/browser/inquiry-form.ts` disclosure scenario now reads `#reality` headings and lists instead of the removed `.card` classes (it still fails when the pending-receipt line is changed; checked temporarily, then restored).

Verification (Node 24.11.1, Chrome 151 headless, off-origin requests blocked, mocked provider, no inquiry): `npm run check` 0 errors/warnings (1 existing hint); `npm test` 142/142; `npm run build` 8 pages; `npm run test:browser` 21/21 + 32/32; `npm run check:release` automated requirements met, four manual gates pending. How It Works: no horizontal overflow at 320/390px with 16/32px text (JS on/off), 768, 1024, 1440 (16/32px) and reduced motion, sampled while scrolling; only the intentionally visually hidden "The three steps" heading is off-screen. The comparison region has no overflow at 320-1440px including 32px text; Chromium's accessibility tree keeps table/cell roles when restacked and cell names exclude the visual labels. Home's three card links, `#tag-resources`, `#technologies` and `#reality` land below the header with visible headings at 1440 and 390px. Keyboard order reaches the flow links, step and demo links with visible outlines. Rail fill progresses with scroll (for example 0% -> 41% -> 100%) and is full and static under reduced motion (no animations). Evidence: ignored `design/references/how-it-works-redesign/` (desktop/tablet/mobile 16/32px screenshots, mobile table crop, scroll frame sheet, scripts). Other engines, real devices, screen readers and true zoom unverified. Production delivery and recipient verification remain **pending**.

## Milestone (Home handoff and Solutions redesign checkpoint, 2026-10-11)

**Home approved by the human (visual appearance), including Codex's 2026-10-10/11 revisions** (outside titles, aligned rows, single-line centre title, enlarged bottom pair; ignored packets `design/references/audience-outside-titles/`, `audience-aligned/`, `audience-title-line/`, `audience-bottom-grow/`). Docs had not recorded those revisions; they are recorded here and in ADR-035. **Solutions redesigned locally (ADR-035, UX_BRAND §12.1); visual direction approved by the human 2026-10-11.** `ui-redesign`, uncommitted; main unchanged; no commit, push, merge, deployment or inquiry.

Home review (Claude Code, 2026-10-11): no confirmed site defects. Independent probes at 1024x768, 1280x720, 1280x800, 1366x768, 1440x900, 1536x864, 1920x1080, 2560x1440 (16px) and 1440x900/1920x1080 (20px): sequence enabled; final titles clear of every video and title; all media inside the stage across 41 sampled phases; centre title one line; no horizontal overflow; 1024x900 at 20px correctly uses the static fallback. Workflow cards open `#capture-events`, `#cloud-platform`, `#dashboards-decisions` on How It Works below the header. One test-harness defect fixed: `tests/browser/home-demo-ui.ts` crashed (unhandled `Fetch.continueRequest: Invalid InterceptionId`) when the page cancelled a paused request; a cancelled continue is now ignored, blocking unchanged. Observations: `src/scripts/audience-stage.ts` was no longer imported (removed at the How It Works checkpoint); the seven tracked 400x500 `audience-*.webp` photos were unreferenced until Solutions reused them.

Verification (Node 24.11.1, Chrome 151.0.7922.34 headless; every off-origin request blocked; provider responses mocked; no inquiry): `npm run check` 0 errors/warnings (1 existing hint in ignored `design/references/audience-natural/encode.mjs`); `npm test` 142/142; `npm run build` 8 pages; `npm run test:browser` 21/21 inquiry + 32/32 Home/demo; `npm run check:release` automated requirements met, four manual gates still pending. Solutions: no horizontal overflow or off-screen text at 320/390px with 16/32px default text (JS on/off), 768, 1024, 1440 (16/32px) and reduced motion, sampled while scrolling through every reveal; reduced motion runs no reveal setup or animations; all reveals complete; no script errors. Desktop 1440x900, tablet 820x1180, mobile 390x844 (16/32px) screenshots and hero/scroll-reveal frame sequences inspected (ignored `design/references/solutions-redesign/`, with probe scripts and Home size probes). Firefox/Safari, real devices, screen readers and true zoom remain unverified. Production delivery and recipient verification remain **pending**.

## Verification status (audience final-pose review, 2026-10-08)

Preview http://127.0.0.1:4321/ matches latest build HTML and three bundles (HTML SHA256 44ef9267f7beb45a373128649325776547c1fc2cf7ccf7177e3facc9243dfc70). Build eight pages. Focused H.264-capable Chromium checks 67/67; Home/demo browser regressions 32/32. 362 sampled phases plus real forward/reverse wheel recordings: full-frame fit, compactness, upright titles, caption/media clearance, hold/release, playback and live/static fallbacks pass. All seven streams decoded changing pixels; 2424/1821 decoded frames during recordings, zero dropped frames, no >50ms animation intervals. Existing 2,339,673-byte video media unchanged. Final screenshots and decoded recording sheets inspected at 1440x900 and 1366x768. Typecheck passes with one existing ignored-script unused-import hint. Earlier full unit/inquiry/release checks are historical and were not rerun for this focused visual revision. Physical devices, other browser engines and screen readers remain unverified; four-second hard loop cuts remain. No commit/push/merge/deploy/inquiry; main unchanged.

Evidence: ignored design/references/audience-final-pose/REVIEW.md.

## Verification status (previous audience local playback review, 2026-10-08)

- Preview http://127.0.0.1:4321/ matches final build HTML (SHA256 d323f836783fe600876f3dc4ca79e6d7a2e9a3c1320e6afe428f52916d763265), all three referenced bundles and seven runtime video files.
- Node24 typecheck: 0 errors/warnings, one existing unused-import hint in ignored audience-natural/encode.mjs; unit suite 142/142 across 11 files; build eight pages; complete guarded browsers 21 inquiry + 32 Home/demo scenarios pass; separate automated release and diff checks pass. No real inquiry/provider submission. Manual gates unchanged.
- H.264-capable Chrome/151.0.7922.34: all seven actual presented decoder frames and changing raster hashes during real wheel down/up recordings at 1440×900 and 1366×768. 61/61 focused checks, 362 sampled phases and 298 wheel observations. All-angle full-frame/upright/visibility/compactness, final titles, hold/release and reversal pass. 320/390px genuine 16/32px defaults plus desktop enlarged text, no-JS/reduced-motion/Save-Data/short-viewport fallbacks; live focus/reading transitions and observer stability pass.
- Playback: near-only requests; native Space/Enter and rapid activation; explicit Pause while loading and across scrolling/layout/preferences; reduced-motion cancels pending loads synchronously; refused-autoplay retry; one actual missing clip returns to its poster while six continue. Zero audience-video requests in initial static fallbacks. Actual background tab pauses seven videos, return resumes decoded playback, explicit Pause persists.
- Seven four-second full-frame H.264 derivatives: 2,339,673 bytes (2.23 MiB). Cold browser transfer 2,342,067 bytes including headers, seven requests at either desktop size. 2036/1617 decoded frames during recordings, zero dropped frames, zero >50ms animation intervals/long tasks in the final recording run. Callback gaps up to 72.9ms; no sustained decoding stall observed locally. Hard loop cuts remain; not seamless edits or a physical-device performance guarantee.
- Start/quarter/middle/three-quarter/final/release screenshots and real scrolling recordings inspected, outside deployment output: design/references/audience-playback/REVIEW.md. Source/poster/provenance records retained; laptop/phone/workflow hashes unchanged. Candidates authorized for local review only; adjusted composition/playback and final production media await owner review. Safari/Firefox/real-device/screen-reader and manual production delivery remain unverified. main unchanged; no commit/push/merge/deploy.

## Milestone

**Audience final-pose refinement, 2026-10-08, local ui-redesign; awaiting visual review. Inspected owner reference design/references/image(20261008-125116).png. Least-squares matching all seven centres to the saved previous path identifies approximately 300.65 degrees, old normalized motion progress 71.33%, RMS 0.704px (manual frame-edge measurements, about 1px tolerance). Rotation now ends there, followed by the existing title reveal, 211-251px hold and normal release. Fixed per-layout frame dimensions and smooth precomputed centre corrections preserve continuous reverse motion. Larger side landscapes, lateral spacing and a shorter inward portrait make the final cluster about 67.6% wider at both review sizes; natural full frames retained. Portrait caption extends into clear navy space to keep whole words readable. No descriptions restored. Player, video files, device entrance and workflow cards unchanged. Manual asset, business and production-delivery approvals unchanged.**

**Audience composition adjustment and local playback review, 2026-10-08 (`ui-redesign`, uncommitted; awaiting owner review):** the human approves the current seven candidates, including active inspection and parked-equipment alternatives, for local playback review only. The left portrait moves inward with a slight proportional reduction and an upper-pair alignment blended into the fixed-size precomputed path; natural full frames, collective growth, counterrotation, titles, hold/release retained. Seven four-second muted looping inline H.264 derivatives and matching posters; shared native Pause/Play, explicit-pause persistence, near/visible/hidden-document gating, synchronous preference cancellation, stale-promise guards, refused-autoplay retry and independent poster errors. Static mobile/reduced-motion/Save-Data/enlarged-text/short-viewport/no-JS grids remain. No dependencies, final asset approval, commit, push, merge, deployment or real inquiry; manual business/delivery gates unchanged. Originals and captures remain ignored outside public/dist; only optimized runtime derivatives are public. Evidence: `design/references/audience-playback/`; provenance: `design/media-source/AUDIENCE_VIDEO_PROPOSAL.json`. Earlier checkpoints below are historical.

**Natural-aspect audience poster cluster, 2026-10-08 (`ui-redesign`, local/uncommitted; visual and clip approval pending):** the human requested natural video proportions and one packed irregular cluster. All seven original clips remain candidates, with two additional unapproved alternatives: Kindel Media/Pexels 8487126 active inspection and Hamza Awan/Pexels 14977406 parked equipment fleet. Their uncropped 16:9 posters replace the previous portrait/tower-crane posters for this proposal only; equipment is small in the aerial and a rental-yard transaction is not established. Equipment-yard clip 7791770 rejected for visible manufacturer branding. Six landscape posters and one portrait now use intrinsic full-frame proportions; no 4:5 boxes/bands/stretching. Fixed dimensions and 120 smoothed centre poses computed per layout, interpolated during scrolling; shared 0.54-to-1 growth, rotation/counterrotation, title reveal, approved hold/release retained. Final gradient-backed on-media titles clear of neighbouring media. No description panel or playback integration. Baseline/review captures, sources and clips remain ignored outside public/deployment output; seven optimized poster derivatives only are public. Provenance retained in `design/media-source/AUDIENCE_VIDEO_PROPOSAL.json`; current review packet is `design/references/audience-natural/REVIEW.md`. Previous contain-fit proposal below is superseded. Business/manual release and production-delivery gates unchanged.

**Audience video sourcing checkpoint, 2026-10-08 (`ui-redesign`, local/uncommitted; clips and fit awaiting human approval):** the human approved the three Home sections' visual direction and requested seven licensed audience clips. Approved composition, motion, timing and workflow source hashes remain unchanged. One suitable local Mikael Blomkvist/Pexels blueprint source reused; six additional full-frame Pexels sources downloaded. Local crane source and branded alternatives rejected. Creator, official source/licence URLs, source/preview hashes, intervals, dimensions and inspection limitations recorded in `design/media-source/AUDIENCE_VIDEO_PROPOSAL.json`. Ignored review packet: `design/references/audience-clips/REVIEW.md`, labelled start/middle/end `storyboard.png`, `aspect-fit.png`, seven four-second H.264 previews (4.26 MiB total) and 4fps full-frame inspection sheets. Originals/review assets stay outside public/deployment output. Four clips are 16:9, three 9:16 versus approved 4:5 photos; proposed contain fit keeps outer geometry but introduces bands and changes visible image weight. That fit is not implemented. No playback integration, dependency, full regression rerun or production-delivery claim; stop for clip/fit review. Business/manual release gates remain unchanged.

**Home three-section motion checkpoint, 2026-10-08 (`ui-redesign`, local/uncommitted; visual direction now human-approved, clips pending):** coordinated laptop/phone entrance; three image-backed workflow link cards; new compact-entry/full-frame rotation and expansion/title-reveal/short-hold/release audience sequence. Native implementation chosen after comparing GSAP ScrollTrigger (ADR-033); no dependency added. Retires the dense mosaic, selected description, repeated Home audience descriptions and separate centre montage. Fuller copy stays in configuration/Solutions; all seven approved images/names retained. Existing unrelated changes and main preserved. Earlier milestones below are historical, not current approval or implementation claims.

**Dense audience composition revision, 2026-10-08 (`ui-redesign`, local/uncommitted, awaiting visual review):** photos now grow into available space around a stronger fixed centre poster, with varied widths/heights, close centres and compact heading/instructions. Upright counterrotation, native scrolling, selection, descriptions below, focus handling and static fallbacks are retained. Previous centre-poster source is recoverable in ignored `design/references/orbit-dense/` snapshots. Montage editing remains deferred. Actual coverage and remaining corner gaps are reported below. Earlier milestones are historical; no approval, business claim or production gate changes.

**Audience orbit centre-poster checkpoint, 2026-10-08 (`ui-redesign`, local/uncommitted, awaiting visual review):** current request enlarges all seven photos and adds a stationary centre poster ahead of a proposed stock montage. Native rotation/counterrotation and selection remain; the ring is recalculated as a rounded perimeter with clearance-aware spacing, not the former one-centre/six-satellite ellipse. Compact heading, reserved description outside the art, 10% expansion and shorter bounded scroll travel. Two local footage sources support a four-shot storyboard; the final montage and video playback are deliberately deferred. Prior Stage 2 source is preserved under ignored `design/references/orbit-centre/`. No production/content approval changes, dependencies, commit, push, merge, deployment or real inquiry.

**Audience orbit Stage 2, 2026-10-08 (`ui-redesign`, local/uncommitted; awaiting completed-interaction review):** the human approved Astra?s Stage 1 visual direction and authorized Stage 2. The existing orbit geometry is preserved and extended with seven native photo buttons, a stable description region, visible selected/focus treatments, a selection cue, focused-motion pause and jump-free resume, synchronous rapid selection and image-failure handling. All static fallbacks and live selection/focus/reading-position transitions remain. Full verification is below. Stage 1 source is recoverable from ignored snapshots in `design/references/orbit-stage-2/`; the previous selector remains in `design/references/orbit-stage-1/audience-selector-baseline.zip` and inactive `audience-stage.ts`. No business/content approval or production-delivery claim changed. Main remains `aa9b9777c5628bc8698af10dafbd32517d8ba31a`; no commit, push, merge, deployment or real inquiry. Earlier milestones below are historical.

**Home audience photo stage replacement 2026-10-08 (`ui-redesign`, local/uncommitted; awaiting owner review):** the human's new photo-and-selector direction supersedes every rotating/expanding collage proposal below. Deep navy, approved seven audiences/photos, first selection immediate, native ruled buttons, 200ms photo crossfade, full static photo-led list when needed or without JS, live focus transfer and image-failure handling. `collage.ts` removed; shared stable-position helper retained. No dependencies, commit, push, merge, deployment or real inquiry. Main remains `aa9b9777c5628bc8698af10dafbd32517d8ba31a`. Current verification is recorded below; earlier collage evidence is historical.

**Home "Who we serve" second visual revision 2026-10-07 (Codex takeover, `ui-redesign`, local/uncommitted; awaiting owner and independent review)**: clean-edged rectangular still-photo composition, heading above and compact selector below; native short sticky compact entry -> expansion/shared-centre rotation -> large showcase -> release into Pricing. Seven existing photos and approved descriptions reused. Live static fallbacks/focus transfer retained; hover no longer freezes animation. `main` remains `aa9b9777c5628bc8698af10dafbd32517d8ba31a`; no commit, push, merge, deployment or real inquiry. Existing uncommitted work preserved and extended within this assigned section. Evidence below; this supersedes the preceding small rotating composition, whose historical verification is retained.

**"Who we serve" revised 2026-10-07 (branch `ui-redesign`, local, uncommitted, unreviewed; `main` and the live site unchanged)**: the tilted collage is replaced by one photo composition that rotates as a whole about its centre with scroll progress (−90° → 0° centred → +90°, calibrated against the owner's reference recording), beside an upright numbered audience list and description area; static grid on small screens, reduced motion, no JavaScript, enlarged text and short windows (ADR-030 revision, UX_BRAND §11.2). Awaiting visual and independent review. Evidence: "Verification status (Who we serve revision, 2026-10-07)".

**Review version published 2026-10-06 (human-authorized)**: the `ui-redesign` prototype (redesigned Home, application-style Product Demo, fixes from the independent reviews) is committed, merged into `main` by fast-forward and pushed for Cloudflare Workers Builds so a reviewer can see it live. This is a **review version**, not an accepted design: owner/human visual review is pending. Still open and not resolved by publication: a focused header navigation link loses focus when larger text folds the navigation into the menu (header behaviour); Firefox, Safari, real phones and touch, screen readers, true browser zoom, Lighthouse/CLS are unverified; Formspree recipient verification and production request delivery remain **pending** (no request was sent). Live verification: "Verification status (review version live, 2026-10-06)". The downloaded source photos stay local (git-ignored); their provenance and the crops/hashes of the shipped files are committed in `design/home-visual-samples/` and `design/media-source/`.

**Fourth prototype pass 2026-10-06 (branch `ui-redesign`; included in the review version above)**: the independent review's three confirmed defects fixed with regression coverage (pending autoplay cancelled at once under reduced motion; enlarged-text reflow on Home and the demo; demo drawer Tab/Shift+Tab wrap); Home's workflow rebuilt as three image-led steps and "Who we serve" as a scroll-following tilted photo collage with selectable descriptions and static fallbacks (ADR-030, UX_BRAND §11.2). Photos are cropped Pexels candidates with provenance (`design/home-visual-samples/`).  Evidence: "Verification status (fourth prototype pass, 2026-10-06)". Work was interrupted once by a dropped connection; on resumption the changed files were inspected and completed work kept.

**Third prototype pass 2026-10-06 (branch `ui-redesign`, uncommitted, awaiting visual and independent review)**: the independent review's six findings resolved or made obsolete (evidence below); Product Demo rebuilt as an application-style workspace (navy sidebar/drawer, light workspace, compact toolbar, persistent disclosure, Back to website); demo screenshots recaptured from it; Home's manual strip replaced by the owner-approved desktop pinned, scroll-driven capability section with stacked fallbacks (ADR-029, UX_BRAND §11.2–11.5). `main` and the live site are unchanged. Evidence: "Verification status (third prototype pass, 2026-10-06)".

**Second prototype pass 2026-10-05 (branch `ui-redesign`, uncommitted, awaiting visual and independent review)**: the independent review's findings resolved (reduced-motion changes followed while the page is open; unused stock images moved out of `public/`; Git exclusions for the starter ZIP and source clip); Product Demo redesigned as an open navy dashboard with `#demo-panel-<section>` entry points; demo screenshots recaptured from the redesigned demo; Home capability rows replaced by an image-led strip and the workflow, segments and pricing opened up (UX_BRAND §11.2–11.5, ADR-028 update). `main` and the live site are unchanged. Evidence: "Verification status (second prototype pass, 2026-10-05)".

**Home redesign prototype implemented 2026-10-05 (local branch `ui-redesign`, unreviewed, not committed, not deployed)**: the human-approved direction (UX_BRAND §11.1, ADR-028) is implemented for Home plus the shared navy header (UX_BRAND §11.2–11.3). `main`, `origin` and the live site are unchanged. Approved direction ≠ accepted result: the rendered prototype awaits human and owner review. Evidence is under "Verification status (Home redesign prototype, 2026-10-05)".

**Owner logo integrated 2026-10-05; header-aware menu height and scroll offsets fixed (logo-review finding); pushed for publication 2026-10-05**: the emblem from `design/BuildTrackLogo.jpeg` (owner-supplied original, unmodified) now appears as `public/buildtrack-mark.webp` beside the "BuildTrack" text in the header and footer (ADR-027). The favicon and social card are unchanged because the logo is illegible at those sizes. Evidence is under "Verification status (logo, 2026-10-05)".

**Presentation handoff prepared 2026-10-05**: `docs/PRESENTATION_HANDOFF.md` (five-minute walkthrough, plain-language technology explanation, works vs simulated, inquiry path, where to edit, how to run, limitations, likely questions). Live site re-inspected (evidence below); one presentation fix (desktop heading hyphenation) made; published with the logo changes. Production receipt and Formspree recipient verification remain **pending** (no human confirmation recorded; no request was sent).

**Production URL configured 2026-10-04**: `site.productionUrl = 'https://buildtrack.sunnydelacruz.workers.dev'` (Cloudflare Workers, Git-connected, set up by the human); this enables canonical links, `og:url`/`og:image`, the sitemap and the robots `Sitemap:` line, and `npm run check:release` now meets every automated requirement. Configuration is not verification (ADR-026): live checks are recorded separately; production request delivery is not yet tested. **Human approval recorded 2026-10-04**: the current page copy, proposed pricing and plan descriptions, privacy wording (`privacyNotice.status = 'approved'`, draft marker no longer shown) and confirmation copy are approved by the human on 2026-10-04 for the initial publication of the academic prototype (may be revised later). Academic, proposed-pricing and simulation disclosures are unchanged. Local delivery test (passed 2026-10-04) stands; publication and production delivery verification remain pending. **Phase 9 hosting configuration prepared 2026-10-04 (not deployed)**: `wrangler.jsonc`, `public/_headers`, 404 `noindex`; verified locally (below). No Cloudflare account, Worker, production URL, publication or production delivery exists yet. **Phase 8 independent review complete 2026-10-04**: its three findings are resolved (evidence below). Pending: deployment and production URL (Phase 9) and production delivery verification. **Phase 7 QA and targeted fixes completed 2026-10-04** (evidence below); release still blocked by hosting/production URL and production delivery verification. Phases 0–4 complete; Phase 5 demo implemented, pending human review. **Phase 6 inquiry form implemented 2026-10-04**, with independent-review fixes applied the same day (recognised-success contract, timeout during body reading, configuration-independent browser harness, explicit standalone browser setup). Code is complete and verified with mocked provider responses only. **Formspree endpoint configured 2026-10-04** (`https://formspree.io/f/mljgrgjr`, supplied by the human; the recipient address stays in the Formspree account, not in the repository). The built Contact page now renders the form posting to that endpoint. **Local delivery verification: passed 2026-10-04** (labelled local test request received by the designated contact, as reported by the human). This meets the ROADMAP Phase 6 delivery gate. **Production delivery verification is pending** until deployment (Phase 9). The site is **not release-ready** (see open items and `npm run check:release`).

## Repository status
Local Git repository on `main` with `origin` = GitHub `OppiRah/BuildTrackProject`. Pushed to `origin/main` (private repository); Cloudflare Workers Builds deploys each push to `main`. Last deployed code commit `92908e7` (`93bc0f7` is docs only). Local instruction files, tool settings, environment files and private editor state are git-ignored.

Implemented: Astro static site; complete content for Home, Solutions, How It Works, Pricing, About and Contact; Interactive Platform Demo (fictional data, six sections, project selection, filters, bounded simulated scans, reset); original graphics and social card; metadata.

Implemented in Phase 6: `InquiryForm` + `Field` components, `src/scripts/inquiry.ts`, pure `src/lib/inquiry-params.ts` / `inquiry-validate.ts` / `inquiry-submit.ts`; allowlisted editable preselection; approved fields with (required)/(optional) labels; privacy acknowledgment (shown with a draft marker until approved on 2026-10-04); client validation with field errors, focused error summary and focus links; submitting, accepted and failure/retry states; single in-flight request; values kept on failure; textContent-only rendering; native POST fallback; uncertain outcomes (unrecognised 2xx body, timeout before headers or during the body) reported as unconfirmed with values kept and a duplicate-on-retry warning; `npm run test:browser` with fixture builds and a request guard. Formspree success contract re-read 2026-10-04 from the official `@formspree/core` source: 2xx, no `error`/`errors`, string `next` (ADR-024).

Public contact configured 2026-10-04 in `src/config/business.ts`: location "Lingayen, Pangasinan" (shown as "Based in Lingayen, Pangasinan"; city/province only, no street address or office claimed), phone shown as 09510519642 and linked as `tel:+639510519642`. Coverage remains Philippines. Rendered in the Contact aside, the footer on every page, and the form's failure/confirmation fallback lines.

Proposed academic pricing configured 2026-10-04 (ADR-025) in `src/config/pricing.ts`: Starter ₱2,990, Professional ₱7,990, Enterprise ₱19,990 per organization per month; per-organization limits; cumulative inclusions via `allPlanInclusions` + `buildsOn`; per-plan onboarding/support; limit definitions; five separately quoted exclusions; required disclosure on Home and Pricing. Rendered on Home (preview cards), Pricing (cards, grouped comparison table, limit definitions, exclusions) and the inquiry plan options/confirmation (e.g. "Professional (₱7,990 / month)"). No payments, accounts, activation, overage charges, annual discounts or plan highlight. Competitor benchmarks (Sortly, Fieldwire, EZOfficeInventory) recorded in ADR-025 and kept distinct from BuildTrack's own unvalidated proposal.

Published 2026-10-04 at https://buildtrack.sunnydelacruz.workers.dev (live verification below). Not done: production delivery verification (Phase 9 release gate).

## Settled decisions
- Astro static output, native components, TypeScript, plain CSS; `astro` is the only runtime dependency; Node 24 LTS (ADR-014, ADR-021).
- Real request flow through Formspree; endpoint configured; local delivery verified 2026-10-04, production delivery pending (ADR-015, ADR-024).
- Demo: fixed fictional snapshot (28 Sep 2026, 8:00 AM PHT) of four sample Philippine projects; schedule variance only per project; build-time rendering with in-memory visibility state (ADR-019, ADR-023).
- Cloudflare Workers static assets preferred, unconfigured (ADR-016).
- Philippines coverage; seven BMC segments with equal standing; proposed academic PHP pricing set by ADR-025 (ADR-018, ADR-022, ADR-025).

## Verification status (Home sequence motion checkpoint, 2026-10-08)

Current natural-aspect candidate-poster revision (ADR-034): final Node 24.11.1 `npm run check` passes (111 files, zero errors/warnings/hints); `npm run build` passes, eight pages. Chromium 151 focused capture checks: 54/54 assertions pass, 362 sampled phases plus 298 observations during actual forward/reverse wheel scrolling at 1440x900 and 1366x768. Natural proportions/upright transforms, unchanged sources, smooth size growth, final title clearance, original title/hold/release timing verified. Largest sampled gap needed to connect the cluster about 11.5px/9.3px; sampled obscuration below 9%. No viewport-coverage goal. Static 320/390px at genuine 16/32px default text, enlarged desktop, reduced motion, no JS, Save-Data and short window pass; live focus/reading-position transitions and image error pass; idle observer mutations zero. Workflow, device/static fallback, shared navigation and capability checks pass. An initial coarse opacity capture missed the entrance timing; final harness also observes running WAAPI delays, without changing entrance code. Subpixel scroll rounding allowed at visually zero title opacity. All checks, screenshots and original-timestamp wheel recordings are in ignored `design/references/audience-natural/`; screenshots and half-second decoded recording sheets inspected. Preview `http://127.0.0.1:4321/` HTML and three bundles match the current Node 24 build; exact hash is in the review packet/provenance. Full suite and playback remain deferred for visual/clip approval. Other engines, physical touch/zoom/screen readers remain unverified. No publishing or inquiry.

This subsection records the pre-approval motion checkpoint. The human subsequently approved the three sections' visual direction; the separate clip-sourcing milestone above is current. No playback has been integrated, and the historical verification below has not been rerun during sourcing.

Unapproved local visual prototype. Ironcloud references actually inspected: `design/references/who-we-werve-reference-layout.png`; all sequential 0.5-second samples of the 6.97-second `who-we-serve-reference-motion.mp4`; accessible live [Ironcloud Home](https://ironcloudcreative.com/) in Chromium, live laptop/phone entrance frames and HTML entrance settings. Live video downloads and submissions blocked; no reference media/code copied into the site. No separate local device-entrance recording exists. Parent/counterrotation and 1-to-1.5 reference mechanics are starting directions supplied by the human, not a claim that our tuned geometry duplicates the reference.

Diagnosis is supported by the saved old geometry samples: maximum adjacent photo dimension changes were 610.4px at 1440x900 and 519.5px at 1366x768 over 1/180 progress increments. The winning fill order/obstacle constraints changed discretely; cover cropping then exposed different portions of unchanged sources. New sources/order stay fixed, sizes are measured only at layout changes and scrolling changes transforms; the same sample increments change photo dimensions by at most 1.11px/0.92px through uniform growth.

- `npm run check`: 103 files, zero errors, warnings or hints (including local capture scripts). `npm run build`: passed, eight pages. Focused Chromium 151 capture run: **51/51 assertions passed**, including 181 phases per viewport (362 total), upright composed transforms, natural 4:5 file proportions, unchanged sources, all seven media visibly retained, title/media clearance at the final scene, reverse native scrolling and release into Pricing. No page-wide overflow, script errors or off-origin requests.
- Latest-build preview: `http://127.0.0.1:4321/`; served HTML SHA-256 `e8e88cb7e1ab364684021283ea45957d71cfba1bd4dd4412169c7d6d2f98bd8b` and all three referenced bundles match `dist/` byte-for-byte. All seven small approved photos preload 800px ahead of the section; this was separately verified without manually forcing image loading. Captures wait for decoded photos and completed generic reveals. Review screenshots/recordings and retired centre poster remain outside public/deployment output.
- At 1440x900: motion 1169px, title reveal 180px, completed-scene hold 251px; 1366x768: 984px, 155px, 211px. All are native scroll distances, not time locks. Static title grid for mobile, reduced motion, Save-Data, no JS, enlarged text and insufficient height. Save-Data/live preferences, genuine 32px default text and viewport changes retain the same focused heading; reading position below changing sections is preserved. Idle observer mutation count zero. Image error keeps reserved frame/title information.
- 320/390px checked at genuine 16/32px browser default text; 1440x900 enlarged text, no JS/reduced motion, and 1440x500 short window checked. Device screens remain full-frame and final static without JS/reduced motion. Separate focused checks: **14/14 passed** for three native Enter card navigations/focus outlines, running entrance cancellation/replay prevention, mobile Menu Space/Escape/focus at 16/32px and request/error guard. An initial synthetic Enter event did not trigger the native button in this harness; Space activation passed, with no navigation code change. Card Enter navigation is verified.
- Capabilities retain four panels/enhanced eligibility; shared navigation, workflow target IDs and focus, disclosures and reading position checked. Demo logic, inquiry, hero and shared navigation source unchanged. Their complete regression suite, unit tests and separate release check are deliberately deferred at the requested visual checkpoint; earlier complete-suite results are historical. Obsolete audience selection browser cases replaced with sequence cases; the complete harness is type-checked but not executed at this checkpoint.
- Evidence ignored under `design/references/home-sequence/`: beginning/quarter/middle/three-quarter/final-title/release screenshots at both requested sizes; native-wheel down/up recordings with original screencast timing; device entrance recording/frames, workflow/mobile screenshots, decoded review sheets and focused results. Screenshots and decoded recordings inspected before reporting. Saved dense source/tests and retired centre poster are recoverable there, outside public/deployment output.

Visual judgment/limits: convincing compact-to-large growth and substantially smoother framing; final full-frame portraits deliberately leave navy breathing room rather than pursuing the retired 90% metric. Slight decorative edge overlaps and temporary stage-boundary clipping remain during rotation; no final title covers another image/title, and none of the seven disappears entirely. Existing approved files are all 400x500 crops, so this prototype cannot demonstrate the varied source formats of eventual videos. Chromium-only evidence; other engines, real touch devices, true browser zoom and screen-reader behavior remain unverified. No audience clips sourced/edited/integrated, no playback controls claimed. Owner approval and production-delivery status unchanged; no commit/push/merge/deploy or inquiry.

## Verification status (dense visual composition, 2026-10-08)

Unapproved visual revision only. Type check: 89 files, zero errors/warnings/hints. Build: eight pages pass. Focused Chromium capture checks pass at 1440x900 and 1366x768: 181 progress samples per viewport (362 total), all seven photos upright, image/control rectangles clear of the centre and each other, full labels and 7px focus clearance inside the stage, no page-wide overflow. All seven selection/focus checks pass at each size. Native-wheel recordings show downward and reverse motion. Static fallbacks pass at 320/390px with genuine 16/32px browser default text, reduced motion, no JS and a 1440x500 short viewport. Live reduced-motion focus transfer/return passes; idle observer mutation count is zero, with no script errors or off-origin requests. Full regression/release suite is deliberately not rerun before visual review; Stage 2 results below are historical.

Coverage measures summed nonoverlapping photo/poster rectangle areas divided by the visual stage area, rather than their bounding box. It includes image beneath translucent caption strips. Five checkpoint values:

| Viewport | Beginning | Quarter | Middle | Three-quarter | End | Full-turn range |
|---|---:|---:|---:|---:|---:|---:|
| 1440x900 | 87.4% | 88.1% | 88.8% | 89.5% | 90.2% | 77.1-90.3% |
| 1366x768 | 85.5% | 86.2% | 86.9% | 87.6% | 88.2% | 74.9-88.5% |

Visual judgment: substantially denser, with a prominent centre and narrow gutters at the five checkpoints. Corner passages still open transient navy gaps and resize/crop the photos; this is visible in the recordings. The requested approximately 90% coverage of the entire usable viewport is not achieved: checkpoint image coverage below the actual header is about 63-65% and 58-60%, respectively, because heading, instructions, description and disclosure retain space. Caption bands further reduce unobscured imagery. Wide crops can trim subjects and show the limits of the existing 400x500 approved stock assets. These are explicit visual-review limitations, not completion claims about constant coverage.

Final five screenshots per viewport, actual native-wheel recordings with original screencast timing, decoded review contact sheets, detailed metrics and recovery snapshots are ignored under `design/references/orbit-dense/`, outside public/deployment output. All ten screenshots and recording contact sheets inspected. Preview remains `http://127.0.0.1:4321/`; latest HTML and all three referenced bundled assets are verified byte-for-byte against `dist/`. No media/montage edit or new dependency. Main and unrelated working-tree changes preserved; no commit, push, merge, deployment or inquiry. Chromium-only evidence; real devices, other engines and screen readers remain unverified.

## Verification status (centre-poster first checkpoint, 2026-10-08)

Scope: enlarge the current seven-photo orbit and reserve a stationary centre poster, preserving audience selection/focus, failure information and static fallbacks. Final video editing/playback and full regression testing stop at the requested visual-review boundary. Previous Stage 2 results below are historical, not verification of this revision.

- Type check: 0 errors, warnings or hints (88 files). Build: 8 pages passed.
- Focused Chromium checks: 134 assertions pass, including 73 phases at 1440x1000; every photo upright, bounded and clear of other photos/centre. Another 37 phases each at 1440x900, 1280x800 and 1920x1080; no page-wide overflow or collisions when enhanced. Short/insufficient layouts use the static grid.
- Seven selection/focus checks pass. Static grid retains all seven photos/descriptions at 320/390px and genuine 16/32px default text, reduced motion, no JS and short desktop windows. Live reduced-motion focus transfer/return and idle observer checks pass. Full keyboard/rapid/failure and shared-section regression suite is deferred until visual approval; implementation is retained, not re-claimed as fully tested here.
- At 1440x1000, final photos are approximately 261-309px wide (about 30-65% wider than their respective Stage 2 captures); the centre remains fixed. Scroll travel is 888px instead of the prior 1500px cap. Photo bounds fill 96.4% of art width and 93.9% of its height at the final position; small outer gutters protect focus outlines.
- Evidence, ignored and outside deployment output: `design/references/orbit-centre/beginning.png`, `middle.png`, `end.png`, `mobile.png`, actual native-wheel `scroll-motion.mp4` (7.17 seconds, downward and reverse scrolling), decoded review sheet, focused results, `storyboard.jpg`, crop-review contact sheets and `STORYBOARD.md`. Screenshots, footage samples and recording frames inspected locally. Recovery source snapshots and downloaded raw team clip are in the same ignored directory.
- Preview: `http://127.0.0.1:4321/`; HTML SHA-256 `1ac0135f213570bad564bab026df49dca8aa25ef96b4700daea7d6e723a28c69` and all 3 referenced bundled assets match latest `dist/` byte-for-byte.

Footage proposal/provenance: `design/media-source/AUDIENCE_CENTRE_PROPOSAL.json` records official Pexels licence checked 2026-10-08, creators, source/download URLs, local hashes, candidate intervals/crops and shipped poster derivation. FFmpeg/FFprobe already installed; nothing installed. Team clip 8964794 downloaded locally; existing crane clip 31009581 reused for candidate cropped shots. Secondary concrete clip 34831845 download failed (connection reset), so it is excluded and not claimed as inspected. The 10-second storyboard proposes plans review, coordination, timber/material lifting, and civil-site access road/foundations; no BuildTrack, Philippine-location or working-hardware claims. Final frame-by-frame branding review remains pending after approval.

Current centre is a poster in every mode, so it has no autoplay, video request or active playback control. After approval: implement muted inline local playback with visible Play/Pause, visibility/layout eligibility, poster-first mobile/reduced-motion/Save-Data, immediate cancellation of pending autoplay on live changes, error poster and static no-JS fallback, then run complete regression/release checks. Chromium-only evidence; real devices, Firefox/Safari, screen readers and true browser zoom remain unverified. Main and existing release gates are unchanged.

## Verification status (audience orbit Stage 2, 2026-10-08)

Stage 1 direction approved by the human; Stage 2 implemented from that baseline, locally and uncommitted. Chromium 151.0.7922.34; no real inquiry. Inquiry tests use synthetic local fixtures, intercepted responses and off-origin request guards. Final screenshots inspected: all seven upright labels, selected treatment, stable description and mobile static photo-led content are readable without clipping at the captured sizes.

| Check | Actual result |
|---|---|
| `npm run check` | 0 errors, 0 warnings, 0 hints (87 files) |
| `npm test` | 142 passed, 11 files |
| `npm run build` | Passed, 8 pages |
| `npm run test:browser` | 21/21 inquiry fixtures; 32/32 Home/demo scenarios |
| Selection | All seven via click, Tab, Enter/Space; sole `aria-pressed`, focus retained, matching approved copy and polite status; reserved description dimensions remain stable |
| Motion | Approved geometry retained; 21 progress/bounds samples, upright readable labels, expansion and reverse scroll; focused photos freeze while native wheel scrolling continues; blur resumes without a jump |
| Rapid/failure | Rapid repeated activation finishes on latest audience, including failed-image requests; orbit/static failure placeholders retain audience information and reserved image dimensions |
| Fallbacks | All seven photos/descriptions at 320/390px with normal and genuine 32px default text, JS on/off; desktop reduced motion, no JS, enlarged text and short windows; no page-wide overflow |
| Live changes | Width, height, text size and reduced-motion changes retain selection, transfer focus to matching visible control/heading below measured header, preserve reading position and focus elsewhere; no idle observer churn |
| Regressions | Hero behavior, capability travel/live sizing/stable positioning, shared navigation, demo keyboard/drawer/filter/reset fixtures and guarded Contact flow pass |
| `npm run check:release` | Automated requirements pass; existing manual gates remain pending; no production-readiness claim |
| Latest preview | `http://127.0.0.1:4321/`; served HTML matches final `dist/index.html` SHA-256 `eaeb0199299fc394c4bfdb9f88247a09e467203349b72df4c614735927d2753c`; all 3 referenced bundled assets match byte-for-byte |

Evidence (ignored, outside `public/` and `dist/`): `design/references/orbit-stage-2/desktop.png`, `selection-0.png` through `selection-3.png`, `mobile.png`, `photo-selection.mp4` (5.67 seconds, actual native clicks with original screencast timestamps), recording review contact sheet, and Stage 1 source snapshots. Screenshots and recording frames were inspected locally. Stage 1?s actual-scroll recording and baseline recovery ZIP remain unchanged. An initial live reduced-motion test clicked before the scroll frame settled; the harness now waits two animation frames and asserts photo focus before every live transition. The complete rerun passes; this did not require changing production focus behavior.

Limitations: Chromium automation and inspected captures only; Firefox/Safari, real touch devices, screen-reader announcement behavior and true browser zoom remain unverified. Genuine browser default-text enlargement was tested. Owner review of Stage 2 and existing manual recipient/production-delivery/release gates remain separate; none was advanced by local tests.

## Verification status (audience orbit Stage 1, 2026-10-08)
**Unapproved local visual motion prototype; stop here for human visual review.** Stage 2 is not implemented. Current task changed `src/pages/index.astro`, added `src/scripts/audience-orbit.ts`, and updated ARCHITECTURE, DECISIONS, UX_BRAND and this state record. Existing uncommitted work, previous selector script/tests and shared helpers are preserved. No dependencies added.

| Focused check | Actual result |
|---|---|
| `npm run check` | Pass: 0 errors, warnings or hints. Initial check also scanned the loose baseline archive as source; source snapshots were given `.snapshot` extensions and archived in ZIP, then the check passed |
| `npm run build` | Pass: 8 pages |
| Motion/overflow | 35 focused assertions pass, including 41 positions through the full orbit: all seven photos upright, their rendered rectangles inside the art area, no page overflow; no idle motion; actual wheel events advance and reverse the full turn |
| Geometry at 1440×900 | 1,378px native scroll travel; composition span approximately 1,008px at entry → 1,260px at exit (25% expansion), inside a 1,310×648px art area. Local paint containment bounds intermediate transform boxes without cutting visible photos |
| Fallbacks | Static photo grid with all seven descriptions at 320/390px with 16/32px browser default text, desktop reduced motion, desktop no-JS, 1440×600 and 1440px with 32px text. Desktop bounds also checked at 1024×900, 1280×800 and 1920×1080 |
| Live changes | Reduced motion returns to a visible static entry; audience text retains focus and reading position through mode changes; 16↔32px default text reflows; content below stays anchored. Separate live width/height checks (390×844, 1440×900, 1440×600, return) preserve focus below actual header; no page overflow, idle mutations or ResizeObserver errors |
| Preview | **http://127.0.0.1:4321/** serves latest `dist/index.html`, SHA-256 `7fe32cd2432661f5b9ffb48aca4652b18182c4a46998c2d738898c7f522e2f5d`; all 3 referenced bundled assets match disk byte-for-byte |
| Evidence | `design/references/orbit-stage-1/beginning.png`, `middle.png`, `end.png`, `mobile-fallback.png`, and `scroll-motion.mp4` (8.52s, actual native wheel scrolling down/back up, CDP frame timestamps retained). Screenshots and decoded recording samples inspected. Reference screenshot and sampled reference recording frames inspected too |
| Scope | Main stays `aa9b9777c5628bc8698af10dafbd32517d8ba31a`. No commit, push, merge, deploy or inquiry. All baseline/reference/capture artifacts remain ignored outside public/ and deployment output |

Limits: Chromium 151 only. This is a visual prototype, not acceptance of the direction or release readiness. Interactive selection, selected-description area, focused-control motion behavior, rapid selection and image-failure polish are deferred by the human's Stage 1/2 boundary. The full unit/browser/release suite has deliberately not run; preserved browser tests still describe the prior audience selector and will need adaptation after approval. Hero, capabilities, demo, navigation, Contact source and behavior were not redesigned; their full regression checks are deferred. Firefox/Safari, real devices/touch, screen-reader output and real browser zoom are unverified. Existing header focus and production recipient/delivery items remain unchanged. No production approval or delivery claim has been advanced.

## Verification status (audience photo stage replacement, 2026-10-08)
Scope: replace Home's previous collage locally on `ui-redesign`, preserving unrelated uncommitted work (including `.gitignore`). Existing approved configuration and stock assets unchanged. Owner visual review remains pending. Changes: `src/pages/index.astro`, new `src/scripts/audience-stage.ts`, removed `src/scripts/collage.ts`, reference comments only in shared `stable-position.ts`, replaced audience browser scenarios, and current direction/evidence in ARCHITECTURE, DECISIONS, UX_BRAND and this file.

| Check | Actual result |
|---|---|
| `npm run check` | Pass: 0 errors, warnings or hints (final source) |
| `npm test` | Pass: 142 tests, 11 files |
| `npm run build` | Pass: 8 pages |
| `npm run test:browser` | Pass on final source: 21 inquiry + 29 Home/demo scenarios; provider responses mocked, every off-site destination blocked; no real inquiry |
| Audience behavior | All seven click and sequential Tab/Enter/Space selections; focus stays on control; first selection immediate; largest description/photo space and selector rows stable; 200ms photo-only fade; rapid choices end with latest image/text and no stale overlay; actual missing-image response leaves readable audience information; reduced motion is immediate and cancels an in-progress fade |
| Audience layout/fallbacks | 320/390px × genuine 16/32px default font × JS on/off: all seven descriptions, no page overflow; 1024/1280/1440px desktop controls readable; desktop no-JS and 32px text expose all descriptions; live width and 32px text transitions transfer focus button → static heading → button below actual header and retain selection; focus elsewhere preserved |
| Other sections/navigation | Capability live text-size changes, focus, travel, no idle observer churn and stable content below pass; workflow and desktop/mobile keyboard navigation, Escape, routes and demo return link pass; demo interaction regressions pass |
| Separate `npm run check:release` | Exit 0: automated requirements met; manual recipient/production delivery and approval gates still listed; this design awaits owner review |
| Latest preview | `http://127.0.0.1:4321/` (Astro preview). Served Home exactly matches final `dist/index.html` SHA-256 `9f4c3c99b0ca08b91a1728803f4d4537f81659aec85d1e7f1969b43e4635e4f3`; all 3 referenced bundled assets also match byte-for-byte |
| Visual evidence | `design/references/audience-stage/desktop.png` (1440×1000), `mobile.png` (390×844), `mobile-all-audiences.png` and `selection-changes.webm` (4.8s). Desktop/mobile captures and all decoded recording frames inspected. Local ignored evidence only; never shipped |
| Git | Main remains `aa9b9777c5628bc8698af10dafbd32517d8ba31a`; no commit, push, merge or deployment |

Tools/limits: Node 25.2.1 and Chromium 151.0.7922.34 (CDP). Initial sandboxed Chromium runs exited before completion; stopped, rerun outside the sandbox with approval and passed. Recording uses timed screenshot frames encoded as WebM. No new dependencies. Firefox/Safari, real devices/touch, screen-reader output and true browser zoom remain unverified. No formal Lighthouse/CLS run; stable image/description/control dimensions were directly checked. The previously recorded header focus loss when enlarged text hides desktop navigation remains outside this audience replacement (standard menu/navigation regression checks passed). Production receipt/recipient verification remains pending; no real request was sent.

## Verification status (Who we serve second visual revision, 2026-10-07)
Status: **prototype awaiting owner and independent review**, not design acceptance or release approval.

Preview verified: **http://127.0.0.1:4322/**, HTTP 200, response equals current built `dist/index.html`. Port 4321 was an existing Astro static preview (PID 18328), whose pre-edit Home bytes and CSS/JS asset hashes matched a fresh build of the inherited working tree; the "old build" report was not substantiated. Left that process running. Astro permits one preview instance per project, so the separate port uses a small local Node HTTP server, with no runtime dependency change.

Actual references inspected: `design/references/who-we-serve-reference-motion.mp4` (1920x1080, 60 fps, 6.97 s, all 418 frames inspected in sequential contact sheets), `who-we-werve-reference-layout.png` (actual supplied filename has "werve"), and `who-we-serve-current-result.mp4` (8.43 s, inspected as a sequential contact sheet). Observable: compact entry, clean rectangular crops in a tight irregular arrangement, group rotation and visible growth, an apparent stationary interval, then upward release into the next section. The motion recording includes an NVIDIA panel appearing/disappearing and changing the visible site area. Assumptions: sticky mechanism and original scroll distances cannot be recovered reliably from this capture; playback seconds are not scroll pixels. The chosen 54 degrees clockwise turn and 900 px maximum travel are tuning choices for this prototype. Correction to the earlier record: "quarter turn per second" is not a valid scroll-speed calibration.

Visual inspection: screenshots at entry, expansion, rotation, showcase and exit (1440x900), and a real Chromium CDP screencast driven by native wheel input downward and back upward (9.16 s, 1440x864 encoded frames; original browser timestamps retained in concat durations, not a fixed screenshot playback approximation). Compared with the references: clean photo edges, tight deliberate gaps and varied rectangular proportions are retained; the new canvas is wider and uses seven stills, with a shorter 54 degrees turn rather than reproducing the reference's multiple turns. Entry is 376 px wide at -54 degrees, showcase ~1,019 px wide/upright, occupying ~90% of available section width. All seven tiles fit at sampled angles. The stage holds for the final 20% of 900 px travel and releases into Pricing; reverse wheel input returns through the sequence. This meets the implemented visual intent in Chromium, subject to owner judgement.

Local evidence (ignored, never in `public/` or `dist/`): `design/references/revision-evidence/` ? `entry.png`, `expansion.png`, `rotation.png`, `showcase.png`, `exit.png`, `who-we-serve-scroll.mp4`, reference/result contact sheets, capture metrics, timestamped recording frames, capture/preview scripts, and `starting-work.patch` preserving the inherited tracked diff.

| Check | Result |
|---|---|
| `npm run check` | 0 errors, 0 warnings, 0 hints |
| `npm test` | 142 passed in 11 files |
| `npm run build` | Passed, 8 pages |
| `npm run test:browser` | 21/21 guarded inquiry fixtures and 36/36 Home/demo scenarios; Chromium 151 |
| Selection/focus | Photo and selector selection agree; all seven keyboard selections, Enter/Space, visible focus and stable description area pass |
| Motion/scrolling | Shared-centre rotation and scaling, wheel reversal, native PageUp, focused pause and jump-free resume; ordinary pointer presence continues motion |
| Bounds/position | All rotated bounds inside artwork at 21 progress samples; showcase >85% available width and >2x entry width; native release into Pricing; three repeated live layout switches keep following content within +/-1 px |
| Fallbacks/live transitions | Mobile, no JS, reduced motion, 20/32 px default text, short/insufficient windows; live reduced motion, width, height and text-size changes keep selection and transfer focus without BODY focus loss |
| Other behavior | Capability travel/live sizing and stable positioning; keyboard mobile menu/desktop routes/demo return; demo project/low-stock filtering with matching chart rows, bounded five scans, reset/reload; drawer focus wrap; hero playback scenarios |
| `npm run check:release` | Automated requirements pass; four manual gates still listed, no release claim |
| Git/assets | `git diff --check` passes; main hash unchanged; no reference/current-result recording paths in `public/` or `dist/` | No real inquiry submitted; browser request guards block all off-origin traffic except synthetic intercepted inquiry responses.

Limitations: owner and independent review pending; real trackpad/touch devices, Firefox/Safari, screen readers, true browser zoom, low-end rendering performance and Lighthouse/CLS remain unverified. A short desktop window (including 1440x720) deliberately uses the complete static grid because a large composition plus readable selector does not fit. Existing release/provider-delivery gates remain open.

## Verification status (Who we serve revision, 2026-10-07)
Local only. Reference: the owner's screen recording `Desktop 2026.10.07 - 12.52.07.02.mp4` (NVIDIA capture, 7 s, outside the repository), inspected frame by frame: a grid-like photo composition turns clockwise about one centre while the page scrolls, roughly a quarter turn per second of scrolling, entering near upright; it appeared to stay in place while turning (pinned), which was not reproduced by request. Implemented range: ±90° over the composition's pass through the viewport. Changed: `src/pages/index.astro` (markup, tile layout, styles), `src/scripts/collage.ts`, `tests/browser/home-demo-ui.ts`, UX_BRAND §11.2, ARCHITECTURE, ADR-030. Full Chromium 151, local static server, no inquiry sent.

| Check | Result |
|---|---|
| `npm run check` / `npm test` / `npm run build` | 0 errors/warnings/hints; 142 passed; 8 pages |
| `npm run test:browser` | Form suite 21/21; Home/demo suite 32/32 (11 composition scenarios replace the 10 collage scenarios). In one of six full runs on the final code, the existing check "capabilities: no repeated re-evaluation … once a text-size change has settled" saw 1 attribute change at 32 px; not reproduced in the following five full runs or 12 isolated repetitions, and a timing log shows the capability and composition switches settling within 80 ms. Recorded as an intermittent observation; cause not established |
| `npm run check:release` | All automated requirements met; 4 manual gates |
| Rotation (1440×900, real wheel input) | Upright (abs(--p) < 0.01) when centred; below −30° 300 px before centre; increases on every 100 px wheel step over the artwork (page scrolls normally; more than 50° over 600 px); 200 px of upward wheel reverses it; tile centres keep their distance from the shared centre (group rotation); nothing moves without scrolling; no horizontal overflow while rotated. Recording at 1280×720 (wheel steps of 12 px; logged --p −1 → 1 → back to −0.08) |
| Selection | First Tab stop after the heading is list item 1 (the artwork adds none); Enter and Space select with a visible focus ring; a mouse click on a photo selects the same audience, marks the photo and focuses its list button; a list click marks the photo; descriptions match `business.ts`; polite live region; the description area does not move |
| Pause/resume | Keyboard focus: unchanged across 250 px of scrolling, resumes within 0.05 and continues. Photo click: paused while the pointer stays over the section, resumes within 0.02 when it leaves, continues; selection kept |
| Fallbacks | Static grid with all seven descriptions, no list and no photo badges at 390 and 768 px, reduced motion, 1440×600, 20 px text at 1440×900 (would fit; static by rule), 32 px text and without JavaScript; no overflow |
| Live transitions | Reduced motion on/off keeps the selection; with a list button focused, reduced motion, 768 px, 1440×600, 20 px and 32 px text each move focus to that audience's heading (never BODY, not a Tab stop), selection kept, text below the header and in view, Tab continues after the section; focus elsewhere unchanged; live 16→32→16 px with focus on a pricing link keeps that focus and the selection |
| Other sections | Capability showcase, layout-switch stability (±1 px, three runs), demo drawer, workflow, reflow at 320/390 px (32 px text, 7 routes, JS on/off) and the hero video scenarios pass unchanged |

Review artefacts (local, not committed): `C:/Users/miscr/OneDrive/Desktop/BuildTrack_who-we-serve-review/` (desktop centred/above/below/selected at 1440×900, mobile 390 px, `who-we-serve-rotation.mp4`, 7.7 s, frames captured from headless Chromium during wheel scrolling, so the playback rate is approximate). Not verified: real trackpad and touch scrolling, Firefox/Safari, real phones, screen readers, true browser zoom, Lighthouse/CLS, smoothness on low-end hardware (the rotation is one composited `rotate` per frame).

## Verification status (review version live, 2026-10-06)
Commit `aa9b977` ("feat: redesign Home and Product Demo for review", author OppiRah, no agent attribution) on `ui-redesign`; `main` fast-forwarded `4646fff..aa9b977` (no force, no history rewrite) and pushed to `origin`; `ui-redesign` retained. Before committing: secrets scan clean; no agent names in the built site, `src`, `tests` or `public` (doc mentions replaced with neutral wording); unreferenced public files only `fonts/OFL.txt` (font licence) and `_headers` (hosting config); the sample-pack zip, `PREVIEW.jpg`, the 23 MB source clip and the downloaded source photos stay local (git-ignored); complete suite green. Cloudflare Workers Builds served the new build about 40 s after the push. Read-only checks against https://buildtrack.sunnydelacruz.workers.dev (formspree.io blocked; no form submitted):

| Check | Result |
|---|---|
| Live vs build | All 41 pages and assets byte-identical to the local build of `aa9b977` (one image differed on a first fetch during cache revalidation; identical on three re-fetches); unknown URLs return the 404 page with status 404 |
| Home media | 21 image/video sources return 200 with image/video types; every image decodes; no off-site requests |
| Hero video | Desktop autoplays muted, fades in, Pause control; Enter pauses, Space plays; reduced motion: no MP4 request, still shown, Play offered; 390 px: 640 px still, no MP4 request |
| Capability showcase | Pinned at 1440×900, follows scrolling 1:1 (0 → 500 → 2288 px), last panel fully shown at the end; capability check 39/40 live (the one failure sampled the hero entrance after a 6 s wait added for network loading, after it had finished; a separate live check confirmed the entrance runs once and does not replay) |
| Collage | Seven "View details" buttons; click shows the approved Civil engineering firms description; Space selects Contractors |
| Mobile and fallbacks | 390 px: stacked capabilities, static audience grid with seven descriptions, no overflow, menu opens with the links; reduced motion: stacked, static grid, no autoplay; no JavaScript: stacked and all seven descriptions |
| Navigation | 8 header/footer links return pages; mobile menu reachability 12/12 |
| Product Demo | Sidebar opens Materials; disclosure ("Simulated data …") and Back to website shown; no off-site requests; application shell check 23/23; 390 px drawer modal, 12 Tabs stay inside, Escape returns focus |
| Contact preselection | `?type=demo`, `?type=quotation&service=equipment-tracking`, `?type=service&plan=professional` preselect correctly; form posts to the configured Formspree endpoint; nothing submitted |

The older scratch checks with fixed 1.5–2 s waits after navigation failed at first on the live site because pages and media were still loading over the network; with longer navigation waits or bounded readiness waits they pass as above. The focus-target check was not run live because it presses Submit on an empty form (it passed locally on byte-identical files).

Still open (not resolved by publication): a focused header navigation link loses focus when larger text folds the navigation into the menu; Firefox, Safari, real phones and touch, screen readers, true browser zoom and Lighthouse/CLS are unverified; owner/human review of the design is pending; Formspree recipient verification and production request delivery remain pending (no request was sent).

## Verification status (fourth prototype pass, 2026-10-06)
Local build served by `astro preview`; full Chromium 151 and the Chromium 151 headless shell (both play H.264); every off-site request blocked; no inquiry sent.

| Review defect | Reproduction before the fix | After |
|---|---|---|
| Pending autoplay under reduced motion | MP4 response held by the test server, reduced motion turned on: video not paused (the handler only paused when already `playing`) | `hero-video.ts` marks automatic playback as requested at once (control offers Pause while loading), pauses immediately on the change, and ignores any `play()` result superseded by a newer Play/Pause. Held response released after cancellation: 0 automatic `playing` events, paused, control reads Play. A visitor Play after cancellation plays; a visitor Pause while loading survives the response and later preference changes; reduced motion on→off while loading starts playback once |
| Home/demo reflow at 32 px default font (genuine `Page.setFontSizes`, hyphenation forced off) | 320 px: document 377 px wide ("Professional"), capability intro heading and panel headings past the edge or clipped; demo no-JS "Equipment" heading 334 px | Headings are limited to their container (`max-width: 100%`, so start-aligned flex columns and flex rows wrap long words); hero grid and capability-intro flex children may shrink (`min-width: 0`). No page-level overflow hiding, no smaller text. 320 and 390 px × 7 routes × JS on/off: no document overflow, clipped or off-screen headings; Home at 768/1024/1280 px with 32 px text likewise |
| Demo drawer focus | Tab from the last drawer control left for `body` (browser UI in a real window) | `demo-layout.ts` wraps Tab last → first and Shift+Tab first → last over the visible controls. Two full forward and reverse rounds stay inside; outside still inert; Escape closes and returns focus to Sections |

| Check | Result |
|---|---|
| `npm run check` / `npm test` / `npm run build` | 0 errors/warnings/hints; 142 passed; 8 pages |
| `npm run test:browser` | Form suite 21/21; new `home-demo-ui.ts` 18/18 at first (Chromium 151; also 18/18 with the headless shell), 22/22 after the focus-transition fix. The first run of the new suite against the unfixed code failed the autoplay, reflow and drawer scenarios (7 failures) |
| `npm run check:release` | All automated requirements met; 4 manual gates |
| Workflow | Three steps with photo (≥ 80% of column width), number 01–03, heading and one sentence at 1440 and 390 px; lead keeps "No QR, RFID or IoT hardware is connected … proposed concept"; stock disclaimer shown |
| Collage (1440×900) | All seven photos in view at rest, photo frames tilted, items and labels upright (0°), seven "View details" indicators; `--p` ≈ 0 centred, −0.74/+0.60 at ∓300 px; no movement without scrolling; a wheel over the collage scrolls the page natively; Enter, Space and click select (aria-pressed, description area text matches `business.ts`, polite live region, area does not move); paused while focus is inside (unchanged across 250 px of scrolling), resumes within 0.05 of the frozen value and then continues |
| Collage fallbacks | Static grid with all seven descriptions and no buttons at 390, 768, reduced motion, 1440×600, 1280 with 32 px text, and without JavaScript; reduced motion toggled while open switches static ↔ collage and keeps the selection |
| Collage focus transition (independent-review finding, fixed 2026-10-06) | Reproduced first: with focus on "Equipment rental companies", reduced motion on and a resize to 768 px dropped focus to BODY; raising the default text to 32 px while open never switched the collage (no resize or media-query event fires). Fix in `collage.ts`: before hiding the buttons, focus moves to that audience's heading (`tabindex="-1"`, removed again on blur, so no extra Tab stop), the selection is kept, and its heading and description are scrolled below the measured sticky header (again on the next frame, after other sections reflow); a `ResizeObserver` on the collage re-evaluates on text-size changes without resetting a paused position. Regression (`home-demo-ui.ts`), focus not blurred beforehand, for reduced motion, 768 px and 32 px text: focus on the heading, never BODY (focusout recorder), not a Tab stop, selection kept, text below the header and inside the viewport, Tab continues to the next control after the section; focus elsewhere is not moved and no heading becomes focusable |
| Capability showcase under live text-size changes (independent-review finding, fixed 2026-10-06) | Reproduced first at 1440×900 with the final capability link focused, changing the browser default text without resize or reload: at 20 px the section height kept the old travel (3124 px for a real travel of 2331 px, so the last panel could not be fully shown); at 32 px it stayed pinned although the block no longer fit. Fix in `scrolly.ts`: a ResizeObserver on the header, pinned content and track re-evaluates (skipped when the measured sizes match the last evaluation, so the evaluation's own layout switch causes no loop); an enabled layout is re-measured in place (no teardown); a focused panel link is moved back into view (pinned) or revealed below the measured header (stacked) only when the layout changed; the focus jump is re-applied a frame later because a script's `focus()` scrolls after the handler. Regressions (`home-demo-ui.ts`, 5 new scenarios, 16→20→32→16 px): final link stays focused and on screen, pinned at 20/16 and stacked at 32, section height = sticky height + current travel; midway with focus elsewhere the pinned block is fully shown and the last panel fully shown at the end of the range; focus below the section is kept, no scripted scroll calls, the pinned ↔ stacked switch leaves it in place; no attribute changes for 700 ms after settling and no ResizeObserver errors; reduced motion and no JavaScript stay stacked. Against the previous `scrolly.ts` three of these fail (stale travel at 20 px in both focus cases; the old teardown moved content below by 188 px on switching) |
| Layout switches moving the page (found 2026-10-06 during the pre-publication run) | Switching the capability showcase (pinned ↔ stacked) or the collage (collage ↔ grid) while the visitor looked at content below moved it intermittently: a link right below the showcase by up to 411 px and a pricing link by up to 609 px, varying per run. Two causes: Chromium's scroll anchoring sometimes anchored inside the changing section, and the global reduced-motion rule (`transition-duration: 0.01ms` on every element, whose default `transition-property` is `all`) turned the section's padding change into a one-frame transition that finished after any correction. Fixes: `src/scripts/stable-position.ts` (both sections switch through it: anchoring paused for that frame; if the section ends above the middle of the viewport the page is scrolled by exactly its height change, otherwise the scroll position is kept), and the reduced-motion rule now sets `transition: none` (as UX_BRAND §2 already specified). Regression: workflow and pricing links, reduced motion on and off, three runs each: within ±1 px and focus kept |
| Complete suite, run together on the final state | `npm run check` 0/0/0; `npm test` 142 passed; `npm run build` 8 pages; `npm run test:browser` form 21/21 then Home/demo 28/28; `npm run check:release` all automated requirements met; capability check 40/40 (reconciled: expects Pause while autoplay loads and Play after; bounded waits for "playback pending" (≤ 10 s) and media readiness (≤ 60 s, a timeout fails)); application shell 23/23; Home 24/24; menu 12/12; focus targets 161/161; axe 0 violations in 9 states |
| Earlier checks re-run on this build | Capability scroll sequence 39/40 (the one failure is the old check's expectation that the control reads Play *while* autoplay loads; the control now offers Pause during loading by design, and the asserted outcome — paused, Play — passes); application shell 23/23; Home suite 24/24 (video, entrance, reveals, keyboard focus clear of header at 1280, 390 16/32 px, 320×560); menu reachability 12/12; focus targets 161/161 |
| axe-core 4.13.0 | 0 violations: Home (1280, collage with a selection at 1440, 390, menu open, no JavaScript), Product Demo (1280, 390, empty state, no JavaScript). New "incomplete" items: the collage labels (overlaid by their transparent buttons; ink on page background) and the "View details" pills over photos (72% ink; worst case over white ≈ 7.1:1) |
| Media | Every used photo cropped from its source JPG; crop boxes, sizes, SHA-256 and reasons in `design/home-visual-samples/CROPS.json`. Excluded by cropping: a contractor logo on a vest (engineering firms), manufacturer names on pallets (monitor resources), manufacturer lettering on an excavator boom (equipment rental), a branded excavator at the frame edge (construction companies); real-estate crop moved from trees to towers above a site. Uncropped candidates removed from `public/`; the pack zip and PREVIEW.jpg are git-ignored. New images: steps 78 KB (3), audiences 220 KB (7), lazy-loaded |
| Screenshots reviewed | 1440: workflow, collage at rest, collage with a selection, reduced-motion static grid; 390: workflow, audience list; 320 with 32 px text. Fixed during review: collage drift too large (labels collided with the second row), step number orphaned on wrap, description area re-centring, misaligned static labels, accumulated scroll progress desynchronising on large jumps |

Not verified: Firefox, Safari, real phones and touch scrolling, trackpad momentum, screen readers, true browser zoom, Lighthouse/CLS, the deployed host, and any human, owner or independent review. Known limitations: a page-wide browser text-size change can leave a focused element far down the page off screen, because Chromium's scroll anchoring does not follow that reflow; this happens equally when the capability showcase never pins (reduced motion), and the showcase itself performs no scrolling unless one of its own links has focus. At 1440 px, text from 20 px folds the header navigation into the menu, so a focused header nav link loses focus to the page (header behaviour, not addressed here). The photos show scenes outside the Philippines; the Ironcloud reference was not available locally, so the collage follows the written brief.

## Verification status (third prototype pass, 2026-10-06)
The work was interrupted by a dropped connection (ECONNRESET) partway through; on resumption Git status and the changed files were inspected, completed work (demo shell, layout script, labels, `scrolly.ts`) was kept, and the unfinished steps (Home migration, autoplay and entrance fixes, screenshots, validation, documentation) were completed. Local build served by `astro preview`; Playwright Chromium 151 and its headless shell; formspree.io blocked; no inquiry sent.

| Review finding | Outcome |
|---|---|
| Enlarged-text overflow in Home strip controls and Demo headings | Strip controls removed; demo headings rebuilt (toolbar title, wrapping). Reflow: no horizontal overflow on 8 routes × 8 widths × 16/32 px default text |
| Clipped keyboard focus during strip scrolling | Strip removed. In the pinned section each panel link is fully visible on Tab/Shift+Tab at 1440×900 (focus jumps instantly); stacked fallback otherwise |
| Pending autoplay starting after reduced motion is enabled | `play()` resolution now pauses automatic playback if reduction is on. Tested with the clip throttled to 40 KB/s and the cache off: still loading (readyState 0) when reduction was turned on, paused once loaded (readyState 3), control reads Play |
| Unreachable sticky demo navigation in short viewports | Sidebar sticks only while it fits (`demo-layout.ts`); at 1280×500 it scrolls with the page; at enlarged text the rem breakpoint switches to the drawer; every sidebar/drawer control reachable at 1280×500, 1280×800 (32 px), 1100×560 (24 px), 667×375, 390×560 (32 px) |
| No-JavaScript hero entrances replaying after preference changes | Entrance now requires JavaScript (`html.entrance-run` set inline before the hero); no animation without JavaScript before or after toggling; with JavaScript it runs once and never replays |
| Stale status announcements after demo hash navigation | A hash change after load announces the newly opened section; invalid hashes leave section and status unchanged; nothing announced on load |

| Check | Result |
|---|---|
| `npm run check` / `npm test` / `npm run build` | 0 errors/warnings/hints; 142 passed; 8 pages |
| `npm run test:browser` (mocked provider) | 21/21 |
| `npm run check:release` | All automated requirements met; 4 manual gates |
| Demo behaviour (31 checks) | Figures unchanged (4 of 18 low stock, 53%, 2 in transit, 2 delayed; −4 pts for one project); six sections by Enter with focus kept and status announced (labels Materials/Activity); project picker; filters, empty state, Clear filters (focus to first filter); five scans then the limit, figures unchanged; Reset and reload; four hash entry points; unknown hash ignored; mobile table scrolls in its region; no storage, timers, fetch/XHR/WebSocket or off-site requests; no-JS stacked sections and hash jump |
| Application shell (23 checks) | Toolbar title, visible Back to website, persistent disclosure, non-sticky site header; Launch link puts the workspace at the top and focuses it; sticky sidebar keeps all sections in view deep in the Materials table; no nested vertical scroll areas; hash load/change/invalid/reload behaviour; sticky-only-when-fits and full reachability at short and enlarged sizes; drawer: Enter opens a modal dialog, focus on the current section, outside inert, Tab contained, Escape/section/backdrop close and return focus; short-landscape drawer controls fully visible on focus; no-JS stacked view |
| Scroll-driven showcase (40 checks) | At 1440×900, 1536×730, 1366×650, 1280×800 and 1024×768: first panel fully visible at the start, 1:1 progression (e.g. 1440: x 0 → 1144 → 2288), reversal on scrolling up, last panel fully visible before release, then normal release; wheel scrolls the document natively and the track follows 1:1; Tab/Shift+Tab reach all four links fully visible, Tab continues into the next section; resize recalculates travel (1440×900 → 1280×800: 2289 → 2134; → 1180×760: 1921; back to 1440×900: 2288), measured equal to the track’s real overflow each time; fallbacks stacked with nothing hidden: 390, 768, reduced motion, 32 px and 24 px default text, 1280×560, 1440×600, no JavaScript, scripts failing at start; reduced motion toggled while open switches stacked ↔ pinned; delayed autoplay; no-JS and JS entrance |
| Home suite (24 checks) | Video paths (autoplay, keyboard pause/play, reduced motion, mobile still, blocked, refused), entrance timing, reveals once, devices sequence, keyboard focus visible and clear of the header at 1280, 390 (16/32 px) and 320×560, no-JS, no off-site requests |
| Site-wide | Menu reachability 12/12; skip link/anchors/form error links clear of the header 161/161; reflow as above; header one-line widths 1,095 / 1,071 px |
| axe-core 4.13.0 | 0 violations: Home (1280, 390, menu open, no JavaScript) and Product Demo (1280, 390, Materials empty state, no JavaScript, mobile drawer open). Found and fixed: `aria-labelledby` on a generic `div` (`#demo-app` is now a `section`). Remaining "incomplete": text over hero media and the CTA band gradient (measured previously) |
| Screenshots | Recaptured from the application-style demo (UX_BRAND §11.5) and reviewed: complete margins, real fixture values, legible "Simulated data" labels. Found and fixed during capture: blank sidebar and shifted margins caused by beyond-viewport capture (now plain viewport captures) and a stale section carried over by a same-URL navigation |
| Visual review | Product Demo desktop (intro, workspace, Materials), mobile workspace and open drawer; Home pinned section at 1440×900 and 1366×650 (start, middle, end, release) |
| Transfer (local preview, uncompressed) | Home desktop full scroll 2,466 KiB, of which the MP4 is 1,920 KiB; Home mobile first view 284 KiB, full scroll 494 KiB. Screenshots: laptop 60 KiB, phone 27 KiB, four capability images 37–52 KiB (186 KiB). Home script (reveal, video, pinned section) 1.9 KiB as a separate bundle |

Not verified: Firefox, Safari, real phones and touchscreens, trackpad momentum on real hardware, screen readers, true browser zoom, Lighthouse/CLS, the deployed host, and any human, owner or independent review. The owner's dashboard reference image was not available locally; the layout follows the written brief.

## Verification status (second prototype pass, 2026-10-05)
Local build served by `astro preview`; Playwright Chromium 151 (plays H.264) and its headless shell; formspree.io blocked; no form was submitted beyond the existing mocked browser tests and empty-form validation.

| Check | Result |
|---|---|
| `npm run check` / `npm test` / `npm run build` | 0 errors/warnings/hints; 142 passed; 8 pages |
| `npm run test:browser` (mocked provider) | 21/21 |
| `npm run check:release` | All automated requirements met; 4 manual gates |
| Demo behaviour (31 checks) | Initial Overview only with controls; figures unchanged (4 low-stock of 18, 53%, 2 in transit, 2 delayed; Sample Mid-Rise Residential −4 pts); all six sections by Enter with focus kept and status announced; project picker by ArrowDown; Inventory 18 → 4 with Low stock only; empty state + Clear filters (18 rows, focus to the first filter); equipment and delivery status filters; five simulated scans then the limit (`aria-disabled`), figures unchanged, five badged events in the latest list; Reset and reload restore the start; `#demo-panel-inventory/equipment/deliveries/overview` open that section below the header, unknown hash ignored; mobile table scrolls inside its focusable region; no storage writes, timers, fetch/XHR/WebSocket or off-site requests; no script errors; no JavaScript: six stacked sections, controls hidden, note and disclosure shown, hash jumps to the section |
| Capability strip and live reduced motion (27 checks) | At 1440, 1280, 390 and 320×560 (32 px text): controls shown, Previous `aria-disabled` at the start, next panel peeks, no page overflow; Next by Enter steps 0 → 1 → 2 → 3 then reports the end with focus kept; Previous returns; Tab reaches all four panel links, each fully visible in the strip and viewport. Vertical wheel over the strip scrolls the page. No JavaScript: wrapping grid, no horizontal scroll, controls hidden, all four links fully visible on Tab at 390 and 1280. Reduced motion turned on mid-entrance: entrance cancelled, every pending block shown, autoplay paused; turned off: nothing replayed or re-hidden, autoplay resumes only without a visitor choice; an explicit Pause survives on→off; an explicit Play survives turning reduction on; loading reduced then switching to normal starts nothing late |
| Home suite (24 checks) | Video autoplay, Enter/Space pause/play, reduced motion (no autoplay, explicit Play works), mobile still with no MP4 request until Play, blocked MP4 ("unavailable", `aria-disabled`), refused `play()` (still kept, Play offered); hero entrance ≤ 840 ms; reveals once; laptop before phone then still; keyboard focus visible and clear of the header at 1280, 390 (16/32 px) and 320×560 (32 px); JavaScript off shows everything; no off-site requests |
| Site-wide | Menu reachability 12/12; focus targets (skip link, anchors, form error links) 161/161; no horizontal overflow on 8 routes × 8 widths × 16/32 px text; desktop header one-line widths 1,095 / 1,071 px |
| axe-core 4.13.0 | 0 violations on Home (1280, 390, menu open, no JavaScript) and Product Demo (1280, 390, inventory empty state, no JavaScript). First run found `landmark-unique` (deliveries table region and section both named "Deliveries"); fixed by the caption "Delivery records" and the screenshot recaptured. Remaining "incomplete" items: text over the hero video/closing photo (calculated worst case ≥ 8.19:1), the existing CTA band gradient, and muted text partly under the sticky header in the no-JS stack (#94A3B8 on navy, 5.92:1) |
| Screenshots | Recaptured from the redesigned demo (UX_BRAND §11.5) and reviewed for complete edges, legible "Simulated" labels and real fixture values. First attempts were fixed: capture beyond the viewport removed the scrollbar and shifted the layout 8 px (scrollbars now hidden before measuring); the phone capture took the full page (now the viewport) |
| Visual review | Home at 1440 and 390 px (full page and strip), Product Demo at 1440 and 390 px. Found and fixed: `.demo-panel + .demo-panel` matching hidden panels (stray rule and gap); uneven event-time wrapping (fixed column from 48rem); first strip build with too-small desktop panels (now `min(56%, 42rem)`) |
| Transfer (local preview, uncompressed) | Home desktop full scroll 2,374 KiB, of which the MP4 is 1,920 KiB (the fourth strip image loads only when scrolled to); Home mobile first view 375 KiB (the browser fetches the strip images early because they are within its lazy-load distance), full scroll 445 KiB. New screenshots: laptop 41 KiB, phone 28 KiB, four strip images 32–44 KiB (153 KiB total). Home CSS 3.0 KiB; reveal, video and strip code is inlined in the Home HTML |

Not verified: Firefox, Safari, real phones and touch swiping, screen readers, true browser zoom, Lighthouse/CLS, the deployed host, and any human, owner or independent review. The Ironcloud reference image was not available locally; the strip follows the written brief.

## Verification status (Home redesign prototype, 2026-10-05)
Branch `ui-redesign` created from `main` at `4646fff`. Media pack (`BuildTrack_Media_Starter.zip`, already extracted into the working tree): all seven media files and `README.md` match the SHA-256 values in `ASSET_SOURCES.json` (now in `design/media-source/` with the README). The 23 MB source clip and the 25 MB zip are not loaded by the site and should not be committed without a decision.

Checks against a local build served by `astro preview` (formspree.io blocked; no form was submitted; the only form-related actions are the existing mocked browser tests):

| Check | Result |
|---|---|
| `npm run check` / `npm test` / `npm run build` | 0 errors/warnings/hints; 142 passed; 8 pages |
| `npm run test:browser` (mocked provider) | 21/21 |
| `npm run check:release` | All automated requirements met; 4 manual gates |
| Video (Playwright Chromium 151, which plays H.264) | Desktop 1280: autoplays muted, "Pause background video" visible; Enter pauses, Space resumes. Reduced motion: no autoplay, no MP4 request, still shown, Play starts it. Mobile 390: 640 px still, no MP4 request until Play. MP4 blocked: still remains, control reads "Background video unavailable" (`aria-disabled`) and does nothing. `play()` refused (simulated by overriding `HTMLMediaElement.play`): still remains, video hidden, control offers Play |
| Motion | Hero entrance ends at 840 ms (600 ms + 0/80/160/240 ms delays); reveals hide only blocks below the fold, reveal once and never re-hide; laptop at 0.68 opacity while the phone is at 0.12 mid-entrance, both at opacity 1 / no transform afterwards with no running animations. Reduced motion: no entrance animation and no reveal hiding |
| Keyboard | Tab through the whole Home page at 1280×800, 390×844 (16 and 32 px text) and 320×560 (32 px): 25–32 stops, each fully opaque, visible and clear of the sticky header. First run found focus landing on blocks still fading in (opacity 0–0.45); fixed by finishing the fade on focus |
| JavaScript off | All revealed blocks and devices at opacity 1; still image; no video or control; navigation links visible at 390 px |
| Site-wide (header changed) | No horizontal overflow on 8 routes × 8 widths (320–1440) × 16/32 px text; menu reachability 12/12 (320×560 at 32 px: 246 px header, panel ends at 559 px); focus targets 161/161 on all pages; desktop header one-line widths 1,095 / 1,071 px (Inter / fallback). First run found the tiled logo wrapping the header to 101 px at 320 px with normal text; fixed by reducing the header bar's minimum column gap |
| axe-core 4.13.0 (scratch copy) | 0 violations on Home at 1280 and 390 px and with the menu open. 11 "incomplete" colour-contrast items are text over the video/photo; calculated worst case over a white pixel: white 11.67:1, yellow 8.19:1, pale blue 10.63:1 on 86% ink, video control 11.27:1. The desktop gradient keeps ≥ 86% ink up to 72% of the width; hero text measured to reach at most 70.9% (1024 px) |
| Visual review | Full-page and first-view screenshots at 1440 and 390 px reviewed; Contact and Product Demo first views reviewed with the navy header. Fixed during review: phone frame overlapping the figure caption; a clipped status line at the top of the Overview screenshot |
| Network | Same-origin only. Transfer on the local preview (uncompressed): desktop full scroll 2,409 KiB, of which the MP4 is 1,920 KiB; mobile first view 228 KiB; mobile full scroll 437 KiB. Added media: hero still 33 KiB (640) / 85 KiB (1280); demo screenshots 26–50 KiB each (6 files, 218 KiB); closing photo 70 KiB; Home CSS 2.4 KiB; reveal + video code is inlined in the Home HTML as one 2,063-byte module (Home HTML 31.2 KB raw, 6.8 KiB as served by the preview, 5.4 KB with Brotli) |

Not verified: Firefox and Safari (no builds here), real phones, screen readers, true browser zoom, Lighthouse/CLS on this prototype, the deployed host (nothing deployed), and an owner or human visual review.

## Verification status (live, 2026-10-05)
Pushed `eaabf98` (logo, menu height, scroll offsets, heading hyphenation, error-summary scroll) and `8eb5efa` (docs) to `main`. Workers Builds published the new build about 50 s after the push. Read-only checks against https://buildtrack.sunnydelacruz.workers.dev (formspree.io blocked; the only form action was an empty submit stopped by client validation; no inquiry sent):

| Check | Result |
|---|---|
| Live vs build | All 7 pages, both CSS files, the form script and `/buildtrack-mark.webp` (200, `image/webp`, 6,032 B) are byte-identical to a local build of `8eb5efa` (the nav script is inlined in the HTML) |
| Logo | Header and footer emblem load at 150×144 at 320–1440 px × 16/32 px text; the name is never clipped; desktop nav from 1200 px; both home links are named "BuildTrack home" with the image ignored by the accessibility tree; screenshots of the 1200 px header and 390 px footer reviewed |
| Mobile menu | 12/12 scenarios pass, including 320×560 at 32 px text and resizing while open |
| Focus targets | 161/161: skip link, anchors and form error links clear of the sticky header at 16/32 px text, 320×560 through 1440×900, JS on and off |
| Reflow | No horizontal overflow: 8 routes × 8 widths × 16/32 px text |

Still pending (unchanged): Formspree recipient verification and production receipt. No request was sent.

## Verification status (logo, 2026-10-05)
Local preview of the built `dist/` in headless Chromium (DPR 2, throttled network, formspree.io blocked, nothing submitted):

| Check | Result |
|---|---|
| Image loading / reserved space | Header and footer emblem load at natural 150×144 at 320–1440 px × 16/32 px text. Explicit `width`/`height` reserve the logo's space before the image arrives. A buffered layout-shift observer in one scripted headless run (throttled, measured ~2.5 s after navigation) reported 0, but total startup layout shift (e.g. Lighthouse CLS or field data) was **not independently confirmed** |
| Proportions | Rendered aspect 1.041–1.042 = source 150:144; crop scaled by exactly 0.2, no stretching |
| Accessibility | Both home links are named "BuildTrack home"; the image is not in the accessibility tree (`alt=""`), so the name is not repeated |
| Header fit | Natural one-line width 1,099 px (Inter) / 1,075 px (fallback), previously 1,054 / 1,028; desktop nav still from 1200 px, Menu at 1199 px |
| Enlarged text | The name is never clipped. At 32 px text the header matches the pre-logo height at 390 px and above (175 / 113 px). At 320 px the name wraps under the emblem (230 px vs 175 px before), the only change from the earlier layout |
| Reflow | No horizontal overflow: 8 routes × 320–1440 px (8 widths) × 16/32 px text |
| Visual review | Screenshots of the header at 390/1200 px and the footer at 390/1280 px reviewed: white-on-white header with no visible box; white tile on the navy footer |

**Logo-review finding resolved 2026-10-05:** the mobile menu panel's height was capped with the fixed `--header-height` token. At 320×560 with 32 px text, the wrapped header (about 230 px) pushed the panel below the viewport, and Product Demo, Pricing, Contact and the whole "Request a Demo" button could not be fully shown. The same bug already affected 390×844 at 32 px text before the logo (175 px header). Fix: `src/scripts/nav.ts` publishes the header's rendered height as `--header-rendered` from a ResizeObserver (which covers resize, font loading and wrapping); `Header.astro` subtracts it, with the token as the fallback. The no-JS path is unchanged. Evidence (scripted headless Chromium against local `dist/`, real click to open, real Tab key events):

| Scenario | Before | After |
|---|---|---|
| 320×560, 32 px text (reproduction) | Fail: panel bottom 677 px in a 560 px viewport; 4 items not fully visible on focus; CTA unreachable by scrolling | Pass: panel bottom 559; all 7 links + full CTA visible on focus and after scrolling to the end |
| 390×844, 32 px text | Fail: Contact and CTA not fully visible | Pass |
| Resize while open 390→320 at 32 px text (header 175→230 px) | Fail | Pass: limit follows the header |
| 320×560 and 390×844 at 16 px; landscape 844×390, 667×375 (16 and 32 px); 1024×768; 1280×800 at 32 px (menu mode) | Pass | Pass |
| 1280×800 at 16 px (desktop nav) | Pass | Pass: all items inline and visible |
| No JavaScript, 320×560, 32 px | Pass | Pass: 8/8 items rendered, Menu button hidden |
| All of the above with the web font blocked (fallback font) | not run | Pass. Header heights were identical to Inter, so a font swap during loading was not directly exercised; the observer handles it by design |

Tab order in every menu-mode case: Home, Solutions, How It Works, Product Demo, Pricing, About, Contact, Request a Demo. Screenshot at the reproduction size reviewed (focused CTA fully visible). **Scroll offsets fixed 2026-10-05:** `nav.ts` now publishes `--header-rendered` on the root element. `html { scroll-padding-top }` uses it plus `--space-4`, with the `--header-height` token as the fallback, so the no-JS behaviour is unchanged and the header stays non-sticky in the no-JS mobile fallback. Found while verifying: at 32 px text, the error summary (up to 2,513 px tall at 320 px) was scrolled so its heading sat above the viewport after `focus()`; `inquiry.ts` now focuses it without scrolling and calls `scrollIntoView({ block: 'start' })`, which honours the scroll padding. This was pre-existing and unrelated to the logo. Evidence (scripted headless Chromium against local `dist/`, real Tab/Enter key events, formspree.io blocked, nothing sent):

| Check | Result |
|---|---|
| Sizes | 320×560, 390×844, 667×375 and 1280×800 at 16 and 32 px text; 1024×768 and 1440×900 at 16 px; JavaScript on and off |
| Skip link (from a scrolled page: Tab, Enter) | Skip link visible on focus; `<main>` focused with its top at or below the header's bottom in every case (e.g. 320×560 at 32 px: top 230, header bottom 230) |
| Hash navigation to `#inquiry-project_need`, `#inquiry-message`, `#contact-details-heading` | Top of each target clear of the sticky header (e.g. 320×560 at 32 px: 262 vs header bottom 230) |
| Form errors (empty submit, then Enter on each of the 7 error links after scrolling to the bottom) | Summary focused with its top below the header (320×560 at 32 px: 262 vs 230); each link focuses its field fully below the header, label also visible |
| Total | 161/161 checks pass; no off-site requests |
| Same suite with the old fixed-token padding injected | 10 failures at 32 px text (320×560 and 390×844): skip-link target, all three anchors and the error summary landed 31–86 px under the header |
| Mobile menu re-check (`--header-rendered` now on the root) | 12/12 menu scenarios above still pass |

Note: in the no-JS mobile fallback the token-based padding still applies even though that header is not sticky, which only adds space above targets; it is unchanged.

Found and fixed during this check: at 320 px with 32 px text the first version clipped "BuildTrack" to "BuildTrac". The wordmark now wraps, and the emblem is capped at 12vw.

## Verification status (presentation readiness, 2026-10-05)
Fixed: headings used `hyphens: auto` at every width, so the desktop Home hero read "mate- / rials". Hyphenation now applies only at `max-width: 40rem` (`src/styles/global.css`; rem-based, so enlarged default text still gets it). Docs reconciled: ARCHITECTURE §7 no longer says "not yet deployed"; Repository status above no longer says "not pushed".

| Check | Result |
|---|---|
| `npm run check` / `npm test` / `npm run build` | 0 errors/warnings/hints; 142 passed; 8 pages (before and after the fix) |
| `npm run test:browser` | 21/21 (headless shell 151) before and after the fix |
| `npm run check:release` | All automated requirements met; 4 manual gates listed |
| Live vs build (before the fix) | All 7 live pages byte-identical to a local build of `93bc0f7`; unknown path returns 404 |
| Live rendered smoke (headless Chromium, 390 and 1280 px, formspree.io blocked, nothing submitted) | 8 routes + preselected Contact: one H1, Inter loaded, menu button only at 390 px, no horizontal overflow, no console errors, no off-site requests; `?type=service&plan=professional` preselects; demo shows six sections, project select, Simulate scan, Reset |
| Reflow after the fix (local preview) | No horizontal overflow: 8 routes × 320/360/390/640/768/1024/1280/1440 px × 16/32 px default text; hero screenshots at 390/1024/1280 px reviewed (no desktop hyphenation) |
| Copy review | Disclosures, pricing, contact and demo labelling consistent with recorded approvals and evidence; Enterprise "Custom" tier label with a numeric price kept (REQUIREMENTS basic/advanced/custom; answered in the handoff) |

## Verification status (live deployment, 2026-10-04)
Deployed by Workers Builds from `main` (commit `92908e7`); the new build was live about 50 s after the push. Read-only checks (GET/HEAD only; the form was not submitted):

| Check | Result |
|---|---|
| Routes | `/`, `/solutions/`, `/how-it-works/`, `/product-demo/`, `/pricing/`, `/about/`, `/contact/` (also with `?type=service&plan=professional`) return 200 with the right titles |
| Canonical / Open Graph | Every page's canonical and `og:url` equal `https://buildtrack.sunnydelacruz.workers.dev` + its path; `og:image` absolute and `/og-image.png` returns 200 (`image/png`) |
| Redirects | `/pricing`, `/pricing/index.html` → 307 `/pricing/`; `/contact` → 307 `/contact/`; `/404.html` → 307 `/404` |
| 404 | `/no-such-page` and `/no-such-page/` return 404 with the custom page (`noindex`, no canonical); `/_headers`, `/wrangler.jsonc`, `/package.json` return 404 (not published) |
| HTTPS | Valid certificate (Let's Encrypt via Cloudflare, `*.sunnydelacruz.workers.dev`, valid to 2027-01-02); `Strict-Transport-Security: max-age=31536000` sent. Plain `http://` is answered with 200 rather than a redirect (workers.dev offers no zone "Always Use HTTPS" setting); browsers still use HTTPS because the `.dev` TLD is HSTS-preloaded |
| Headers | HTML: `public, max-age=0, must-revalidate`, `CF-Cache-Status: HIT`, nosniff, `X-Frame-Options: DENY`, `strict-origin-when-cross-origin`; `/_astro/*` JS and CSS: `public, max-age=31536000, immutable`; font revalidates |
| Compression | Brotli, Gzip and Zstandard served on request: demo HTML 87.5 KB → 10.3 KB (br); form script 13.5 KB → 5.1 KB; main CSS 11.8 KB → 3.2 KB |
| Sitemap / robots | `robots.txt` has `Sitemap: …/sitemap-index.xml`; index lists `sitemap-0.xml`; it lists the seven pages (no 404), all returning 200 |
| Browser smoke (headless Chromium 151, 390 px, off-site requests blocked) | All 8 pages render with one H1, Inter loaded, menu button shown, no horizontal overflow, no console errors, no off-site requests; Contact preselection `?type=service&plan=professional` works ("Send service request"), form posts to the configured Formspree endpoint, no draft marker; demo section switching works |

Publication at the public URL is therefore verified, and the public disclosure was updated accordingly (`src/lib/disclosures.ts`: How It Works lists "This website, its pages and navigation, published at a public web address" as working; About says "This website is a working prototype, published at a public web address."). Still pending: a labelled production test request received by the contact (release gate); production receipt stays "still to come" in the disclosure until then.

## Verification status (Phase 9 preparation, 2026-10-04)
Prepared from current Cloudflare docs (ARCHITECTURE §7): `wrangler.jsonc` (assets-only from `./dist`, `not_found_handling: "404-page"`, `html_handling: "auto-trailing-slash"`, no `main`/adapter/SSR), `public/_headers` (immutable caching only for hashed `/_astro/*`; nosniff, `strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, HSTS), 404 page `noindex` with no canonical/`og:url`, `.gitignore` adds `.wrangler/` and `.dev.vars*`.

Found and fixed: with a production URL set, the 404 page would have received the canonical `/404/`, a URL that Cloudflare redirects; it now has none and is `noindex`.

| Check | Result |
|---|---|
| `npm run check` / `npm test` / `npm run build` | 0 errors/warnings/hints; 142 tests passed (adds `tests/hosting.test.ts`: assets-only Wrangler config, 404 page and trailing-slash handling, long caching only for `/_astro/*`, Referer/security headers, 404 `noindex` without canonical); 8 pages built and `dist/_headers` present |
| `npm run test:browser` | 21/21 (headless shell 154) |
| Local Cloudflare runtime (`npx wrangler@4.147.0 dev --local`, no account) | `/`, `/pricing/`, `/contact/?type=demo` 200; `/pricing` and `/pricing/index.html` 307 → `/pricing/`; unknown paths (with/without slash) 404 with the custom page; `/404.html` 307 → `/404`; `_headers` not served; `/_astro/*.js` immutable for a year; HTML and font revalidate with ETag; security headers on every response |
| Production-URL rehearsal (throwaway build, URL `https://buildtrack-rehearsal.invalid`, real config untouched) | Canonical, `og:url` and absolute `og:image` on pages; 404 has `noindex` and no canonical; `robots.txt` has the `Sitemap:` line; `sitemap-index.xml` + `sitemap-0.xml` list the seven pages and not the 404 |
| `npm run check:release` | Exit 1 as expected: `site.productionUrl` unset + 4 manual gates |

Not verifiable before deployment: edge compression, HTTPS certificate and redirect behaviour on the real hostname, `CF-Cache-Status`, Workers Builds itself, Formspree from the production origin, production delivery.

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
| Review Formspree spam settings; consider Restrict to Domain once the production domain exists | Human | Before production |
| Custom domain (optional; needs a domain on Cloudflare DNS) | Human | Optional |
| Delivery evidence: local integration **passed 2026-10-04**; production receipt from the public URL still required (date + pass/fail only) | Human + Phase 9 | Release gate |

## Remaining checklist
- [ ] Human and owner visual review of the application-style demo and the pinned Home capability section on `ui-redesign` (local preview), then an independent review; decide whether to commit/merge (the starter ZIP and source clip are Git-ignored)
- [ ] Before release of this redesign: update `docs/PRESENTATION_HANDOFF.md` (walkthrough steps and section names changed: Materials, Activity, Sections drawer, pinned capability section)
- [x] Commit and push the 2026-10-05 changes and verify them live (done 2026-10-05: `eaabf98`, `8eb5efa`)
- [ ] Owner reviews the logo treatment (emblem only; white tile in the footer); optional: supply an SVG or transparent PNG
- [ ] Production test: one labelled request from the live Contact page, receipt confirmed by the contact (record date and pass/fail only); then update `src/lib/disclosures.ts` and the handoff answer
- [ ] Confirm the recipient address is verified in the Formspree account
- [ ] Optional: Formspree spam settings and Restrict to Domain; real-phone, Firefox/Safari and screen-reader checks; custom domain

## Next action
Human: authorize one labelled production test request from https://buildtrack.sunnydelacruz.workers.dev/contact/ and have the contact confirm receipt (record date and pass/fail only). After the contact confirms receipt and the recipient is verified in Formspree: record the date and pass/fail here, update the production-receipt line in `src/lib/disclosures.ts`, commit and push. Optional: Formspree Restrict to Domain = `buildtrack.sunnydelacruz.workers.dev`; a custom domain; checks on a real phone, Firefox/Safari and a screen reader.
