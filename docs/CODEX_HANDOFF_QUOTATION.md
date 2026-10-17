# Quotation workflow: consolidated review packet for Codex (2026-10-17)

**Status:** the local implementation is complete. All work is uncommitted on `main`, at commit `4081ac1`.

Earlier sign-off:
- Codex signed off checkpoints 1–3.
- Checkpoint 4 went through four review rounds. The latest reload defect is repaired here, and that repair **has not been independently reviewed**.
- Items B–E below are new and also **unreviewed**.

Nothing has been deployed, provisioned, committed, pushed or sent. The off switches:
- **Committed config:** `quotationWorkflow.enabled`, `customerRoutes.ready` and `TURNSTILE_ON`.
- **Template vars:** `WORKFLOW_ENABLED`, `SENDING_ENABLED` and `TURNSTILE_ENABLED`.

Design and full history: `docs/PROPOSAL_QUOTATION_WORKFLOW.md` (§18, the last section is "Local completion"). Decision log: ADR-043. Owner setup: `docs/QUOTATION_RUNBOOK.md`.

## 0. Consolidated review repairs (2026-10-17; for a focused recheck; not yet reviewed)

Codex's consolidated review of this packet reported seven findings. All are repaired locally in one pass; nothing else was changed. Sections 1–7 below are the earlier packet and its evidence, kept as recorded (one superseded figure is noted in 0.3). Switches, production files and the "nothing sent or created" statement are unchanged. Design record: `docs/PROPOSAL_QUOTATION_WORKFLOW.md` §18, "Codex consolidated review repairs".

### 0.1 What to recheck

| # | Finding | Repair | Where |
|---|---|---|---|
| 1 | Stale email completion | `approved → emailed` also requires `quotes.link_generation = job.link_generation`; the older job keeps `provider_accepted`, its message id and its `OK_ACCEPTED` attempt | `worker/owner/sender.ts` (acceptance batch) |
| 2 | Cross-generation resend guard | "no later job" compares `resend_seq` within the job's generation | `worker/owner/store.ts` `resendQuotation` |
| 3 | Retention query cost | migration `0007` partial index `email_jobs_cap_warnings (created_at) WHERE kind = 'owner_cap_warning'`; deleted jobs counted by `RETURNING id` (D1's `meta.changes` also counts trigger-deleted attempts) | `migrations/0007_retention_cap_warning_index.sql`, `worker/owner/retention.ts` `capWarningRetentionSql` |
| 4 | Expired cap-warning leases | delete when `status <> 'sending' OR lease_until < now` (the sender's recovery rule); one statement; attempts by trigger | `worker/owner/retention.ts` |
| 5 | Deployment templates | paths stay root-relative; templates and runbook name the exact root-level files (`wrangler.owner.jsonc`, `wrangler.owner.preview.jsonc`, `wrangler.preview.jsonc`, `wrangler.jsonc` at cutover); new Wrangler-driven check with a `deploy/` negative control | `deploy/*.example.jsonc`, `docs/QUOTATION_RUNBOOK.md` ("Where filled configs go"), `tests/worker/deploy-templates.ts`, `tests/deploy-templates.test.ts` |
| 6 | Reload identity assertions | `expectEqual` refuses Sets/Maps; reload scenarios assert exact request counts and identical action + fields (token, version, method, outcome, attempt id); self-test proves different identities fail | `tests/worker/quotation-e2e.ts` (`expectSameMutation`, `mutationsSent`) |
| 7 | Cancellation-error suppression | only `Invalid InterceptionId.` for an id seen paused **and** reported cancelled by Chromium (`Network.loadingFailed canceled`, or a main-frame `Page.frameNavigated` after the pause); everything else fails the scenario and the run; no throws in CDP callbacks; unhandled rejections recorded | `tests/worker/quotation-e2e.ts` (`interceptionError`, `settleInterceptions`) |

Points worth a reviewer's judgment:
- **Finding 7 evidence rule.** A standalone probe showed Chromium sends no per-request event when a reload replaces the document of a request paused at the request stage; only a page-initiated abort gets `loadingFailed canceled`. A navigation after the pause is therefore accepted as the browser's report. The first version required `loadingFailed` only, and its own self-test failed (67/69) until this was found.
- **Finding 4 boundary.** A lease ending exactly now still counts as live (`lease_until < now` deletes), matching recovery.
- **Owner email statement (observed during these repairs; fixed afterwards at the owner's request, 2026-10-17):** `emailSummary` had looked at all generations, so after a replacement the owner page could say the provider accepted "the quotation email" when only the older link's email was accepted. `approvedSummary` (`worker/owner/pages.ts`) now gives the main statement and job list for the current link generation only, and lists older generations' emails under "Earlier links (history)" (`JobRow` gains `link_generation`). Regression in `tests/quotation-lifecycle.test.ts` ("owner page: the main email statement describes the current link only"); it fails when the statement is computed over all generations ("No email has been sent yet" missing). Please include it in the recheck.
- **Local walkthrough (owner request, 2026-10-17):** `npm run walkthrough:quotation` (`tests/worker/quotation-walkthrough.ts`, `tests/worker/walkthrough-worker.ts`) runs the e2e test Worker for manual clicking: loopback only, mocked Access (a run-generated JWT added on `localhost`), mock inbox at `/__walkthrough/`, Turnstile off, other `/__test/` helpers not exposed. Test-only; no production import. Steps: `docs/QUOTATION_RUNBOOK.md` §0a.
- **Presentation build and checkout redesign (owner request, 2026-10-17; not reviewed):** `src/routes/quote.astro` checkout markup and styles redesigned; `src/scripts/quote.ts` changes are UI-only (method radio group with `change`, multi-step `data-q-step`, summary/review/result filling, `checkoutMethodLabels` in `src/lib/quotation/customer.ts`). Please include the page in the next recheck. Walkthrough build: no-endpoint Contact fixture plus a local CSP guard (runbook §0a). Evidence: `PROJECT_STATE.md`, top entry.
- New test-only routes in `tests/worker/owner-test-worker.ts`: `/__test/provider-script`, `/__test/provider-release` (mock provider control).

### 0.2 Regressions, each shown to fail against its defect

Each defect was re-applied temporarily (exact original statement), the tests run, and the repair restored.

| Finding | Simulated D1 (`npm test`) | Real local Workers/D1 / browser |
|---|---|---|
| 1 | fails (quotation `emailed` after the older send) | owner "Generations": fails ("the replacement link was marked emailed") |
| 2 | fails (resend 409) | owner "Generations": fails (409); 24/25 |
| 3 | plan test fails without `0007` (`SCAN email_jobs`) | empty pass reads 6,009 / 12,009 rows instead of 6; three retention scenarios fail |
| 4 | two tests fail (expired lease kept; count 0) | owner "Cap warnings (sending off)": fails |
| 5 | — | `npm run test:deploy:templates` negative control: the file used from `deploy/` fails (`No migrations present at ...\deploy\migrations`, entry point not found) |
| 6, 7 | — | e2e with the old `expectEqual` and old handler: 67/69 (Set comparison accepted; unknown id suppressed and unrelated `Unknown errorReason` rethrown) |

### 0.3 Cost evidence (real local D1, complete `runRetention` passes)

Fixture: per request a quotation, link, event, owner notification (1 attempt) and quotation email (2 attempts), plus 200 cap warnings (1 attempt each); half of everything older than 90 days.

| Email jobs (attempts) | Nothing eligible | First pass (25 requests + 100 cap warnings) | Second pass (25 requests) |
|---|---|---|---|
| 6,000 (8,900) | 3 statements, 6 read, 0 written | 178, 1,477 read, 450 written | 178, 780 read, 250 written |
| 12,000 (17,900) | 3, 6, 0 | 178, 1,477, 450 | 178, 780, 250 |

Identical at both sizes. Supersedes "132 rows read and 50 written per pass on 6,000 rows" in the earlier record (that fixture had requests only). Local D1 counters, not Cloudflare billing; cron CPU time still needs the preview.

### 0.4 Final suite (one complete run, 2026-10-17, after all repairs)

Node 24.11.1 first on PATH; Wrangler 4.147.0; headless Chromium (Playwright `chromium_headless_shell-1234`, HeadlessChrome/151.0.7922.34). Email, Access keys and Siteverify are simulated; external browser requests are blocked.

| Command | Result |
|---|---|
| `npm test` | 561/561 (22 files) |
| `npm run check` | 0 errors, 0 warnings, 2 hints (unrelated `design/references/*.mjs`) |
| `npm run test:build:turnstile` | all passed |
| `npm run build` | `dist/` byte-identical (72 files, SHA-256) to the `dist/` present before this run's build |
| `npm run test:deploy:templates` (new) | 6/6 |
| `npm run test:worker` | 30/30 |
| `npm run test:worker:owner` | 25/25 |
| `npm run test:worker:e2e` | 69/69 |
| `npm run test:browser` | 21/21 + 55/55 |
| `npm run check:release` | all automated release requirements met |
| `git diff --check` | clean |
| `git status wrangler.jsonc public/_headers` | unchanged |

Network note: Wrangler's own version check still runs (it printed "update available 4.151.1"); metrics are off and no Cloudflare credentials are passed. `test:deploy:templates` runs only `deploy --dry-run` and `d1 migrations apply --local`; no remote command, account, provisioning or deployment.

## 0b. Manual email release mode and the three outstanding findings (2026-10-17; not yet reviewed)

The owner changed the release plan to a free hosted academic version with manual email (Sunny sends invitations from his own email account). §0 above and earlier sections are kept as recorded. Design record: PROPOSAL §18, "Manual email release mode"; setup: `docs/QUOTATION_RUNBOOK.md`; candidate file list: `docs/PUBLICATION_MANIFEST.md`.

### What to review

| Area | Where | Check |
|---|---|---|
| Mode selection | `src/lib/quotation/invitation.ts` `manualEmailMode` | Anything but `"resend"` (including unset) is manual |
| Intake gate | `worker/public/store.ts` statements 6–7 (`?30`) | No notification job or counter change in manual mode; reservation, refund and outcome statements unchanged |
| Approval / new link | `worker/owner/store.ts` `approveQuote`, `replaceLink` (`queueEmail`) | Same atomic batches minus the job insert; link record and hash still in the batch |
| Invitation | `worker/owner/handler.ts` `invitationFor`; `pages.ts` `manualInvitation` | Token rebuilt only in the authenticated request, used only if `sha256 == token_hash`; never stored or logged; no-store; unavailable states show no link |
| mailto encoding | `invitation.ts` `mailtoHref` | RFC 6068: reserved address characters encoded (`@` kept), CRLF, `%20` not `+` |
| Copy script | `pages.ts` `OWNER_SCRIPT`, route `/owner.js` (after Access), CSP `script-src 'self'` | No inline script; buttons hidden without script; fallback selects the text; wording never claims sending |
| Mark as manually sent | `store.ts` `markInvitationSent`, `handler.ts` `postMarkSent`, migration `0008` | Single-use token bound to the quotation and version; Origin check; only the current, unexpired, unmarked generation; never changes version, status or customer access |
| Scheduled run | `worker/owner/scheduled.ts` | Manual mode returns before any transport; `cancelPendingEmail` cancels waiting jobs (`E_MANUAL_MODE`), kept as history |
| Retention bound | `worker/owner/retention.ts` | 5 requests per run: 38 statements, under Workers Free's 50 D1 queries per invocation |
| Finding 1: interceptions | `tests/worker/quotation-e2e.ts` `outstanding`, `complete`, `interceptionError` | Only an outstanding id with a browser-reported cancellation is excused; retired ids fail even after a navigation |
| Finding 2: workflow-off build | `QUOTATION_ON`, `src/routes/quotation-request.astro`, `InquiryForm.astro`, `src/scripts/inquiry.ts` (= published), `src/scripts/quotation-inquiry.ts`, `scripts/compare-published-build.ts` | `npm run check:published-build`: identical to `8263494` (before the repair: Contact CSS, inquiry bundle and an extra CSS chunk differed) |
| Finding 3: walkthrough | `tests/worker/quotation-walkthrough.ts`, `walkthrough-worker.ts` | No `--test-scheduled`; no scheduled export (the runtime's GET path answers 500 and runs nothing); mock inbox removed; mailto neutralized locally |

### Evidence (2026-10-17, local)

| Command | Result |
|---|---|
| `npm test` | 582/582 (incl. 17 new in `tests/quotation-manual.test.ts`) |
| `npm run check` | 0 errors |
| `npm run test:worker:e2e` (manual mode) | 69/69 |
| `npm run test:worker:owner` (automatic mode retained) | 25/25; retention passes 3 / 38 / 38 statements |
| `npm run test:worker` | 30/30 |
| `npm run test:build:turnstile` | all passed |
| `npm run test:deploy:templates` | 6/6 |
| `npm run check:published-build` | identical (71 files) |
| Browser journey on the manual walkthrough (scratch script) | 44/44 |

Defect demonstrations, each re-applied temporarily and restored:
- **intake gate:** 4 tests fail;
- **approval queues a job:** 4 tests fail;
- **mailto with `+` / LF:** 2 tests fail;
- **link not hash-checked:** 1 test fails;
- **scheduled run sends in manual mode:** 1 test fails;
- **mark-sent generation guard:** 1 test fails;
- **interceptions never retired:** e2e 67/69.

**Not verifiable locally:** real Access and its JWT header, edge `CF-Connecting-IP`, cron CPU time, real mail clients and long `mailto:` links, and the Zero Trust signup payment-method question.

### Review prompt for Codex

> Review the uncommitted BuildTrack changes for the manual email release mode and the three outstanding repairs, per docs/CODEX_HANDOFF_QUOTATION.md §0b. Focus on:
> 1. In manual mode (`EMAIL_MODE` ≠ `"resend"`), can any path create, claim or send an email job? Check intake statements 6–7, approval, new link, resend and the scheduled run. Are legacy waiting jobs handled truthfully and kept as history?
> 2. Customer-link secrecy: is the token rebuilt only inside authenticated owner requests, verified against `token_hash`, never stored or logged, served only on no-store pages, and never shown on public pages? Is the mailto encoding correct for unusual names, addresses and scopes?
> 3. Mark as manually sent: CSRF, single use, version binding, the generation guard, and no effect on customer access, version or status.
> 4. Lifecycle in manual mode: revoke, new link (old link refused, fresh invitation), dismiss and delete, and truthful owner wording.
> 5. Finding repairs:
>    - interception tracking: outstanding versus retired ids, and that a navigation alone never excuses an error;
>    - the workflow-off build is identical to `8263494`: run `npm run check:published-build`, and check that `QUOTATION_ON` folds as intended;
>    - the walkthrough exposes no scheduled or test route.
> 6. Retention: is 5 requests per run under the Free plan's per-invocation D1 query limit?
>
> Run the relevant suites. Report concrete defects with reproductions; do not expand scope.

## 0c. Codex findings A–C on the manual release: repaired and rechecked (2026-10-17)

Repairs:
- **A:** `jobLabel` describes ambiguous cancellations and expired leases truthfully.
- **B:** `cancelPendingEmail` retires expired sending leases atomically, using the sender's send-intent rules.
- **C:** the intake cap flag applies only when a notification was requested.

Regressions are in `tests/quotation-manual.test.ts`; each fails against its defect. Details: PROPOSAL §18, "Codex findings on the manual release, repaired".

**Codex narrow recheck** (`codex exec`, read-only sandbox, 2026-10-17): "Found no concrete defects in the three repairs."
- It ran its own in-memory checks of the production functions: retirement and send-intent outcomes, earlier ambiguity, live and newer state, the stale-completion fence, idempotence, labels, and real `storeRequest` binding at and below the cap.
- It could not run vitest because the read-only sandbox blocked the temporary directory.

This recheck covered A–C only. It is not a review of the whole manual-mode change (§0b).

## 1. What to review first (highest risk)

1. **Reload repair** (`src/scripts/quote.ts`, `src/lib/quotation/quote-page.ts`): `savePending` / `readPending` / `clearPending`, `parsePending`. Check two things:
   - stored metadata can never authorize, resurrect or alter an action;
   - a failed storage write never lets a mutation through.
2. **Lifecycle batches** (`worker/owner/store.ts`: `revokeQuote`, `replaceLink`, `dismissRequest`, `deleteRequest`, `purgeRequest`, `deletionSql`, `purgeGuardSql`, `runGuarded`). Check:
   - every statement after the guard acts only under the batch's `last_action` marker;
   - token consumption is in the same batch;
   - the delete and in-flight-send exclusion holds against the sender's claim (`worker/owner/sender.ts`).
3. **Retention** (`worker/owner/retention.ts`): the definition of last activity (who moves `last_activity_at`: `store.ts`, `worker/public/quote.ts`, `worker/public/store.ts`) and the bounded batches.
4. **Turnstile ordering** (`worker/public/intake.ts`). The order must be: kill switch, then fail closed when enabled without a secret, then the native-post refusal before the body is read, then body parsing and client identity, then Siteverify, and only then D1. Verification retry keys must stay separate from `submission_id`.
5. **Owner routes** (`worker/owner/handler.ts` `postLifecycle`, `worker/owner/pages.ts` `lifecycleAllowed` / `lifecycleConfirmPage`): bindings (revoke and new link → quote id + version; dismiss → request id, v0; delete → request id + quote version or 0), and that GET/HEAD never mutate.

## 2. Changed files

**Modified (tracked)** — earlier checkpoints' integration of the flagged Contact flow:
- `astro.config.ts`, `package.json` (scripts only; no dependencies)
- `src/components/form/InquiryForm.astro`, `src/config/site.ts`, `src/layouts/BaseLayout.astro`, `src/lib/contact-links.ts`, `src/pages/contact.astro`, `src/pages/robots.txt.ts`, `src/scripts/inquiry.ts`
- `tests/config.test.ts`, `tests/contact-links.test.ts`
- docs: `ARCHITECTURE.md`, `DECISIONS.md`, `PRESENTATION_HANDOFF.md` (new §6a), `PROJECT_STATE.md`

**New** (all untracked):
- **Schema:** `migrations/0001`–`0007` (`0007` added in §0).
- **Config:** `src/config/quotation.ts`, `wrangler.workflow.jsonc`, `wrangler.owner.local.jsonc` (local only), `deploy/*.example.jsonc` (templates).
- **Code:** `src/lib/quotation/*` (incl. new `turnstile.ts`), `src/integrations/quote-route.ts`, `src/pages/contact/[quotation].astro`, `src/routes/quote.astro`, `src/scripts/quote.ts`, `worker/public/*`, `worker/owner/*` (incl. new `retention.ts`).
- **Tests:**
  - `tests/quotation-*.test.ts` (new: `quotation-lifecycle`, `quotation-turnstile`) and `tests/deploy-templates.test.ts`;
  - `tests/support/*`;
  - `tests/worker/*` (new: `turnstile-build.ts`; test-only workers stay outside production imports);
  - `tests/browser/fixtures/quotation-*.ts`.
- **Docs:** `PROPOSAL_QUOTATION_WORKFLOW.md`, `QUOTATION_RUNBOOK.md`, this file.

**Untouched:**
- production `wrangler.jsonc` and `public/_headers`;
- the personal file `docs/anotherpromptthatistoolongforclaudecodetoread.md`.

**Migrations.** All are additive except one in-place edit: `0002` was revised before any deployment to allow the events `revoked`, `link_replaced` and `resent`. It has never been applied anywhere but local and test databases.

| File | Adds |
|---|---|
| `0001_quotation_intake.sql` | requests, reference sequences, client counters, daily totals, email jobs |
| `0002_quotation_owner.sql` | quotes, events, owner form tokens |
| `0003_quotation_email_jobs.sql` | job leases/snapshots, immutability triggers |
| `0004_email_attempts.sql` | attempt history (ids, times, codes) |
| `0005_quotation_customer.sql` | link history, simulated checkouts |
| `0006_quotation_lifecycle.sql` | `quote_requests.last_activity_at` (backfilled), `last_action`, indexes on activity and on request id for jobs/events |
| `0007_retention_cap_warning_index.sql` | (§0, finding 3) partial index for cap-warning jobs used by retention |

## 3. Implemented behavior and decisions (this pass)

- **A. Reload** (Codex's checkpoint 4 finding):
  - Tab-scoped pending metadata, written and read back before dispatch, and validated as untrusted.
  - A reload restores the exact action, token, version and attempt id, plus the lock, the uncertainty and "Check again".
  - It is cleared only on a recognised settling answer or a session replacement.
  - It stores no demo code, amounts or quotation content. If storage fails, nothing is sent.
  - The `no-store` headers are kept.
- **B. Lifecycle:**
  - Revoke covers approved or emailed quotations.
  - A new link keeps the **immutable snapshot and expiry**; none is offered after expiry.
  - Dismiss covers a received request with no quotation.
  - Delete removes the whole request and is **refused during an in-flight send**.
  - Queued and retry-wait jobs are cancelled by revoke and replacement. Claimed or provider-accepted emails are described as not recallable.
  - Customer pages show withdrawn, replaced or invalid without details.
- **C. Retention:**
  - 90 days after `last_activity_at`. Only owner actions and state-changing customer actions move it, and customer actions end at link expiry.
  - Each run deletes at most 25 requests, 500 used form tokens and 100 cap warnings.
  - Reference counters are kept. Items outside the application's control are stated in the runbook §10 and the proposal §17.
- **D. Turnstile:**
  - Implemented and **disabled**; fails closed.
  - Siteverify is mocked in tests. One idempotent retry; hostname and action are checked.
  - The no-JS refusal includes the phone guidance.
  - **Requiring JavaScript is not approved.**
- **E. Deployment preparation:**
  - Templates, plus a unit test that keeps them off and secret-free.
  - The runbook, with owner decisions, costs, a preview pair, cutover and rollback.

## 4. Test results

**Final run, 2026-10-17.** Node 24.11.1 is first on PATH; Wrangler 4.147.0; headless Chromium (`CHROME_PATH` = Playwright's `chromium_headless_shell-1234`). Email is mocked, Access keys are generated per run, Siteverify is mocked, and the browser is blocked from every external request. Each command was run once, from the repository root:

| Command | Result |
|---|---|
| `npm test` | 556/556 (22 files) |
| `npm run check` | 0 errors, 0 warnings; 2 hints in unrelated existing `design/references/*.mjs` scripts |
| `npm run build` + SHA-256 comparison of every `dist/` file with the pre-checkpoint-2 baseline | byte-identical |
| `npm run test:worker` (intake, real workerd/D1) | 30/30 |
| `npm run test:worker:owner` (owner, real workerd/D1, Chromium; incl. lifecycle and the 6,000-row retention cost) | 21/21 |
| `npm run test:worker:e2e` (full journey, reload repair, owner lifecycle) | see below; 66/66 after the harness fix |
| `npm run test:browser` | 21/21 + 55/55 |
| `npm run test:build:turnstile` | 6/6 |
| `npm run check:release` | all automated release requirements met |
| `git diff --check` | clean (only Git's LF→CRLF notices) |
| `git status wrangler.jsonc public/_headers` | unchanged |

**One end-to-end failure, investigated and fixed in the test harness** (not the product). In the final run, `test:worker:e2e` stopped with an unhandled `Fetch.continueRequest: Invalid InterceptionId`. The cause:
- the reload scenarios reload the page while a request is paused at the request stage;
- the browser drops that request;
- the request-stage handler's `continueRequest` / `failRequest` calls had no rejection handler. The response-stage calls already had one.

The fix, in `tests/worker/quotation-e2e.ts`: those four calls now ignore exactly that CDP error (`abandoned`), and any other error still fails the run. The request is recorded when paused, before the call, so no assertion changed. After the fix, two consecutive runs gave 66/66 and 66/66. An earlier full run in this pass, before the fix, had also passed 66/66, which is consistent with a timing race.

**Regression demonstrations in this pass:** the page from before the reload repair failed the 4 reload scenarios (61/65), and they pass with the repair.

**Simulated vs real:** every email, provider answer, Access token and Siteverify answer in these tests is simulated. No real email, inquiry or provider request was sent.

## 5. Known limitations

- While a link is expired, withdrawn or replaced, the customer page cannot confirm a pending action itself. It says so and gives the phone number.
- Pending-action recovery needs `sessionStorage`. Without it the page refuses to send, rather than risk a duplicate.
- A new link cannot change the quotation or extend its expiry; the owner needs a new request for that.
- Delete and retention cannot remove emails already sent, provider logs (Resend Free: 30 days), D1 Time Travel copies (7 days) or Formspree records.
- Local runs cannot show:
  - how Cloudflare's edge sets `CF-Connecting-IP`;
  - real Access JWTs;
  - real Resend delivery;
  - real Siteverify behavior;
  - cron CPU time on Workers Free.

  All of these are preview checks (runbook §7).
- Browsers covered: Chromium only, with simulated mobile widths and enlarged text. Firefox, Safari, real phones and screen readers are not covered.

## 6. Owner decisions and activation gates (none met)

1. Approve the privacy wording (`quotationPrivacyNotice.status` is `draft`).
2. Decide on the sending domain (existing, or buy one; no purchase authorized).
3. Decide on Turnstile and the no-JS tradeoff (unapproved; keep off).
4. Confirm the Access terms for one owner (unverified).
5. Create the resources (D1, owner Worker + Access, Resend + domain verification, secrets), following the runbook §2–§5.
6. Run a controlled preview on a separate Worker pair and database (runbook §7). Each step is recorded with its date.
7. Turn on `customerRoutes.ready` only after the preview verifies the customer routes.
8. A separately authorized production cutover (runbook §8).

## 7. Next steps

1. **Codex consolidated review** of this packet; findings are fixed locally.
2. **Owner decisions** 1–4 above.
3. **Commit** (when the owner instructs it) on a branch, not `main`, with production config untouched.
4. **Preview:**
   - create the preview resources;
   - apply migrations 0001–0006 to the preview D1;
   - deploy the preview pair with explicit `-c` configs;
   - run the runbook §7 checks in order, with sending enabled only for owner-controlled test addresses.
5. **Production:**
   - one reviewed cutover change (public config from the template, `quotationWorkflow.enabled`, `customerRoutes.ready`, approved wording);
   - deploy with `WORKFLOW_ENABLED=off`, then check that the static pages are unchanged;
   - enable the workflow, then sending;
   - send one controlled request and record its delivery.
6. **Rollback** at any point: the Worker vars off (instant) or revert the cutover commit (runbook §11).
