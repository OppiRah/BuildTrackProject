# Quotation workflow: owner setup runbook (revised 2026-10-17 for the manual email release; nothing in it has been done)

This is the order of steps for turning on the quotation workflow (ADR-043, `docs/PROPOSAL_QUOTATION_WORKFLOW.md`) as a **free academic release on the existing `buildtrack.sunnydelacruz.workers.dev` site, with MANUAL email**: BuildTrack sends no email; Sunny sends each prepared invitation from his own email account. **None of these steps have been carried out.** No Cloudflare database, owner Worker, Access application, Turnstile widget or secret exists for this project. Every value in `<ANGLE_BRACKETS>` must come from a real resource the owner creates; do not copy it from anywhere else. No domain purchase, Resend account or payment method is needed or authorized.

All switches in the repository stay **off** until the cutover: `QUOTATION_ON` (and with it `quotationWorkflow.enabled`), `customerRoutes.ready` and `TURNSTILE_ON` / `quotationTurnstile` in `src/config/quotation.ts`, and the Worker vars `WORKFLOW_ENABLED` and `TURNSTILE_ENABLED`. `EMAIL_MODE` is `"manual"` in both templates; there are no mail-provider settings. Production `wrangler.jsonc` stays assets-only until the cutover step. With `QUOTATION_ON = false` the built site is identical to the published commit `8263494` (`npm run check:published-build`).

Reviewed templates: `deploy/public.wrangler.example.jsonc` and `deploy/owner.wrangler.example.jsonc` (checked by `tests/deploy-templates.test.ts` and, with Wrangler's own path resolution, `npm run test:deploy:templates`). Commands below use the pinned Wrangler `npx wrangler@4.147.0` and are run from the repository root with Node 24 first on PATH.

### Where filled configs go

Wrangler resolves a config's `main`, `assets.directory` and `migrations_dir` relative to the folder of the config file, not the folder you run it from. The templates use repository-root paths, so they **do not work in place**: `-c deploy/owner.wrangler.example.jsonc` would look for `deploy/worker/...` and `deploy/migrations`. Copy each template to the repository root under exactly one of these names, fill it there, and pass that file with `-c`:

| File (repository root) | From template | Used for |
|---|---|---|
| `wrangler.owner.jsonc` | owner | production owner Worker (§3), production database migrations (§2) |
| `wrangler.owner.preview.jsonc` | owner | preview owner Worker and preview database (§6) |
| `wrangler.preview.jsonc` | public | preview public Worker (§6) |
| `wrangler.jsonc` | public | production public Worker: merged in at the reviewed cutover only (§7) |

The filled owner files contain the owner's address: do not commit them. Never move a filled file into `deploy/` or another folder.

## 0. Decisions the owner must make first

| # | Decision | Status |
|---|---|---|
| D1 | Approve the quotation privacy wording (`quotationPrivacyNotice`, still `draft`; the manual-email draft is quoted in PROPOSAL §18, "Manual email release mode"). | Open |
| D2 | Keep the defaults: requests deleted 90 days after last activity; quotation links valid 14 days. | Approved 2026-10-16; reconfirm |
| D3 | Turnstile on the quotation form. Turning it on means visitors without JavaScript can no longer send a quotation request online; they get phone guidance instead. | **Unapproved; keep off** |
| D4 | Cloudflare Access for one owner: Zero Trust must be enabled on the account. Community reports say the Free plan may ask for a payment method at signup; **if it does, stop** (not authorized). | Unverified |
| D5 | Go-live, after the controlled preview passes. | Open |

## 0a. Local walkthrough and presentation (no accounts; nothing sent)

`npm run walkthrough:quotation` builds the **complete website** into a temporary folder with the workflow enabled, starts the real Workers locally on `127.0.0.1` only (manual email mode), and prints the URLs. Home, Pricing and every other page are the normal site; their "Request a Quotation" buttons lead to the local workflow. Sign-in is mocked, Turnstile is off, data is synthetic, and Ctrl+C deletes everything.

| What | URL (default port 8787; `WALKTHROUGH_PORT` to change) |
|---|---|
| Presentation hub | `http://127.0.0.1:8787/__walkthrough/` |
| Website Home | `http://127.0.0.1:8787/` |
| Owner dashboard (mocked Access, signed in as `owner@example.test`) | `http://localhost:8787/` |
| Customer quotation page | the link prepared on the owner request page (`http://127.0.0.1:8787/quote/#t=...`) |

Journey: Home or Pricing → Request a Quotation → submit fictional details → owner dashboard: open the request, enter scope/amount/validity, review, **Approve quotation** → the request page shows the prepared customer invitation: **Copy email text** / **Copy quotation link** → paste the link into the address bar → accept → Demo checkout: Card — demo or Bank transfer — demo, Use sample code, Continue, Complete demo payment → Demo confirmation.

Safeguards in this presentation build (test tooling only; nothing here is in the deployed Workers):
- "Prepare email" is switched off on the local owner pages (with a visible note), so no email application opens during a recording. In the real release it opens a new message in the owner's email application.
- The general Contact form is built **without** an endpoint (test fixture `inquiry-unconfigured.ts`): it shows "not yet connected" and cannot reach Formspree; the launcher refuses to start if a Formspree address appears in the built Contact page. Website pages also carry `Content-Security-Policy: form-action 'self'; connect-src 'self'`.
- Mocked sign-in exists only in `tests/worker/walkthrough-worker.ts`; the e2e Worker's test helpers are not reachable, no scheduled handler is exported, and `--test-scheduled` is not passed (`GET /cdn-cgi/handler/scheduled` answers 500 and runs nothing).
- The owner pages use `localhost` and the customer pages `127.0.0.1`: two separate origins, as the two Workers will have.
- Stop with Ctrl+C in the terminal that runs it; start again with the same command for a fresh, empty database.

## 1. Costs (estimates from published free-tier limits, checked 2026-10-17)

- Cloudflare Workers Free: 100,000 requests/day, 10 ms CPU per request or cron run, 5 cron triggers per account (production uses 2; a preview pair 2 more). US$0 at academic volume.
- D1 Free: 10 databases, 500 MB per database, 50 queries per Worker invocation, daily row read/write limits enforced since 2026-09-01 (queries fail until midnight UTC if exceeded; stored data unaffected). Retention passes stay under 50 statements (§8).
- Access: expected US$0 for one owner on the Zero Trust Free plan; **payment-method requirement unverified** (D4).
- Email: Sunny's existing email account; no provider.
- Turnstile: only if D3 is approved.

## 2. Database (D1)

1. `npx wrangler@4.147.0 d1 create buildtrack-quotes` and copy the printed `database_id` (an identifier, not a secret) into the filled `wrangler.owner.jsonc` (and, at the cutover, `wrangler.jsonc`).
2. Apply migrations `0001`–`0008` in order: `npx wrangler@4.147.0 d1 migrations apply DB --remote -c wrangler.owner.jsonc`. Record the date and the output. All are additive; `0006` backfills `last_activity_at`, `0007` adds the cap-warning retention index, `0008` adds the owner's "marked sent" record.
3. Check the result with `npx wrangler@4.147.0 d1 execute DB --remote -c wrangler.owner.jsonc --command "SELECT name FROM d1_migrations"`, which should list eight rows.

## 3. Owner Worker and Cloudflare Access (before any secret)

1. Copy `deploy/owner.wrangler.example.jsonc` to `wrangler.owner.jsonc` at the repository root and fill it there (see "Where filled configs go"); do not commit it. `OWNER_EMAIL` is Sunny's sign-in address.
2. Deploy it with `WORKFLOW_ENABLED: "off"` while it has no secrets: `npx wrangler@4.147.0 deploy -c wrangler.owner.jsonc`. It answers 503 and touches nothing public. Its address is `https://buildtrack-owner.sunnydelacruz.workers.dev`.
3. In Zero Trust (enable it if needed; **stop if a payment method is requested**), enable the One-time PIN login and add a **self-hosted Access application** for the hostname `buildtrack-owner.sunnydelacruz.workers.dev` with one policy: email equals `OWNER_EMAIL`. Use a hostname application rather than the Worker-level "Protect this Worker" switch: the owner Worker verifies the `Cf-Access-Jwt-Assertion` JWT, and Cloudflare documents the Worker-level option through `ctx.access` without confirming that header (a missing header fails closed: 404).
4. Copy the team domain and the application's **AUD tag** into `ACCESS_TEAM_DOMAIN` / `ACCESS_AUD`, then redeploy.
5. Verify: an anonymous request is redirected to the Access login; a direct request with a forged `Cf-Access-Jwt-Assertion` header gets 404; after signing in, the owner list loads.

## 4. Secrets (never in files, chats or commits)

Generate each one as 32 random bytes in base64, for example `node -e "console.log(crypto.randomBytes(32).toString('base64'))"`, and paste it straight into `npx wrangler@4.147.0 secret put <NAME> -c <config>`.

| Worker | Secret | Purpose |
|---|---|---|
| Public | `INTAKE_HMAC_KEY` (+ var `INTAKE_HMAC_KEY_VERSION`) | Keyed hashes for rate limits and duplicate detection |
| Public | `TURNSTILE_SECRET_KEY` | Only if D3 is approved |
| Owner | `OWNER_FORM_KEY` | Signs owner confirmation forms |
| Owner | `QUOTE_LINK_KEY_V1` (+ var `QUOTE_LINK_KEY_CURRENT=1`) | Builds customer link tokens; used for nothing else |

No email-provider secret exists in manual mode.

Rotation:
- **Intake key:** set the new secret and increment `INTAKE_HMAC_KEY_VERSION`. Rate-limit counters and duplicate detection restart, and no stored request is affected.
- **Link key:** add `QUOTE_LINK_KEY_V2`, then set `QUOTE_LINK_KEY_CURRENT=2`. New links use V2. Keep V1 until every link made with it has expired (14 days): the owner page rebuilds a prepared invitation with the key version recorded at approval, and shows "the key for this link is no longer configured" otherwise. A suspected leak instead means: revoke or replace the affected links on the owner pages, then remove V1.
- **Owner form key:** replace it at any time. Open confirmation pages become invalid and must be reloaded.

## 5. Sending invitations manually (the release mode)

- New requests appear on the owner dashboard; **check it regularly**: no notification email is sent to Sunny.
- After approval, the request page shows the prepared invitation: **Prepare email** (opens a new message in the email application, addressed to the customer, with subject and text filled in), **Copy email text**, **Copy quotation link**, and the fields themselves. Review the message and press **Send in the email application**. Opening or copying never sends anything.
- Optionally use **Mark as manually sent…** to record it ("Marked sent by owner"). It does not prove delivery, and the customer's link works either way.
- **New link** (owner page): older links stop working at once; prepare and send a fresh invitation. **Revoke**: the link stops working; an invitation already sent cannot be recalled.
- The link is the customer's private key to the quotation: send it only to the address on the request.

## 6. Controlled preview (before production)

Use a separate preview pair so that production is never involved:
- Workers named `buildtrack-preview` and `buildtrack-owner-preview`
- a separate D1 database `buildtrack-quotes-preview` (migrations with `-c wrangler.owner.preview.jsonc`)
- `PUBLIC_ORIGIN` / `OWNER_ORIGIN` set to their own workers.dev origins
- the owner preview Worker behind its own Access application as in §3

Build the preview site locally from the release commit with `QUOTATION_ON = true` (do not commit that until the cutover), `npm run build`, then deploy each Worker with its explicit `-c`; production Workers Builds watch `main` and are not involved.

Checks, in order. Record each one with its date. Use fictional data; do not send email (opening a prepared link yourself is fine).
1. With `WORKFLOW_ENABLED=on` on both Workers, send one **test** request from a real browser (JavaScript and no-JS). Confirm it appears on the owner page, that no email is sent, and that the rate-limit identity comes from Cloudflare's `CF-Connecting-IP` (local runs cannot show this).
2. Owner authentication: anonymous → Access login; a forged header → 404; another email → refused by Access.
3. Draft, approve, prepare/copy the invitation, open the copied link yourself; accept, decline (separate test request), reload and "Check again" recovery, and the demo checkout. Revoke, new link (old link refused, fresh invitation works), dismiss and delete. Confirm GET never changes anything.
4. Confirm `/__test/`, `/__walkthrough/` and `/owner.js` (without Access) are not publicly reachable and that no mock sign-in exists.
5. Check that Workers Logs show only fixed codes (no names, addresses or tokens), that `invocation_logs` stays off, and the owner cron's CPU time (retention).
6. Delete the preview data, or let retention remove it. Remove the preview Workers and database when done.

## 7. Production cutover (separately authorized)

1. In one reviewed change: merge the filled public template into `wrangler.jsonc` (`main`, D1 binding, `run_worker_first: ["/api/*", "/quote/*"]`, cron, `EMAIL_MODE: "manual"`), set `QUOTATION_ON = true`, and the approved privacy wording (`status: 'approved'`). `customerRoutes.ready` only gates the retained automatic sender; it can stay false.
2. Set the public secret (`INTAKE_HMAC_KEY`) on the `buildtrack` Worker before the push; deploy with both Workers' `WORKFLOW_ENABLED=off`, then confirm the static pages work.
3. Turn on `WORKFLOW_ENABLED` (owner, then public) and run one controlled fictional request through to the demo checkout.

## 8. Scheduled work

| Worker | Cron | Work |
|---|---|---|
| Public | `17 * * * *` | Deletes rate-limit counters after 48 h and daily totals after 8 days |
| Owner | `*/5 * * * *` | Retention; in manual mode nothing is sent (any waiting automatic-mode job is cancelled and kept as history) |

Retention deletes whole requests 90 days after their last activity: at most **5 requests**, 500 form tokens and 100 cap-warning jobs per run (up to 1,440 requests a day), so each pass stays under the Free plan's 50 D1 queries per invocation even if every batched statement counts. Local measurement (2026-10-17, real local D1, a history with requests, quotations, links, events, email jobs and attempts): a pass with nothing to delete used 3 statements, 6 rows read, 0 written; a pass deleting 5 requests and 100 cap warnings used 38 statements, 857 rows read, 250 written; identical at 6,000 and 12,000 email jobs. These are local D1 counters, not Cloudflare billing. CPU time on Cloudflare must be checked in the preview.

## 9. Logging and privacy

- Workers write fixed event codes only, and invocation logs stay off. Customer links are never stored or logged; they exist only in the authenticated, no-store owner page.
- Records outside the application's control are **not** deleted by retention:
  - D1 Time Travel: whole-database restore points for 7 days on Free
  - invitations already sent: Sunny's Sent folder and the customer's mailbox
  - Formspree's archive for the other forms

The privacy wording promises only what the application does.

## 10. Rollback and recovery

- **Instant:** set `WORKFLOW_ENABLED=off` (public and/or owner) and redeploy the vars. Customer links and the intake answer 503; nothing is lost.
- **Site:** revert the cutover commit. With an assets-only `wrangler.jsonc` and `QUOTATION_ON = false`, the site is identical to today's (`npm run check:published-build`). The D1 data stays until retention or a manual delete.
- **Data:** D1 Time Travel can restore the whole database to a point in the last 7 days. A restore also brings back deleted records, so after one, re-run deletions the owner had made.
- **Leaked secret:** rotate as in §4. Revoke or replace affected customer links on the owner pages.
