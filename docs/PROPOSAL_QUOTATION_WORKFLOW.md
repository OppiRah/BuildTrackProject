# Quotation Workflow: approved design (revision 3) and implementation record

Status: **Design approved for local implementation 2026-10-16 (owner), including the dedicated quotation form and the separate protected owner Worker.** Approved defaults: 90-day application retention, 14-day quotation-link validity, "Bank transfer (simulated)" label. The privacy wording stays **draft**. No domain purchase, account creation, billing, real email, real inquiry, deployment, push or merge is authorized. Implementation is local only, with local D1 and mocked email; §18 records progress.

Revision 2 made six changes:
- corrected the domain requirement
- specified how customer links work
- specified durable email jobs
- closed the no-JS gap
- clarified what the demo code is
- restated costs as estimates

The owner kept revision 2 as proposed. Revision 3 changes the following:
- §6: `/contact/quotation/` becomes the canonical quotation form.
- §4: specifies the HMAC token construction and the key policy, and corrects the logging claims.
- §7: atomic approval uses D1 `batch()`, verified against the docs.
- §16: new section on origin and CSRF protection.
- §17: new section on deletion.
- §12: Access limits are marked unresolved.

## 0. Authorization and scope change (recorded as ADR-043)

- **What the owner authorized:** a small backend for an automated quotation workflow, with a real owner notification, an owner-approved quotation email, recorded customer acceptance and a simulated checkout. For **this workflow only**, that authorization supersedes ADR-009's restriction against a backend, database, authentication and admin features, and amends ADR-016's assets-only hosting.
- **What stays in force:**
  - ADR-014: no new runtime npm dependency.
  - ADR-042 for `/payment-demo/`, which stays a fully simulated standalone walkthrough that sends no email.
  - No real payments, payment provider, financial-data collection, payment instructions or QR codes, as before.
- **Approved 2026-10-16** for local implementation (see Status).
- **Local `CLAUDE.md`:** its "No custom backend, database, authentication, admin" line should be updated to match once the design is approved.

Readings of the garbled parts of the first request (unchanged from revision 1):
- Approval needs an explicit owner action, and link previews must never approve or send.
- Simulated payment status is kept separate from real records.
- The demo code is never transmitted, persisted, logged or included in backend requests.
- The demo code is never treated as authentication.

## 1. Current state (inspected)

- **Hosting:** Cloudflare Workers static assets at `https://buildtrack.sunnydelacruz.workers.dev`. There is no `main` script and no bindings. Workers Builds deploys on every push to `main`. `tests/hosting.test.ts` asserts that there is no `main` or `run_worker_first`.
- **Contact:** one form with three request types (`demo`, `quotation`, `service`). `src/scripts/inquiry.ts` sends them to Formspree with `fetch`, and the no-JS fallback is a native POST to Formspree. Validation is pure and reusable (`src/lib/inquiry-validate.ts`). The honeypot is `_gotcha`. The privacy acknowledgment names Formspree only.
- **Payment demo:** `/payment-demo/` is fully simulated and shows "Simulated—no money moved. Not a payment receipt.".
- **Gates still open and unchanged:** Formspree recipient verification, production-request receipt and CE review.

## 2. Domains: hosting and owner protection vs email sending

These are separate questions:
- **The public website does not move.** It stays on `buildtrack.sunnydelacruz.workers.dev`, and customer quotation links use that host too.
- **Owner protection needs no domain.** Cloudflare Access can protect a `workers.dev` hostname, a single path, or a whole Worker on all of its hostnames (Workers › Configuration › Cloudflare Access, read 2026-10-16).
- **Only email sending needs a domain.** Resend sends to customers only from a verified domain the sender owns. `onboarding@resend.dev` delivers only to the Resend account owner's own address, so it could carry Sunny's notifications but not customer quotations. The domain is used only for DNS records (SPF, DKIM, return-path MX and DMARC), not for hosting. A subdomain such as `mail.<domain>` is recommended. The Resend pages I read do not require any particular DNS host.

### 2.1 Owner protection options

| | A. Path apps on the public hostname | **B. Separate owner Worker (recommended)** |
|---|---|---|
| Setup | Access self-hosted apps for `buildtrack…workers.dev/owner/*` and `/api/owner/*`. The public Worker gains `run_worker_first` for those paths. | A new Worker `buildtrack-owner` (`buildtrack-owner.sunnydelacruz.workers.dev`) with **Worker-level Access, All traffic**, binding the same D1 database. |
| Public site | Same Worker as the owner functions; correctness depends on path matching and normalization (`/%6Fwner`, `//owner`, case). | Contains **no owner code**, no Resend key and no link secret. Nothing to mis-match. |
| Access context | `ctx.access` is not passed through static-asset routing, so the Worker must verify the JWT itself. | Also verifies the JWT itself (defence in depth; one code path). |
| Deploy | One Workers Builds project. | A second Workers Builds project connected to the same repository, with root directory `owner/`, its own `wrangler.jsonc` and watch paths (documented monorepo setup). |
| Previews | Separate preview apps needed. | "All traffic" covers its previews. |

**Choice: B.** It has the smaller blast radius: even if the Access setup is wrong, the public Worker exposes nothing, because owner functions do not exist there. The owner Worker also checks `Cf-Access-Jwt-Assertion` on every request:
- verifies the RS256 signature with WebCrypto against `https://<team>.cloudflareaccess.com/cdn-cgi/access/certs`
- checks the issuer, the AUD tag and expiry
- requires `email === OWNER_EMAIL`

Anything else gets 404. JWT tests use local keys and `access.dev` in `wrangler dev`.

**The owner UI is server-rendered HTML from the owner Worker, using native forms and no client script.** Pages: request list → request detail → edit quotation → **confirmation page** (exact recipient, scope, amount, expiry, "Send quotation" / "Cancel") → result. Every GET is read-only. POSTs require:
- `Origin` equal to the owner host
- a per-step confirmation nonce bound to the quote id and version, single use, expiring after 10 minutes
- the expected `version`

All values are HTML-escaped by one tested helper. Responses send `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex`, `frame-ancestors 'none'` and a CSP with no external sources. *(Corrected at checkpoint 2: owner pages send `Referrer-Policy: same-origin`, because under `no-referrer` Chromium sent `Origin: null` on native form submissions, which the exact-Origin rule refuses; see §18, checkpoint 2.)*

## 3. Architecture

```
Public Worker  buildtrack.sunnydelacruz.workers.dev   (assets-first; run_worker_first: ["/api/*"])
 ├─ static site (unchanged), /quote/ shell, /contact/quotation/ (new, see §6)
 ├─ POST /api/quotation-requests   JSON (JS) or form-encoded (native, no JS)
 └─ POST /api/quote/{view,accept,decline,simulate}   token in JSON body
        │  writes requests, queues jobs, reads quotes by token hash; holds no email key or link secret
        ▼
       D1  buildtrack-quotes   (shared binding)
        ▲
Owner Worker  buildtrack-owner.sunnydelacruz.workers.dev   (Access: All traffic + JWT check)
 ├─ server-rendered owner pages and POST actions
 ├─ secrets: RESEND_API_KEY, QUOTE_LINK_KEY_V1 (dedicated link key, §4)
 └─ cron every 5 min: send due email jobs, expire quotes, daily purge ──► Resend API (fetch)
```

- **Shared pure logic** lives in `src/lib/quotation/`: states, validation (reusing `inquiry-validate.ts`), escaping, templates, token derivation, the job scheduler and amounts. Both Workers bundle it, and the existing Vitest suite tests it.
- **Tooling:** types come from `npx wrangler@<pinned> types`, migrations are plain SQL in `migrations/`, and there is no new dependency.
- **Kill switches:**
  - `quotationWorkflow.enabled` in `src/config` (default `false`): until it is on, Contact behaves exactly as today.
  - `WORKFLOW_ENABLED` var: the public API returns 503 while it is unset.
  - `SENDING_ENABLED` var on the owner Worker: jobs queue but do not send while it is unset.
- **Owner notification latency:** new requests queue an owner-notification job, which the cron sends within about 5 minutes. This keeps the Resend key out of the public Worker. A service-binding "kick" could make it immediate but is not proposed.

## 4. Customer links

**Token construction (so retries can rebuild the link without storing it):**
- **Dedicated key:** `QUOTE_LINK_KEY_V<n>` is 32 bytes from a CSPRNG, stored base64 as a Wrangler secret on the **owner Worker only**. It is used for nothing else: not for IP hashing, nonces or anything in the public Worker. The var `QUOTE_LINK_KEY_CURRENT=<n>` selects the key for new links.
- **Message:** the UTF-8 bytes of `"buildtrack.quote-link"`, `0x00`, `key_version`, `0x00`, `quote_id`, `0x00`, `link_generation`.
  - `quote_id` is a random UUIDv4.
  - `key_version` and `link_generation` are decimal integers.
  - Fixed separators, plus fields that never contain `0x00`, make the encoding unambiguous.
- **Token:** `"v" + key_version + "." + base64url_nopad(HMAC-SHA-256(key, message))`, a 256-bit MAC computed with WebCrypto (`crypto.subtle.importKey('raw', …, {name:'HMAC', hash:'SHA-256'})` + `sign`).
- **Stored:** `token_hash = hex(SHA-256(token))` (UNIQUE, indexed), `link_key_version` and `link_generation`. The token itself is never stored.
- **Verification:** the public Worker needs no key. It hashes the presented token and looks it up, then checks status, expiry and `revoked_at`. A lookup by hash of a high-entropy value is not a usable timing oracle.
- **Retries:** the owner Worker recomputes the identical token from the quote's recorded `link_key_version` and `link_generation`, so every attempt and every explicit resend of the same link renders identically.

**Revocation and rotation policy:**
- **Per-quote revoke:** set `revoked_at` and `token_hash = NULL`. The old link matches nothing, and no key change is needed.
- **New link:** `link_generation + 1` with the current key version, giving a new `token_hash`.
- **Expiry:** `expires_at` is checked on every request, and the cron also marks expired quotes.
- **Routine rotation:** none is scheduled at academic scale. A rotation adds `V<n+1>` and switches `QUOTE_LINK_KEY_CURRENT`. Old keys stay only while a quote that uses them is open, at most the 30-day maximum validity, and are then deleted with `wrangler secret delete`.
- **Suspected key exposure:**
  1. Revoke every open quote that uses that key version (one statement).
  2. Delete the key.
  3. The owner page lists the affected quotes with "New link & resend", each needing explicit confirmation. Nothing is resent automatically.
- **Database exposure alone** yields hashes, not links. **Key exposure alone** yields nothing without quote ids and generations, which live only in D1.

**Link format:** `https://buildtrack.sunnydelacruz.workers.dev/quote/#t=<token>`. The fragment is not sent automatically in HTTP requests, so it is absent from request URLs, `Referer` headers and Cloudflare's request metadata. The URL holds no reference number, name or email. **The token is then sent deliberately in POST bodies (below), so logging controls are still required (§4, "Logging").**

**Browser exchange:**
1. The static `/quote/` shell holds no data. Its script reads `location.hash`, keeps the token in `sessionStorage` (falling back to memory if storage throws), and immediately calls `history.replaceState(null, '', '/quote/')`. This removes the token from the address bar, screen shares and new history entries, while a reload in the same tab still works.
2. It POSTs `{ "token": "…" }` with `Content-Type: application/json` to `/api/quote/view`. The public Worker hashes the token, then looks up a quote with a matching hash, a valid status (`approved`, `emailed` or `accepted`), `expires_at > now` and no `revoked_at`. It returns the minimum view: reference, customer's first name, scope, amount, expiry and status.
3. Accept, decline and simulate repeat the same body token. There are no cookies or sessions.
4. Invalid, expired and revoked links all get the same neutral 404 JSON ("This quotation link is no longer valid. Contact BuildTrack."), so the response does not reveal whether a link ever existed.

**Private and uncached:**
- Data travels only in POST responses, which Cloudflare's cache never stores; the Worker uses no Cache API.
- Every API response sends `Cache-Control: no-store`, `Referrer-Policy: no-referrer` and `X-Robots-Tag: noindex`.
- The `/quote/*` shell gets the same headers via `public/_headers`, plus a CSP of `default-src 'self'; connect-src 'self'` with no third-party resources.
- The rendered quote is cleared on `pagehide`.
- `robots` and the sitemap exclude `/quote/`.

**Logging.** The token is present in POST bodies and in the owner Worker's memory while it renders an email. Workers Logs is **enabled by default for new Workers**. It captures `console.*` output, errors, uncaught exceptions and per-request invocation logs, and keeps them 3 days on Free (docs read 2026-10-16). Controls, both Workers:
- **Config:**
  - Set `observability.logs.invocation_logs = false`. Do not rely on knowing exactly which request fields invocation logs capture.
  - Keep custom logs only through the allowlisted logger below, or set `observability.enabled = false` if no logs are wanted.
  - No Logpush, no Tail Workers, no analytics.
- **One logger, `log(event, fields)`:** it accepts only an allowlisted set of keys (route id, status code, job id, outcome code, duration). The type system rejects anything else. Arbitrary strings, `request`, `body`, `headers`, `error.message` and `error.stack` are all disallowed. Direct `console.*` is banned by a unit test that greps `worker/` and `owner/`.
- **Errors:** the top-level `fetch` and `scheduled` handlers catch everything and return a generic 500 or job failure, logging only `{event:'error', code:'E_<STAGE>', route}`. Nothing is rethrown, so no uncaught exception reaches the runtime log with values. Error messages from D1 and Resend are mapped to codes and never logged or stored verbatim. The job's `last_result` stores the code, never response bodies.
- **Bodies:** parsed once, then the token is hashed immediately. The raw token is never placed in D1, KV, caches or response bodies. Responses never echo submitted values (validation errors name fields, not values).
- **Local development:** `wrangler tail` and the dev console use the same logger, and test fixtures use obviously fake tokens.
- **Tests:** a worker-integration test captures all log output during every scenario and asserts that it contains no token, email address, name, phone or demo code.
- **Disclosed exceptions outside our control:** Resend receives the rendered email, which includes the link and the customer's address. It keeps sent-email data per its own retention and terms (the free plan's published log retention is 30 days); see §17. Links expire (proposed 14 days) and can be revoked.

**Guessing and abuse:** 256-bit tokens, plus a per-client counter on `/api/quote/*` (30 per hour), keyed as for intake: a keyed hash of the client's rate-limit identity (§18, "Checkpoint 1 repairs").

**GET never changes anything**, so email scanners and link previews only ever load the empty shell.

## 5. States, approval and acceptance

```
request:  received ──owner creates quotation──► quoted        received ──owner dismisses──► dismissed

quotation:
  draft ──(owner confirms send)──► approved ──job accepted by provider──► emailed
  emailed|approved ──customer confirms accept──► accepted     ──customer declines──► declined
  approved|emailed ──expires_at──► expired     any open state ──owner revokes──► revoked
  revoked|expired ──owner confirms "new link & resend"──► approved (link_generation+1)
```

- **Owner approval** (`approved_at`, `approved_by`, a frozen snapshot) and **customer acceptance** (`accepted_at`) are separate columns. Each also appends a `quote_events` row with actor `owner`, `customer` or `system` and no request bodies.
- **Why links work in `approved`:** if a send attempt had an ambiguous outcome, the customer may already hold a valid email.
- **Customer accept:** a confirmation dialog reads "Accept quotation BT-Q-2026-0007 for ₱X? BuildTrack is an academic project; no payment is due." Confirming sends a conditional update: `UPDATE quotes SET status='accepted', accepted_at=? WHERE token_hash=? AND status IN ('approved','emailed') AND expires_at>? AND revoked_at IS NULL`. A repeat click finds the quote already accepted and returns the accepted view.
- **Server guarantees:** buttons disable while a request is in flight, but every transition is guaranteed by a conditional update on the server, not by the UI.
- **Amounts:** integer centavos in PHP, ₱1–₱10,000,000. Scope text is 10–2,000 characters. The amount is prefilled from the plan's proposed price in `src/config/pricing.ts` when one exists, and is never invented.

## 6. Contact flow (revision 3): `/contact/quotation/` is the canonical quotation form

**One quotation entry point for everyone.** `/contact/quotation/` is the only place to request a quotation, whether or not the visitor has JS. There is no quotation option on the general Contact form, and nothing is temporarily disabled.

**`/contact/quotation/` (new static Astro page, built only when `quotationWorkflow.enabled`):**
- **Fields:** service, plan, name, email, organization, phone, organization type, project need, message, privacy acknowledgment (quotation wording, §11) and the `_gotcha` honeypot. The limits are the existing ones (`fieldLimits`). There is no request-type control: the server fixes the type as `quotation`.
- **Without JS:** `<form method="POST" action="/api/quotation-requests">`, a real native submission to the public Worker.
- **With JS:** a small script reuses the existing validation (`inquiry-validate.ts`), the error-summary and focus behaviour, and the `SubmitOutcome` classification. It sends the same fields as JSON with a per-fill `submission_id`, and shows the reference inline on success.
- **Preselection:** `?service=` and `?plan=` are parsed by the existing `parsePreselection()` allowlist; any `type` is ignored on this page. Accepted values only set the `selected` state of existing options, and unknown or repeated values are dropped silently, exactly as Contact does today. As today, preselection needs JS; without it the selects start at "Not sure yet" and stay editable.

**Contact (`/contact/`), once the flag is on:**
- The request-type radios become **Request a Demo** and **Avail a Service**. Both still go to Formspree with the current behaviour and no-JS fallback.
- A plain link card, "Request a quotation → `/contact/quotation/`", sits above the form and works without JS.
- **Legacy links** such as `/contact/?type=quotation&service=x&plan=y` (old bookmarks or outside links):
  - With JS, `inquiry.ts` calls `location.replace('/contact/quotation/?service=x&plan=y')`, carrying over only allowlisted values.
  - Without JS, the visitor sees the link card at the top.
  - The Contact allowlist for `request_type` becomes `demo` and `service`, so the Formspree form can no longer carry a quotation.
  - A server-side redirect is not proposed, because it would route `/contact/` through the Worker.

**CTAs (no per-page edits):**
- `contactHref({ type: 'quotation', service?, plan? })` in `src/lib/contact-links.ts` returns `/contact/quotation/?service=…&plan=…` while the flag is on, and keeps today's `/contact/?type=quotation…` while it is off.
- That covers Home (2 CTAs), Solutions (per-service and closing CTAs), Pricing (per-plan "Request a quotation" and the closing CTA) and About's lead, while keeping each CTA's allowlisted service or plan.
- Unit tests cover both flag states. The browser test follows every quotation CTA and asserts that the destination and preselection are correct.

**With the flag off,** everything is unchanged: the Contact form keeps three types, all going to Formspree, and the page `/contact/quotation/` is not built.

**Native POST handling (public Worker):**
- **Request checks:** only `application/x-www-form-urlencoded` (native) or `application/json` (script) is accepted, and Origin rules apply (§16).
- **Validation:** the same server validation and honeypot run on both paths.
- **No-JS errors:** a 400 page lists the fields with errors (field names and messages only, never submitted values) and has a "Go back to the form" link; browsers keep the entered values.
- **No-JS success:** a 200 page shows the reference and what happens next.
- **No-JS duplicates:** without JS there is no `submission_id`, so the server de-duplicates by `SHA-256(email ‖ organization ‖ project_need)` within 30 minutes and returns the same reference on a resubmit or reload.
- **Formspree:** receives only `demo` and `service` while the flag is on. Quotations sent to Formspree before the switch are answered manually, as now.

**Requirements to reconcile when this is approved:** REQUIREMENTS.md items 1, 2 and 5 currently say the selected request type "carries to Contact" and is sent "to the configured form provider". For quotations, these would read "carries to the quotation request page" and "sent to the BuildTrack quotation service".

**Server validation (both paths):**
- `validateInquiry()` with `request_type` forced to `quotation`
- unknown or repeated fields rejected, bodies capped at a size derived from the field limits (§18), the declared `Content-Type` required
- per client: at most 5 new requests per hour and 20 per day (keyed hash of the client's rate-limit identity, deleted after 48 h); at most 200 new requests per day in total
- at most 30 owner-notification jobs per day; beyond that, requests are stored, flagged and visible on the owner page
- customers can never trigger an email to themselves: every customer email follows an owner approval

## 7. Durable email jobs

**Table:** `email_jobs(id, kind: owner_notification|quotation, request_id, quote_id, link_generation, resend_seq, idempotency_key UNIQUE, status, attempts, ambiguous, first_attempt_at, next_attempt_at, lease_id, lease_until, payload_sha256, provider_message_id, last_result, created_at)`, with `UNIQUE(quote_id, kind, link_generation, resend_seq)`.

**Statuses:**
- `queued` → `sending` → `provider_accepted`
- `sending` → `retry_wait` → `sending` (repeats)
- `sending|retry_wait` → `needs_owner` (window closed, or a permanent error)
- `queued|retry_wait` → `cancelled` (quote revoked before sending)

**Atomic approval and job creation, using D1's documented mechanism:**
- **What D1 provides:** the D1 Worker API documents `batch()` as the multi-statement transaction: "Batched statements are SQL transactions". Statements execute sequentially and non-concurrently, and if one fails, D1 "aborts or rolls back the entire sequence". D1 otherwise auto-commits each statement. The API docs do not document `BEGIN`/`COMMIT` as a supported route, so this plan never uses SQL transaction statements or `exec()` for this.
- **The approval batch:**
  1. `UPDATE confirm_nonces SET used_at=:now WHERE nonce_hash=:n AND action='approve' AND quote_id=:id AND version=:v AND owner=:owner AND used_at IS NULL AND expires_at>:now`
  2. `UPDATE quotes SET status='approved', version=version+1, approval_id=:a, link_key_version=:k, link_generation=:g, token_hash=:h, approved_at=:now, approved_by=:owner, snap_…=… WHERE id=:id AND status='draft' AND version=:v AND EXISTS (SELECT 1 FROM confirm_nonces WHERE nonce_hash=:n AND used_at=:now)`
  3. `INSERT INTO email_jobs (id, kind, quote_id, link_generation, resend_seq, idempotency_key, status, next_attempt_at, created_at) SELECT :job, 'quotation', id, link_generation, 0, 'bt-q-' || id || '-g' || link_generation || '-s0', 'queued', :now, :now FROM quotes WHERE id=:id AND approval_id=:a`
  4. `INSERT INTO quote_events (…) SELECT … FROM quotes WHERE id=:id AND approval_id=:a`
- **Why it is safe:** `:a` is a fresh random approval id generated for this request. Steps 3–4 therefore insert only if **this** request's update won. A concurrent request with the same `version` updates 0 rows and inserts 0 rows, even though the quote is now `approved`. `UNIQUE(idempotency_key)` and `UNIQUE(quote_id, kind, link_generation, resend_seq)` are backstops: a violation fails the statement, and D1 rolls back the whole batch.
- **After the batch:** the Worker checks `meta.changes` per statement and treats `[1,1,1,1]` as success. Anything else means nothing happened (rows changed only together) and the owner sees "Already sent or changed; reload".
- **Same pattern elsewhere:** revoke, resend, delete and customer accept each use one `batch()` with a conditional update followed by inserts keyed to that update.

**Stable idempotency key and payload:**
- The key is fixed when the job is created and follows the pattern `bt-q-<quote_id>-g<generation>-s<resend_seq>` (under 256 characters).
- Rendering is deterministic: the frozen snapshot plus the template version plus a link recomputed from the recorded `link_key_version` key and the generation.
- `payload_sha256` is stored on the first attempt. If a later render differs (for example after a template change during deployment), the job goes to `needs_owner` instead of sending a different payload under the same key, which Resend would reject with 409 `invalid_idempotent_request`.

**Concurrent-send protection:**
- A runner claims a job with `UPDATE email_jobs SET status='sending', lease_id=:rand, lease_until=:now+120s, attempts=attempts+1, first_attempt_at=COALESCE(first_attempt_at,:now) WHERE id=:id AND status IN ('queued','retry_wait') AND next_attempt_at<=:now RETURNING *`. Only one runner gets the row.
- Every follow-up update includes `AND lease_id=:mine`, so a late runner cannot overwrite a newer result.
- The fetch timeout (30 s) is shorter than the lease.
- An expired `sending` lease (a crashed runner) is treated as ambiguous and becomes due again.

**Classifying the provider's response:**

| Result | Meaning | Action |
|---|---|---|
| 2xx with `id` | Accepted by provider (including Resend's replay of an earlier accepted send for the same key) | `provider_accepted`; store the message id; quote `approved`→`emailed` |
| Timeout, network error, 5xx, expired lease | **Ambiguous**: Resend may have accepted it | `retry_wait`, `ambiguous=1`; retry with the **same key and payload** |
| 409 `concurrent_idempotent_requests` | The same key is still in progress | `retry_wait` (ambiguous) |
| 429 | Not accepted (rate-limited) | `retry_wait` |
| Other 4xx (invalid sender, domain unverified, 422, 409 `invalid_idempotent_request`) | Permanent | `needs_owner`, no automatic retry |

**Retries stay inside Resend's 24-hour key window:**
- Backoff: 1, 5, 15 and 30 minutes, then hourly. Cron runs every 5 minutes.
- Automatic attempts stop at `first_attempt_at + 20 h`, leaving a 4-hour margin, because the key is only honoured for 24 hours.
- After that the job becomes `needs_owner`, and the owner page labels it accurately: "Not sent" if no attempt was ambiguous, or "Outcome unknown: Resend may have accepted it. Check the Resend dashboard before resending" if any attempt was.

**Explicit resend after the window:**
- The owner chooses "Send again" and sees a confirmation page. When the earlier outcome was ambiguous, it warns: "The customer may receive two copies."
- Confirming creates a new job with `resend_seq+1`, a new key, the same link and the same generation.
- "New link & resend", used after a revocation, increments `link_generation` instead.
- Nothing is ever re-sent automatically under a new key.

**Accepted is not delivered:**
- `provider_accepted` means only that Resend took the message. The owner page says "Accepted by Resend", never "Delivered".
- Resend's `email.delivered` webhook (the free plan allows 1 endpoint) would mean only that the recipient's mail server accepted the message, not that it reached the inbox. The webhook is deferred and not proposed now.
- Inbox receipt is confirmed only by a person, in the controlled end-to-end test.

**Mock mode:** `EMAIL_MODE=mock` is the default locally and in tests. It writes the rendered message to a `mock_mailbox` table and makes no network call. The adapter is injectable, so tests can simulate a timeout, 5xx, 409 or 429 and then a replayed 2xx. *(Changed at checkpoint 3: no `mock_mailbox` table and no `EMAIL_MODE=mock`. A D1 mailbox would store customer links in the database. Tests inject an in-memory provider instead; see §18, checkpoint 3.)*

## 8. Simulated checkout and the demo code

**The demo code is only a presentation interaction.** It is not authentication or authorization, not payment verification, and not evidence of anything. It exists so the demonstration feels like a checkout step without asking for anything real.

**Field:**
- appears only on `/quote/` after the quotation is `accepted`
- label "Demo code"; never named or described as a bank account number, card number, PIN, OTP, password or CVV
- persistent notice: "Do not enter real financial information."
- markup: `type="text"`, `inputmode="numeric"`, `autocomplete="off"`, `spellcheck="false"`, `maxlength="8"`, **no `name` attribute**, and not inside any submitting `<form>`
- a "Use sample code" button fills `12345678`

**Local check only:**
- the browser compares the value exactly to `12345678`
- any other value shows "That is not the demo code. Use the sample code 12345678." with `aria-invalid`
- the field is cleared after a successful check, and on Back, Start over, leaving the step and `pagehide`
- the value is never sent, stored, logged or put in a URL

**Backend independence:**
- `POST /api/quote/simulate` receives only `{ token, method: 'card'|'bank', outcome: 'success'|'failure'|'cancelled' }`. It does not know whether a demo code was entered and does not care.
- It requires a valid, unexpired, unrevoked token for a quotation in `accepted`.
- It writes only `simulated_checkouts(id, quote_id, method, outcome, created_at, simulated INTEGER NOT NULL CHECK (simulated=1))`, a table with no amount-paid, payer, card or bank columns.
- It **never changes the quotation's status**: there is no "paid" state.
- A curl call that skips the UI can, at most, add a row labelled simulated to an accepted quotation.

**Copy:**
- every result shows "Simulated—no money moved. Not a payment receipt." verbatim, from the existing `resultDisclaimer` constant
- method labels per the proposed default in §11
- no provider, real financial-data fields, payment instructions, QR codes or uploads

**`/payment-demo/` is unchanged.**

## 9. Data model (D1, `migrations/0001_quotation.sql`)

- `quote_requests(id, ref UNIQUE, submission_id UNIQUE NULL, dedupe_key NULL, payload_hash, hash_key_version, source: js|native, status, created_at, service, plan, name, email, organization, phone, organization_type, project_need, message, privacy_ack_version, flagged)`
- `quotes(id, request_id, ref UNIQUE, status, version, scope_text, amount_centavos CHECK(>0), currency CHECK(='PHP'), validity_days, approval_id, link_key_version, link_generation, token_hash UNIQUE NULL, expires_at, snapshot columns, approved_at, approved_by, emailed_at, accepted_at, declined_at, revoked_at, created_at, updated_at)`
- `quote_events`, `email_jobs` (§7), `simulated_checkouts` (§8), `confirm_nonces(nonce_hash, quote_id, version, action, expires_at, used_at)`, `client_counters(key_hash, bucket, count, created_at)` and `mock_mailbox` (local and test only)

References look like `BT-R-2026-0001` and `BT-Q-2026-0001`. They appear on pages and in emails, never in URLs.

## 10. Tests

**Unit (existing Vitest, no new dependencies):**
- state transitions
- server validation (reusing the inquiry cases)
- amounts
- token derivation: the same inputs give the same token, a new generation gives a different token, and the hash matches
- fragment parsing
- JWT verification with locally generated RS256 keys: wrong AUD, issuer, expiry, email or signature
- escaping, and an owner notification that carries no personal data
- job scheduler and backoff, the 20-hour cut-off, response classification, and the ambiguous → replay → accepted path
- the demo-code check

**Worker integration (local):** run `npx wrangler@<pinned> dev --local` for both Workers against local D1, with `EMAIL_MODE=mock` and the injectable failure adapter. A Node script in `tests/worker/` covers:
- intake by JSON and by native form
- the honeypot, counters, `submission_id` idempotency and no-JS de-duplication
- owner routes with no JWT, a forged JWT and a test JWT
- two approvals at once, which create exactly one job
- two runners at once, which make exactly one provider call
- a GET to every route changes no rows
- expired, revoked and regenerated links
- simulate without an accepted quote is rejected
- the purge job

**Browser (existing headless harness, off-origin requests blocked):**
- With the flag off, every existing page is byte-identical and Formspree is used for all types.
- With the flag on:
  - Contact sends quotations to the backend and demo/service to the mocked Formspree.
  - Contact has no quotation option, its link card works without JS, legacy `?type=quotation` links redirect with JS, and every quotation CTA lands on `/contact/quotation/` with its preselection.
  - `/contact/quotation/` works without JS.
  - Owner confirmation: Cancel sends nothing.
  - `/quote/` strips the fragment, survives a reload in the same tab, and handles accept, decline and a repeat click.
- Checkout:
  - a wrong code shows the error
  - "Use sample code" works
  - an interceptor asserts that no request URL, header or body contains `12345678`
  - the field is empty after Back, Start over and reload
- 320 px / 32 px layouts, keyboard paths, and `/payment-demo/` regressions.

**Static checks:** `npm run check`, `npm test`, `npm run build`, `npm run test:browser` and `check:release`. `tests/hosting.test.ts` stays unchanged, because the production config remains assets-only until cutover.

**Controlled end-to-end** (separately authorized; owner-controlled mailboxes only):
1. Deploy a preview with the owner Worker under Access.
2. Submit one labelled "E2E TEST" request, once with JS and once without.
3. Confirm the owner notification arrives.
4. Approve with confirmation.
5. Confirm the email arrives in the owner-controlled "customer" inbox, checking spam too; this is the human receipt check.
6. Confirm the link opens and its URL holds no personal data.
7. Accept, then run each simulated outcome.
8. Revoke the link and confirm it stops working.
9. Delete the test records.

Record date and pass/fail only. `delivered@resend.dev` and `bounced@resend.dev` can rehearse the API paths first.

## 11. Defaults (retention, expiry and bank label approved 2026-10-16; privacy wording still draft)

| Default | Proposal |
|---|---|
| Retention | Delete requests, quotes, events, jobs and simulated checkouts 90 days after last activity (implemented on the owner Worker's 5-minute cron in bounded batches; §18 "Local completion"). The owner page also has "Delete request". Client counters are purged after 48 h. |
| Link and quotation expiry | 14 days from approval (owner may set 1–30). |
| Quotation privacy wording | "I understand my details will be stored by BuildTrack on Cloudflare and used to prepare and email a quotation through Resend, an email service. BuildTrack deletes its quotation records 90 days after the last activity; the email service keeps copies of sent emails for a period it sets." Shown with the existing draft marker until approved. Demo/service keep the current Formspree text. |
| Bank-transfer label | Neutral "Bank transfer (simulated)", with no bank name, logo, account details or instructions. "Card (simulated)" for cards. |

Related copy changes (wording also subject to approval):
- `src/lib/disclosures.ts` gains "Quotation requests are stored and quotations are emailed for real; any checkout is simulated and no money moves."
- The `/payment-demo/` line, Contact's "Do not enter payment or card details" and "A request is not a payment, booking or subscription" stay as they are.
- The quotation email states that BuildTrack is an academic project and that no payment is due.

## 12. Cost estimates (not guaranteed; vendors set and change these)

| Item | Estimate | Limits / caveats | Unresolved setup |
|---|---|---|---|
| Sending domain | **US$0** if the owner already controls a domain (only DNS records are added). Otherwise a new .com is **estimated** at about US$10.11–10.46 for the first year via Cloudflare Registrar, which says it charges at cost. That figure comes from third-party 2026 readings and is not a quote. Registry fees change, so neither the purchase price nor any renewal amount is guaranteed; the actual price shows only at checkout. Other registrars often discount the first year and renew higher. | Needs DNS access to add the Resend records. | Who owns and pays for the domain; a payment method. **No purchase is authorized.** |
| Resend | **US$0** on the free plan | 3,000 emails/month, 100/day, 3 domains, 30-day logs, 1 webhook. Pro is US$20/month for 50,000. | Account under the owner's email; domain verification; API key restricted to sending. |
| Cloudflare Workers (2 Workers) | **US$0** on Workers Free | 100,000 requests/day, 10 ms CPU per request and per cron run, 5 cron triggers per account (1 used), 100 Workers. Requests for static assets are free. If CPU limits were ever exceeded, Workers Paid is US$5/month. | None beyond the existing account; a second Workers Builds connection. |
| Cloudflare D1 | **US$0** on the free plan | 5 M rows read/day, 100 k rows written/day, 5 GB. | Create the database. |
| Cloudflare Access | **Unresolved** (expected US$0 for one owner) | Official account limits (developers.cloudflare.com/cloudflare-one/account-limits, read 2026-10-16) give 500 Access applications, 1,000 rules per application and 50 identity providers, but **state no Free-plan seat limit**. A "50 users free" figure appears only in Cloudflare's 2020 launch blog and in third-party 2026 sites; no current official pricing statement was found. | Zero Trust organization setup; seat terms and whether sign-up asks for a payment method are unverified until the owner sees the sign-up flow. |
| Alternative email: Cloudflare Email Service | US$5/month (Workers Paid) + domain | Beta; 3,000/month included, then US$0.35 per 1,000; the domain must use Cloudflare DNS. | Not proposed now. |

**Estimated total:** US$0 to roughly US$11 per year, depending on whether a domain must be bought, and subject to actual checkout and renewal prices. Usage-based items are free at academic volume under today's published limits, but that is not a promise.

## 13. External setup checklist (owner/human; nothing done)

1. **Domain for sending:** decide on an existing domain or buy one.
2. **Resend:**
   1. Create an account under Sunny's address.
   2. Add `mail.<domain>` and add the generated DNS records plus a DMARC TXT (`p=none` to start). Wait for "Verified".
   3. Create a sending-only API key and store it with `npx wrangler secret put RESEND_API_KEY` on the owner Worker only.
3. **Cloudflare Zero Trust:**
   1. Set up the organization and enable One-time PIN login.
   2. Enable Access on `buildtrack-owner` with All traffic and the policy "email equals Sunny's address".
   3. Record the team domain and AUD tag as owner-Worker vars.
4. **D1:** create the database (`npx wrangler d1 create buildtrack-quotes`). Put its id (not a secret) in both configs and apply migrations remotely as a recorded manual step.
5. **Secrets and vars:**
   - Generate `QUOTE_LINK_KEY_V1` (32 CSPRNG bytes, base64) as an owner-Worker secret and set `QUOTE_LINK_KEY_CURRENT=1`.
   - Set the vars `OWNER_EMAIL`, `PUBLIC_BASE_URL`, `MAIL_FROM` and `EMAIL_MODE`.
   - *(Added at checkpoint 2.)* Owner Worker: generate `OWNER_FORM_KEY` (32 CSPRNG bytes, base64) as a secret, and set the vars `OWNER_ORIGIN`, `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD`.
   - *(Added at checkpoint 3.)* Owner Worker sending: `SENDING_ENABLED=on` (only after the customer routes are reviewed), `EMAIL_MODE=resend`, `MAIL_FROM` on the verified sending domain, `PUBLIC_ORIGIN` (HTTPS, used instead of `PUBLIC_BASE_URL`) and the secret `RESEND_API_KEY`.
6. **Workers Builds:** connect a second project for `owner/` with watch paths.

## 14. Migration and preservation

- **Flag off:** each checkpoint ships with the flags off. **Production `wrangler.jsonc` stays assets-only until a separately authorized cutover**, because adding `main` and a D1 binding before a real database exists would make the next Workers Builds deploy fail. Local work uses `wrangler.workflow.jsonc`, which nothing deploys. At cutover, `/api/*` becomes the only path that runs the Worker first. Proof at each checkpoint: a flag-off build compared file by file with a baseline build.
- **Additive:** migrations are additive. The owner Worker is new and touches nothing public.
- **Rollback:** turn off the client flag (rebuild) or the Worker vars (instant). Removing `main` from the public `wrangler.jsonc` restores today's assets-only Worker.

## 15. Checkpoints (each stops for review)

| # | Scope | Evidence |
|---|---|---|
| 0 | Approve this design and the §11 defaults; ADR-043 detail; update local CLAUDE.md | Docs |
| 1 | Public Worker skeleton (`/api/*` only) and owner Worker skeleton with JWT gate | Byte-identical pages; forged/missing JWT → 404 |
| 2 | D1 schema; intake by JSON and native form; `/contact/quotation/`; Contact link card, legacy redirect and `contactHref` switch behind the flag | Unit, worker and browser tests with the flag on and off |
| 3 | Owner pages: review, edit, confirmation, approve, revoke, delete | Concurrent approve → one job |
| 4 | Email jobs, Resend adapter (mock default), cron | Injected ambiguous/429/4xx; 20 h cut-off; one provider call under concurrency |
| 5 | `/quote/` view, accept and decline | Fragment never in requests; expired/revoked/GET-only |
| 6 | Simulated checkout | Code never leaves the page; disclaimer verbatim; no status change |
| 7 | Approved wording, retention, docs | Copy review |
| 8 | Codex review → external setup → controlled E2E → production decision | E2E record |

## 16. Origin and CSRF protection (revision 3)

**Owner mutations** (owner Worker; approve, save draft, revoke, resend, delete, dismiss). These requests carry Access's `CF_Authorization` cookie, so they need CSRF defences. All of the following must hold:
1. **POST only.** GET and HEAD are read-only, and other methods get 405.
2. **`Origin` equals exactly `https://buildtrack-owner.sunnydelacruz.workers.dev`.** A missing `Origin` is rejected; modern browsers send it on form POSTs. `Sec-Fetch-Site`, when present, must be `same-origin`.
3. **Content type:** `application/x-www-form-urlencoded`. Each request carries its exact field set.
4. **Single-use confirmation nonce.** Each review or confirmation page embeds a fresh 32-byte random nonce in a hidden field. D1 stores only its SHA-256, bound to (owner email, action, quote id, quote `version`) and expiring after 10 minutes. It is consumed **inside the same `batch()`** as the mutation (§7), so a replayed or cross-site request has no valid nonce and changes nothing.
5. **Valid Access JWT** with the owner email, verified on every request (§2.1).
6. **No CORS** headers on any owner response, plus `frame-ancestors 'none'` and `X-Frame-Options: DENY` against clickjacking. The two-step confirmation page is a second click target.

**Customer actions** (public Worker; view, accept, decline, simulate):
- **No ambient credentials:** there are no cookies or sessions. The bearer token in the JSON body is the only authorization, and a cross-site attacker does not know it. Classic CSRF therefore has no foothold. The controls still applied:
  1. **POST with `Content-Type: application/json` only.** Anything else gets 415. A cross-origin page cannot send JSON without a CORS preflight, and the Worker answers no preflight and sends no `Access-Control-Allow-*` headers, so the browser blocks it.
  2. **`Origin` equals exactly `https://buildtrack.sunnydelacruz.workers.dev`,** and `Sec-Fetch-Site` must be `same-origin` when present. Missing or other values get 403.
  3. **Accept and decline** need the in-page confirmation dialog and a conditional update (§5). Simulate needs an `accepted` quote.
  4. **Rate limit:** the per-client counter (30 per hour) applies.

**Quotation intake** (`/api/quotation-requests`):
- Native form-encoded or JSON bodies only.
- The same exact-`Origin` rule (form posts from other sites are rejected).
- Honeypot and counters.
- An intake creates only a `received` request and an owner-notification job. It never emails the customer.

## 17. Deletion and retention boundaries (revision 3)

**What the application deletes (D1):**
- **One request (owner "Delete request", or the retention cron):** a single `batch()` deletes, for that request, its `simulated_checkouts`, `quote_events`, `confirm_nonces`, unsent `email_jobs` (with any `mock_mailbox` rows), `quotes`, then `quote_requests`.
- **Explicit deletes:** these are not left to foreign-key cascades.
- **Links die:** deleting the quote removes its `token_hash`, so the link stops working at once.
- **In-flight send:** if a job is `sending` with a live lease, the delete is refused with "A send is in progress; try again in 2 minutes". This prevents an email going out after deletion.
- **Sent-job rows** for the request are deleted with everything else. Only provider-side copies (below) remain.
- **Retention cron (proposed 90 days after last activity; §11):** removes whole requests the same way, in bounded batches per run to stay within Free CPU limits.
- **Other housekeeping:**
  - client counters after 48 h
  - used or expired nonces after 1 day
  - `mock_mailbox` never exists in production

**What the application does not control (stated, not implied):**
- **D1 Time Travel:** always on, and cannot be disabled according to the docs. The database can be restored to any point in the last 7 days on Workers Free, so deleted rows stay recoverable by the account owner through a whole-database restore for up to 7 days. They are not visible to the application.
- **Resend:** keeps sent-email records, including the recipient address and content with the link, under its own retention and terms. The free plan's published log retention is 30 days. I found no documented API to delete an already-sent email; the cancel endpoint applies only to scheduled emails. Earlier deletion would be a request to Resend, outside the app.
- **Recipients' mailboxes:** the owner's and customer's copies of emails are outside the app.
- **Workers Logs:** if enabled, retained 3 days on Free, and contains no personal data under §4's logging rules.
- **Formspree:** demo and service requests, plus any pre-switch quotations, stay in Formspree's archive under its terms (30-day archive on the free plan, as published). The owner can delete them in the Formspree dashboard.
- **Wording:** the privacy wording (§11) says records are deleted by BuildTrack after the retention period, and that the email service keeps copies of sent emails for a period it sets. It does not promise deletion that the app cannot perform.

## 18. Implementation record

### Contradictions resolved before coding (2026-10-16)
1. **Deploy safety.** Putting `main` and a D1 binding into the production `wrangler.jsonc` would break the next Workers Builds deploy, because no real database id exists. The production config therefore stays unchanged, and `wrangler.workflow.jsonc` is used locally only (§14).
2. **Flag mechanism.** `quotationWorkflow.enabled` is a committed `false` constant in `src/config/quotation.ts`. Test builds swap in `tests/browser/fixtures/quotation-enabled.ts`, following the existing fixture pattern, so no environment variable can turn the workflow on in a production build.
3. **Counter salt.** §4 called for a salted daily hash of the client address but named no salt source. Checkpoint 1 stored a random daily salt beside the hashes. **Superseded by the repairs below:** that salt let anyone holding the database recover addresses, and nothing deleted it.
4. **Contact allowlist.** Contact no longer renders the quotation type, and the endpoint fixes the type as `quotation`. The shared client validator is unchanged.
5. **D1 parameters.** D1 uses ordered `?NNN` parameters, not `:name`; the code writes §7's SQL that way. Numbers whose text form matters (the reference year) are bound as text and cast in SQL, because drivers may bind JS numbers as REAL.
6. **Rate counting.** Refused attempts also count toward the daily limit (the conservative choice).

### Checkpoint 1: request storage and server-side validation (2026-10-16, local, uncommitted)
- **Public Worker** (`worker/public/`): `POST /api/quotation-requests` accepts the page's JSON or a native form post.
  - **Fails closed:** returns 503 unless `WORKFLOW_ENABLED=on`, `PUBLIC_ORIGIN` and the D1 binding are all present.
  - **Request checks:**
    - POST only, with an exact `Origin`; `Sec-Fetch-Site` must be same-origin when sent.
    - JSON or form-encoded bodies only, valid UTF-8, with a streamed size cap (8 KB in checkpoint 1; derived from the field limits since the repairs).
    - Unknown, repeated, non-string or NUL-containing fields are rejected.
  - **Validation:** reuses `validateInquiry`. A filled honeypot looks accepted but stores nothing.
  - **Limits:**
    - 5 requests per client per hour and 20 per day.
    - 30 owner notifications per day; requests beyond that are stored and flagged.
  - **Response headers:** every response is `no-store`, `noindex` and `nosniff`, cannot be framed and sends no CORS headers. Native pages use `default-src 'none'`.
  - **Logging:** one logger with typed keys; a test bans `console.*` everywhere else.
- **Storage** (`migrations/0001_quotation_intake.sql`): the tables were `quote_requests`, `email_jobs`, `client_counters` and `daily_salts` (the last removed by the repairs).
  - One D1 batch inserts the request and queues its owner-notification job (key `bt-r-<id>-n0`). Nothing is sent.
  - A JSON retry with the same `submission_id` was de-duplicated, and so was a native resubmission with the same email, organization and project need within 30 minutes (replaced by the repairs).
  - References follow `BT-R-YYYY-NNNN`, numbered sequentially per year.
- **Pages** (built only while the flag is on):
  - `/contact/quotation/` reuses `InquiryForm` with `variant="quotation"`. Without JS it posts natively; with JS it sends JSON with a `submission_id` generated per filled form. It shows the draft privacy wording, and the confirmation shows the reference.
  - Contact shows Demo and Service plus a "Request a quotation" link card.
  - Legacy `?type=quotation` links redirect with JS, keeping only allowlisted service and plan values.
  - `contactHref()` points every quotation CTA to the new page.
- **Flag off (committed state):** a file-by-file comparison with a baseline build found every page byte-identical except Contact.
  - Contact's HTML differs only in its asset links.
  - Its CSS gains two rules that match nothing while the flag is off (`.quotation-card` and `[data-columns='2']`).
  - Its script gains quotation code that stays inactive.
- **Not yet built:** the owner Worker, email sending, customer links, checkout and the retention purge (checkpoints 2–5).

### Checkpoint 1 review (2026-10-16)
A self-review found three Medium findings: IPv6 rotation bypassed the per-client limit and nothing capped total storage; daily salts stored beside the hashes made addresses recoverable and were never deleted; and the 8 KB cap refused valid no-JS payloads. It also found five Low findings: a missing IP header created a shared bucket; no-JS de-duplication by a subset of fields dropped corrections and could reveal another submission's reference; retries used fresh quota; repeated JSON keys were accepted; and origin refusals gave no guidance. Codex's independent review is still pending.

### Checkpoint 1 repairs (2026-10-16, local, uncommitted; awaiting Codex review)

**Order of work** (`worker/public/intake.ts`). Checks that need no database run first: configuration, method, origin, media type, streamed size, body contract, honeypot, validation and client identity. Then come one read for an earlier identical request, one read for the global cap, a conditional quota reservation, the insert (which re-checks duplicates and the cap), and a refund when no new row was created.

**Client identity and trust boundary** (`src/lib/quotation/client-identity.ts`):
- **Source:** only `CF-Connecting-IP` is read. Cloudflare's documentation says it carries the connecting client's address when a request reaches the Worker with no Worker subrequest in between. The documentation read does not say whether Cloudflare replaces a client-sent value on inbound requests. **That must be verified before the workflow is enabled.**
- **Local runs prove nothing about it:** `wrangler dev` fills the header with the socket address (127.0.0.1) when it is absent and passes client-sent values through, so production behaviour cannot be inferred locally.
- **Grouping:** IPv4 addresses are kept whole. IPv6 addresses are grouped by /64, and an IPv4-mapped IPv6 address counts as its IPv4 address. This is an abuse-control heuristic, not proof of one visitor (carrier-grade NAT shares IPv4 addresses; one subscriber may hold several /64s).
- **Missing or malformed header:** the request is refused with 503 "unidentified" before any database work, never placed in a shared bucket.

**Keyed hashes instead of salts** (`src/lib/quotation/intake-keys.ts`):
- **Key:** HMAC-SHA-256 with a dedicated Worker secret, `INTAKE_HMAC_KEY` (32+ bytes, base64), plus `INTAKE_HMAC_KEY_VERSION`. Every use carries a domain-separating label. Intake answers 503 without a valid key.
- **What gets hashed:**
  - client counter keys (rate-limit identity plus UTC day, so keys differ every day)
  - request payload hashes
  - no-JS de-duplication keys
  - each request's `client_hash` (rate-limit identity only, not per day; added by the retry repair, §18)
- **These are pseudonymous personal data:** anyone holding both the key and the database can test guesses. They are never logged.
- **`client_hash` makes stored requests linkable.** Every request from the same client identity (IPv4 address or IPv6 /64) under the same key version carries the same `client_hash`, for as long as the request is kept. Anyone with database access can group requests by submitting client without the key. Rotating the key stops new requests from linking to old ones; it does not unlink rows already stored.
- **Retention:** counters are deleted by an hourly scheduled cleanup (`scheduled` in `worker/public/index.ts`), 48 hours after creation, in bounded rounds of 500 rows. **Request retention deletion is not implemented.** Requests, with their `client_hash`, payload and de-duplication hashes, currently stay until deleted by hand; the 90-day purge comes with the later retention checkpoint and is an activation gate.
- **Rotation:** set a new secret and increment the version. Counters restart, and a JSON retry hashed under an older version gets 409.
- **Migration:** `daily_salts` is gone. Migration 0001 was revised in place, because it had only ever been applied to throwaway test databases.

**Limits** (`worker/public/store.ts`):
- **Per client:** 5 new requests per hour and 20 per day. *(First repair: increment-then-refund counters. Superseded by the second repair below.)*
- **Global:** 200 new requests per UTC day. *(First repair: a `COUNT(*)` scan per request. Superseded by the one-row daily total below.)*
- **Owner notifications:** the cap of 30 per day is unchanged (later requests are stored but flagged).
- **Refusal cost:** *(First repair: this claim left out reads and the 2–4 rows written per refusal; see the measured costs below.)*

**Body size** (`maxBodyBytes` in `src/lib/quotation/intake.ts`):
- **How the caps are derived:** every field's maximum characters × the worst encoding of one character, plus names, separators and quoting.
- **Form-encoded worst case:** a 3-byte UTF-8 character becomes 9 bytes, and a CRLF line break becomes 6.
- **JSON worst case:** every character escaped as `\uXXXX` is 6 bytes, and a CRLF line break escaped twice is 12. A 1 KB whitespace allowance covers pretty-printed JSON.
- **Resulting caps:** exactly 27,027 bytes for form posts and 37,519 bytes for JSON (`maxBodyBytes`), enforced while streaming.
- **Length checks:** line breaks are normalized to LF before length checks (a CRLF counts once, as the form's `maxlength` counts it). Untrimmed values must also fit their limit.
- **Oversize response:** 413 with an explanation ("Shorten your message").

**Body contract:**
- **JSON** must be one object of uniquely named string values, read by a small strict parser (`parseFlatJsonObject`) because `JSON.parse` silently keeps the last of repeated keys. JSON also requires a `submission_id`.
- **Both encodings** reject control characters other than tab, line feed and carriage return, and unpaired surrogates.

**Idempotency and de-duplication:**
- **JSON:** a repeated `submission_id` with an identical payload hash returns the earlier reference (200) without using quota, even when the client is at its limit. A changed payload under the same id gets 409 with no reference. Concurrent identical submissions store one row and refund the losers.
- **No-JS:** the de-duplication key covers the client identity and the full payload. Only an identical resubmission from the same client within 30 minutes is a duplicate, and the "already received" page does not repeat the reference. A corrected request, or a request from another client, is stored as new.

**Refusal guidance:**
- Origin refusals (403) explain that the request did not come from the form, mention strict privacy settings, and link to the form and the phone number.
- Size, format, capacity, rate and conflict refusals explain themselves.
- The page script shows the server's explanation as text.
- The origin checks themselves are unchanged.

**Network isolation, stated precisely:**
- **Browser:** in `npm run test:worker`, every browser request to anything but the local Worker is blocked and fails the run.
- **Tooling is not isolated:** Wrangler's metrics are disabled, but Wrangler still contacted the npm registry for its update check ("update available 4.151.0"). No Cloudflare account or credentials are used.
- **Correction:** earlier wording in this conversation that implied no requests left the machine was too broad.

**Local tooling observation:**
- **Proxy failure:** after the Worker answers 413 to a body still streaming without `Content-Length`, Wrangler's local dev proxy fails the next request it forwards ("Error inside ProxyWorker ... Network connection lost"). The Worker logs nothing, so this is not a Worker error.
- **Not mitigated in code:** draining oversize bodies would defeat the streamed cap.
- **Harness:** the test sends that request last.
- **Production:** Cloudflare's behaviour is unverified.

**Evidence:**
- `npm test`: 268 tests (simulated D1 on node:sqlite), including concurrency for identical retries, per-client limits and the global cap.
- `npm run test:worker`: 25/25 in three consecutive runs on the real local Workers runtime and D1. It covers:
  - the worst-case payload above 8 KB
  - repeated JSON keys
  - 409 on a changed payload
  - 10 concurrent identical retries using one quota slot
  - the concurrent per-client limit and IPv6 /64 grouping
  - corrected and duplicate no-JS requests
  - origin guidance
  - unusable header values
  - scheduled cleanup through Wrangler's scheduled endpoint
  - the global cap with concurrent requests at the boundary
  - the streamed 413
  - no addresses stored, and no personal data or key in the output
- **Not tested in the real runtime:** a missing header (Wrangler fills it in; it is unit-tested).

**Still required before enabling intake:**
- Verify Cloudflare's handling of a client-sent `CF-Connecting-IP`.
- Set `INTAKE_HMAC_KEY` as a secret.
- Owner approval of the privacy wording.
- The request-retention purge (later checkpoint).

### Checkpoint 1 second review (2026-10-16)
The second self-review found two Medium findings and four Low ones.
- **Medium:**
  - Refused traffic could use up D1's free quotas. After the cap, each refusal read 200 rows because of a `COUNT(*)` scan run before the per-client check, and each per-client refusal wrote 2–4 rows.
  - The global cap lets cheap address rotation close intake for the day.
- **Low:**
  - A failed save still consumed quota.
  - A local-config comment was wrong.
  - The message after a key rotation claimed the details had changed.
  - Some size and cost statements were imprecise.

It also attributed the streamed-413 follow-up failure to Wrangler's dev proxy (see "Wrangler dev proxy" below).

### Checkpoint 1 second repairs (2026-10-16, local, uncommitted; awaiting Codex's independent review)

**One-row daily total instead of scans.** `intake_daily(day, requests, notifications, cap_reached_at, last_attempt, created_at)` replaces both the `COUNT(*)` over today's requests and the notification count.

**Refusals before writes.** After the identical-retry lookup (one indexed read), `readQuota` reads three rows by primary key: the client's day and hour counters, then the daily total. The client's limits are checked before the global cap. A visitor already at a limit, or any request after the cap, is refused with no writes.

**One atomic batch for everything else** (`storeRequest`, `worker/public/store.ts`). D1 `batch()` runs its statements in order and rolls back entirely if one fails. The batch:
1. Reserves the client's day slot, then hour slot, then the global slot. Each is a conditional upsert that writes this attempt's id to `last_attempt`, and each runs only if the previous reservation's marker is present.
2. Stores the request if the global reservation succeeded and no duplicate exists.
3. Counts the notification and queues the job, unless the notification cap flags the request.
4. Undoes this attempt's reservations only if its request row was not created. That happens only in races between the pre-check and the batch, so ordinary refusals never cause increment/refund churn.
5. Reports which step decided the outcome.

A failed batch leaves no quota consumed and no partial rows (forced failure in the real local runtime and in the simulation). The global cap is still a hard ceiling under concurrency.

**Measured D1 cost per outcome.** These are the local Workers runtime's own D1 `rows_read`/`rows_written` metadata, asserted in `npm run test:worker` by a test-only wrapper Worker (`tests/worker/d1-cost-worker.ts`):

| Outcome | Rows read | Rows written | Statements |
|---|---|---|---|
| Accepted new request | 27 | 22 | 11 |
| Identical JSON retry | 1 | 0 | 1 |
| Refused: client at its limit | 3 | 0 | 2 |
| Refused: validation (and honeypot, origin, size, shape, identity) | 0 | 0 | 0 |
| Refused: daily cap reached | 1 | 0 | 2 |
| Failed save (forced failure inside the batch) | 1 visible | 0 visible | 2 |

These are local measurements of the same metrics D1 bills. Production accounting was not measured. For the failed batch, D1 returns no metadata, so only the pre-check reads are visible; whether Cloudflare bills reads or writes for a rolled-back batch is unverified.

**What the costs mean (this does not claim immunity).** Refusals are now cheap but not free: every request reaching `/api/*` is still a Worker invocation (Workers Free: 100,000 per day), and an ordinary refusal costs up to a few reads (race losers that reach the batch cost more; see "Costs and quotas, corrected").
- *(Withdrawn after Codex review: the comparison of D1 read exhaustion with the Worker invocation limit. See "Costs and quotas, corrected" below.)*
- *(Withdrawn after Codex review: the claim that Worker invocations are necessarily exhausted before D1 quotas.)*
- **Storage:** bounded by the global cap (200 requests per day, about 22 rows written each).

**Global cap kept as a safety ceiling.** It still converts a cheap flood of rotating addresses into a day without intake (second review M2). Mitigation before activation: Turnstile (plan below) and the owner warning (design below).

**Turnstile activation plan (not implemented; no account or widget created).** Official documentation read 2026-10-16:
- Server-side validation: `POST https://challenges.cloudflare.com/turnstile/v0/siteverify` with `secret`, `response`, optional `remoteip` and `idempotency_key`.
- Tokens: valid 300 seconds and single-use (a replay fails with `timeout-or-duplicate`).
- Response fields: `success`, `hostname`, `action`, `cdata` and `error-codes`.
- Accessibility: Cloudflare states WCAG 2.1 AA conformance.

1. **Where it runs:** after the database-free checks (origin, size, shape, honeypot, validation, identity) and before any D1 access, including the identical-retry lookup. Unverified traffic then never touches D1.
2. **Verification rules:**
   - Accept only `success: true` with `hostname` equal to the public host and `action` equal to `quotation-request`.
   - *(Corrected after Codex review.)* Submission idempotency (`submission_id`, our own) and Siteverify retry keys are separate: each verification attempt gets its own fresh UUID as `idempotency_key`, reused only when the Worker itself retries that same Siteverify call after a network error. How Siteverify treats a repeated key (for example its window, or a key whose first call succeeded) is not documented in what was read and stays unresolved.
   - Time out after 5 seconds.
   - The secret is a Worker secret (`TURNSTILE_SECRET_KEY`); the site key is public config.
3. **Failure handling, failing closed:**
   - An invalid or expired token gets 403 with "Complete the check again".
   - A duplicate token gets 403 with a reset.
   - A network error, timeout, `internal-error` or an unexpected response gets 503 "Can't verify right now — try again or call BuildTrack", with nothing stored.
   - A missing or invalid secret makes the intake answer 503, like the HMAC key.
4. **Page script:**
   - The widget is rendered explicitly on `/contact/quotation/` with action `quotation-request`.
   - Submit stays disabled until a token exists.
   - The widget is reset after every attempt (tokens are single-use), so a retry after a timeout uses a fresh token. The server's identical-payload idempotency still prevents a second stored request.
   - Error, expired and timeout callbacks are announced in the existing error summary.
   - The widget lives in a labelled region with keyboard focus order intact. Its failure text says how to call.
5. **No JavaScript:**
   - The Turnstile widget needs JavaScript, and no documented no-JS path exists.
   - With Turnstile enabled, the native no-JS post cannot be verified. It is refused before any database work with a page offering the phone number and the advice to enable JavaScript, and the quotation page's `<noscript>` text says so up front.
   - There is no unprotected fallback endpoint.
   - **Accepted change:** activating Turnstile ends no-JS quotation intake (it was added in checkpoint 1) and needs your approval.
6. **Owner setup:**
   - Create a widget for the production hostname. Whether a `workers.dev` hostname can be added is unverified.
   - Store the secret and add the site key.
   - Add any CSP that is introduced for the Turnstile script and frame. The current site sets no CSP on pages, and the official CSP guidance could not be retrieved.
   - Update the privacy wording to mention Turnstile.
7. **Tests:**
   - siteverify mocked through an injectable fetch, covering success, invalid, duplicate, timeout, `internal-error`, hostname or action mismatch, and network failure
   - no D1 access on any failure (cost wrapper: 0 reads)
   - widget reset on retry
   - the no-JS refusal page
   - keyboard and screen-reader checks of the widget region (manual)

**Owner warning when the cap is reached (designed; data hook implemented).**
- **Hook:** `intake_daily.cap_reached_at` is set atomically, once per UTC day, by the batch whose reservation fills the cap. If a race undoes that reservation, the marker is cleared again. No write happens on later refusals.
- **When email delivery exists:** the owner Worker's scheduled run creates at most one `email_jobs` row of kind `owner_cap_warning` per day. Its idempotency key is `bt-cap-<day>`, so the UNIQUE constraint makes duplicates impossible.
- **Warning content:** the date, the cap, the time reached, and that requests were refused until 00:00 UTC. No personal data.
- **Owner page:** shows the same as a banner.
- **Volume:** never one email per refused request.
- **Data:** the job kind is already allowed by the schema. Daily totals are deleted after 8 days.

**Messages and comments.**
- A retry stored under an earlier key version now gets 409 `retry_expired`: "BuildTrack can no longer match this retry … request checks were updated". It no longer claims the details changed.
- The `wrangler.workflow.jsonc` comment now states that local `wrangler dev` fills `CF-Connecting-IP` with 127.0.0.1 and passes client-sent values through.

**Wrangler dev proxy (local tooling; recorded, not worked around in the Worker).**
- **Observed:** after the Worker answers 413 to a chunked body it has not read to the end, the next request forwarded by Wrangler's dev `ProxyWorker` fails ("Network connection lost"). That request never reaches the Worker.
- **Wrangler's own code expects this:** its `ProxyWorker.js` retries GET and HEAD after "a dropped connection to the UserWorker" but not POST. A GET after a streamed 413 logged "recovered on attempt 2".
- **What does and doesn't trigger it:** a declared oversize `Content-Length`, or a stream the Worker reads to the end, does not trigger it. Waiting 3 seconds or using a new client connection does not avoid it.
- **Without the proxy:** the same bundled Worker under Miniflare directly answered every following POST normally.
- **What stays:** the streamed body cap stays early by design. `npm run test:worker` sends that request last, which only works around the local tooling.
- **Production:** the edge's handling of an early response to an unfinished request body is unverified.
- **Also observed:** changing the local database schema from a separate `wrangler d1 execute` process under a running dev server broke that server's next request, so the test restarts the cost Worker around its schema change.

**IP-header trust boundary (unchanged; no speculative code).**
- **What official documentation shows:**
  - Transform Rules may remove but not modify `cf-connecting-ip`; a missing header makes the intake refuse.
  - The header is described as the address of the client connecting to Cloudflare.
- **Not found:** an explicit statement that a client-sent value is replaced on requests to a Worker.
- **Activation gate:** a controlled preview verification. A rate-limit result alone (for example, a sixth request refused despite different spoofed headers) is not definitive proof: buckets could be shared for other reasons. The verification must show directly whether the received value differs from the spoofed one, for example with a temporary preview-only diagnostic that reports only a boolean match and is removed before production.

**Evidence:**
- `npm test`: 273 tests (simulated D1). Includes: zero `total_changes()` for refusals at a limit or after the cap, rollback on a forced failure, daily-total consistency, the one-time cap marker, daily-total cleanup and the rotation message.
- `npm run test:worker`: 27/27, twice in a row (real local runtime). Includes the cost table above and forced-failure atomicity.
- `npm run test:browser`: 21/21 + 55/55.
- Flag-off build: unchanged from the previous round (only Contact assets differ from `HEAD`).

**Remaining activation gates:**
- Codex's independent review.
- Controlled preview verification of the IP header.
- Turnstile implementation and owner setup (approval needed for ending no-JS intake).
- Owner-warning email (with the email checkpoint).
- Production config: Worker script, D1, cron, logging and the HMAC secret.
- Request-retention cleanup.
- Privacy-wording approval, updated for Turnstile.

### Codex independent review (2026-10-16) and third repairs (local, uncommitted; awaiting a focused Codex recheck)

Codex reported four findings. Each is repaired, with a regression that fails against the defective behaviour.

**1. Reference allocation scanned history.**
- **Defect:** the full request `INSERT` read about 18,005 rows with 18,000 earlier requests, because `MAX(ref_seq) … WHERE ref_year = ?` is a range search over the year's requests (SQLite plan: `SEARCH … (ref_year=?)`), not a one-row seek. The standalone query looked harmless only in isolation.
- **Repair:** a per-year sequence row (`ref_sequences(year, last_seq, last_attempt)`) is taken by one primary-key upsert inside the same atomic batch, only for a request that will be stored. It is undone by the batch's compensation if the request is not stored, and rolled back with a failed batch.
- **Split lookups:** the duplicate check and the outcome lookup now use separate single-index lookups instead of one `OR` condition.
- **Regressions:**
  - `tests/quotation-store-plan.test.ts` fails on any scan or `ref_year` range search in the save batch.
  - The reference tests cover uniqueness under 12 concurrent saves, restart at 0001 in a new year, no number taken by a failed save, and continuation after 18,000 earlier requests.
  - `npm run test:worker` measures the full save on the real local runtime with 36,000 earlier requests.

**2. No-JS bodies were decoded leniently.**
- **Defect:** `URLSearchParams` silently kept malformed escapes and replaced invalid UTF-8.
- **Repair:** `parseFormEncoded` decodes strictly, before any intake value is built or the database is touched. `+` becomes a space and `%XX` a byte. A malformed or truncated escape, a raw non-ASCII byte, a pair without `=`, or percent-decoded bytes that are not valid UTF-8 (lone lead bytes, overlong forms, encoded surrogates) reject the whole body with 400.
- **Preserved:** valid percent-encoded Unicode is kept, and repeated names are detected after decoding (`na%6De` counts as `name`).
- **Regressions:** eight malformed bodies, each run with a deliberately broken database to prove nothing reached D1.

**3. The privacy acknowledgment accepted any nonempty value.**
- **Repair:** `validateIntake` requires exactly `yes`, before any database access. `no`, `false`, `YES`, `yes `, `on` and oversized values are refused (JSON 422, native 400) and nothing is recorded.

**4. Identical retries disclosed references across visitors.**
- **Repair:** each request stores `client_hash`, a keyed hash of the submitting client's identity. It is not per day, so a retry across midnight still matches.
- **Who gets the reference:** an identical retry under the same submission id returns the original reference only when the hashes match. Anyone else gets a reference-free acknowledgment (`{ status: "received", reference: null }`).
- **Cost:** in both cases, no new row and no quota.
- **After a key rotation:** a retry cannot be matched at all (409 `retry_expired`, no reference).
- **No-JS de-duplication** already keyed on the client, and its page never shows a reference.

**Costs and quotas, corrected.**
- **Accepted requests:** the cost is bounded but not constant.
  - Measured on the real local runtime: 31 rows read and 23 written in an empty database, and 33 read and 22 written with 36,000 earlier requests.
  - The small differences come from whether the day's and year's rows already exist and from index depth.
- **Refusals:**
  - Ordinary refusals write nothing: a client at its limit costs 3 reads; after the daily cap, 1 read; validation and the other checks without database access, 0.
  - **Race compensation does cost writes:** when concurrent requests pass the pre-check and then lose inside the batch, the batch reserves and undoes.
    - *(Corrected after Codex review: 24 reads and 2 writes was earlier called the "worst case". It is a sampled race result, not an upper bound.)*
    - Observed local results (real local Workers runtime, D1 `rows_read`/`rows_written`); none is an upper bound or a statement about production billing:

      | Source | Case | Rows read | Rows written |
      |---|---|---|---|
      | Codex's independent review (2026-10-16) | Race losers that reached the batch | 23–30 | 2–10 |
      | Codex's independent review (2026-10-16) | Forced reference-sequence refund | 26 | 12 |
      | Claude Code's `npm run test:worker` race scenario (6 identical retries plus a burst of 10 for one client), most expensive compensated loser per run | Race losers that reached the batch | 24 | 2 |

    - The Claude Code figure was the same in the checkpoint-1 repair runs and in each of three separate runs on 2026-10-16 after the BOM fix. That scenario samples whichever losers timing produces; it never forces a loser past more reservations, so it under-reports the range Codex observed.
    - Cost depends on how far a loser gets before it loses. Higher costs than any figure above are not ruled out.
    - Whether production D1 bills a compensated batch the same way (or a rolled-back one at all) was not measured.
- **Quotas:**
  - Which quota runs out first is not claimed. It depends on the traffic mix, on the account's other Workers and D1 use (owner Worker, cleanup), and on production accounting, which was not measured.
  - For this endpoint alone, the measured costs give per-request figures for ordinary refusals (at most 3 reads, no writes) and at most 200 accepted requests a day. Race losers that reach the batch are not covered by that figure (see above). None of this says which limit binds.

**Local tooling, recorded.**
- Opening the dev server's local database from a separate `wrangler d1 execute` process can drop that server's next forwarded request. The harness absorbs that with one GET, which Wrangler's proxy retries automatically.
- A schema change from outside is done only while the server is stopped.
- The streamed-413 proxy behaviour from the earlier review is unchanged.
- None of these local-tooling observations says anything about production.

**Evidence:**
- `npm test`: 302 tests in 16 files (simulated D1; query plans on SQLite).
- `npm run test:worker`: 29/29 three times in a row (real local runtime), including the cost table, the 36,000-row history measurement, race compensation and forced-failure atomicity.
- `npm run test:browser`: 21/21 + 55/55.
- `npm run check`: 0 errors.
- Flag-off build: unchanged.
- Production config: untouched.

**Activation gates (all still pending):**
- Controlled preview verification of the IP header (a rate-limit result alone is not proof).
- Turnstile, including your decision on ending no-JS intake.
- Owner-warning email.
- Production config.
- Request retention.
- Privacy-wording approval.
- *(Added at checkpoint 2.)* Real Cloudflare Access setup and a preview check of the owner Worker's JWT verification; review of checkpoint 2.

### Checkpoint 1 status (2026-10-16)
The reviewed checkpoint 1 implementation (intake, storage and server-side validation, with all review repairs above) is **complete as a disabled local foundation**. That means the code and tests are finished, the workflow stays disabled in committed config, production is unchanged, and every activation gate above stays pending.

### Checkpoint 2: owner review, draft editing, confirmation and approval (2026-10-16, local, uncommitted; awaiting independent review)

**Numbering.** The implementation checkpoints do not match §15's table one for one. Checkpoint 1 built intake (§15 row 2). Checkpoint 2 builds the owner Worker skeleton with its JWT gate (§15 row 1) and the review, edit, confirmation and approval part of §15 row 3.

**Scope, as authorized for checkpoint 2:**
- A protected owner page to review requests and edit a quotation's scope and amount.
- An explicit confirmation page before approval; approval and email-job creation in one atomic batch.
- Server-side authentication and authorization, plus stale and double-submit protection.
- Local authentication fixtures that cannot enable production access.
- No email sending.

**Deferred from §15 row 3 (not authorized in this step):** revoke, delete, dismiss and resend, and also the owner Worker's cron, the sender, customer links (`/quote/`) and retention.

**What was built:**
- **Owner Worker** (`worker/owner/`): `index.ts` (the deployable entry), `handler.ts` (checks and routes), `pages.ts` (server-rendered HTML, native forms, no script) and `store.ts` (D1). It runs locally only: `wrangler.owner.local.jsonc` is local, no Workers Builds project uses it, and production `wrangler.jsonc` is unchanged.
- **Routes:**
  - `GET /`: the newest 100 requests, with quotation status.
  - `GET /requests/<id>`: request details and the draft form. The amount is prefilled from the plan's proposed price in `src/config/pricing.ts` when one exists, and the note says so.
  - `POST /requests/<id>/draft`: saves the draft and redirects (303) to the confirmation page.
  - `GET /requests/<id>/confirm`: shows the exact recipient, request reference, scope, amount and validity. Its buttons are "Approve and queue email" and "Cancel and go back to the draft" (a link that sends nothing).
  - `POST /requests/<id>/approve`: approves and redirects (303) to the request page.
  - Other methods get 405; unknown paths get 404.
- **Order of checks** (`handler.ts`):
  1. Configuration: `WORKFLOW_ENABLED=on`, D1, `OWNER_ORIGIN`, `OWNER_EMAIL`, a valid `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`, `OWNER_FORM_KEY` and the current link key. Otherwise 503.
  2. The Access JWT: anything but a valid owner token gets 404.
  3. Route and method.
- **Every POST also needs:**
  - the exact `Origin`, plus `Sec-Fetch-Site: same-origin` when sent;
  - a form-encoded body under 32 KB, decoded strictly (the intake's parser), with exactly the expected fields;
  - a valid form token.
- **Access JWT** (`src/lib/quotation/access-jwt.ts`):
  - RS256 only, verified with WebCrypto against the key whose `kid` matches. Keys come from `https://<team>.cloudflareaccess.com/cdn-cgi/access/certs`, cached 5 minutes per instance, and an unknown `kid` refetches at most once a minute.
  - Issuer `https://<team domain>`; the audience includes `ACCESS_AUD`; `exp` must be in the future; `nbf` may be at most 60 seconds ahead.
  - The `email` must equal `OWNER_EMAIL`, compared without case. A service token (no email) is refused.
  - The team domain must match `<name>.cloudflareaccess.com`, so keys are never fetched from anywhere else.
- **Data** (`migrations/0002_quotation_owner.sql`, additive; 0001 unchanged):
  - `quotes`: one per request.
  - `quote_ref_sequences`: `BT-Q-YYYY-NNNN` references.
  - `quote_events`: created, saved and approved, by owner; no values.
  - `used_form_tokens`.
- **Values** (`src/lib/quotation/owner-form.ts`):
  - Scope: 10–2,000 characters, counted as SQLite counts them.
  - Amount: pesos with optional commas and centavos, ₱1–₱10,000,000, stored as integer centavos.
  - Validity: 1–30 days, default 14.
  - The schema's CHECK constraints repeat these limits.
- **Approval batch** (`approveQuote`, following §7):
  1. Record the form token as used.
  2. Update the quote only if it is still a `draft` at the confirmed version and the token row carries this attempt's id. That update sets `approved`, version+1, the link key version and generation, the customer-link `token_hash`, `expires_at` (now + validity), `approved_at`/`approved_by`, and the frozen snapshot (recipient name and email, scope, amount, validity).
  3. Insert one `quotation` email job (`queued`, key `bt-q-<quote id>-g<generation>-s0`).
  4. Insert one `approved` event.
  Statements 2–4 act only on rows marked with this attempt's id. Success means every statement changed exactly one row. A stale version, a second click or a replayed token changes nothing and gets 409.
- **Customer-link token** (`src/lib/quotation/quote-link.ts`): derived as §4 specifies, from `QUOTE_LINK_KEY_V<n>`. Only its SHA-256 is stored. No link is shown, emailed or served anywhere yet.
- **Email:** none sent. The job stays `queued`, with no attempts. The owner page states "No email has been sent. Email sending is not implemented in this build."

**Contradictions resolved while building (recorded for review):**
1. **GET pages were to be read-only, yet were to store a nonce on every page view (§2.1, §10 vs §16).**
   - Resolution: form tokens are signed instead of stored when issued: HMAC-SHA-256 with a new dedicated secret, `OWNER_FORM_KEY`, over (owner, action, target, version, 32-byte nonce, expiry), valid 10 minutes.
   - The change batch records the token's hash in `used_form_tokens`, which makes it single-use. GET pages therefore write nothing (verified on the real runtime).
   - A token whose batch found the quote changed stays used. A token refused before the batch (wrong Origin, for example) stays unused.
   - Expired rows need housekeeping, which comes with the retention checkpoint. These rows hold no personal data.
2. **`Referrer-Policy: no-referrer` (§2.1) conflicts with the exact-`Origin` rule (§16) for native form submissions.**
   - Observed in headless Chromium 151: under `no-referrer`, the owner pages' native form submissions (navigations) carried `Origin: null`, so every owner POST was refused.
   - Owner pages and redirects now send `Referrer-Policy: same-origin`, which still sends no referrer to other sites.
   - *(Corrected after Codex's checkpoint-2 review.)* This observation covers native form navigation only. In Codex's independent Chromium tests, same-origin `fetch` POSTs under `no-referrer` kept their actual Origin. An earlier version of this record claimed that the planned `/quote/` shell's `fetch` API needed the same change. That claim was unsupported and is withdrawn. The `/quote/` policy (§4, "Private and uncached") stays as planned and undecided until it is tested in its own checkpoint.
3. **Code location.** The owner Worker lives in `worker/owner/`, next to `worker/public/`, instead of a top-level `owner/` directory (§2.1). A Workers Builds root directory is a deployment decision for the cutover.
4. **One quotation per request** (`UNIQUE(request_id)`). The request becomes `quoted` when its first draft is saved (§5's "owner creates quotation").
5. **New owner-Worker settings:** the vars `OWNER_ORIGIN`, `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD`, and the secret `OWNER_FORM_KEY` (added to §13).

**Codex checkpoint-2 review: `OWNER_ORIGIN` validation (repaired 2026-10-16).** `OWNER_ORIGIN` was only checked for being non-empty, so a malformed or non-canonical value still served owner pages and read D1.
- `validOwnerOrigin` (`worker/owner/handler.ts`) now requires one canonical serialized origin, exactly as browsers send it in `Origin`. The value must equal `new URL(value).origin`. That rejects:
  - credentials, any path (including a trailing `/`), a query or a fragment;
  - an uppercase scheme or host, an explicit default port, and surrounding whitespace;
  - `null`, malformed values and every scheme other than HTTPS.
- HTTP is accepted only for a loopback host (`127.0.0.1`, `[::1]`, `localhost`), for local tests. A deployment needs HTTPS. *(Superseded by the deployment-boundary repair below: the deployable entry now accepts HTTPS only.)*
- The check is part of the configuration step, before the JWT check, any route and any D1 access. An invalid value gets 503 for GET and POST alike.
- The exact-Origin comparison on POSTs, the JWT and the form token are unchanged.
- **Evidence:**
  - `npm test`: 358/358. The new tests cover 17 invalid values, each answering 503 to three GET routes and to both POST routes, whether the POST's Origin equals the invalid value or the old valid one. The tests count every D1 call (zero) and compare all tables before and after. Valid HTTPS, HTTPS with a port, and loopback HTTP origins are accepted, and the exact-Origin, JWT and form-token refusals still apply. All 17 invalid-value cases fail against the previous non-empty check.
  - `npm run test:worker:owner`: 16/16 in three consecutive runs plus one confirming run. On the real local runtime, `null`, a trailing slash, non-loopback HTTP and a path each give 503 for GET and POST, and D1 is unchanged.
  - `npm run check`: 0 errors.

**Codex checkpoint-2 recheck: deployment boundary for `OWNER_ORIGIN` (repaired 2026-10-16).** The previous rule also accepted loopback HTTP in the deployable entry. A deployed owner Worker configured with `http://localhost…`, `http://127.0.0.1…` or `http://[::1]…` would therefore have served owner pages and used D1, despite the "deployment needs HTTPS" intent.
- **Deployed rule, with no exception:** `validOwnerOrigin` (`worker/owner/handler.ts`) accepts only a canonical HTTPS origin. No environment variable or flag relaxes it.
- **Origin first:** the origin is now the first configuration check. An unacceptable value gets 503 before the form-key and link-key imports, the Access key lookup and any D1 access.
- **Loopback HTTP is confined to tests:** the allowance (`localLoopbackOrigin`) lives only in the test-only wrapper `tests/worker/owner-test-worker.ts`, which passes it to `handleOwner` as an optional check. The deployable entry (`worker/owner/index.ts`) passes none, so the HTTPS-only default applies. No production module imports the wrapper.
- **Evidence:**
  - `npm test`: 362/362, all three cases below included. The four new tests fail against the previous rule.
    - For each of `http://localhost:8788`, `http://127.0.0.1:8788` and `http://[::1]:8788`, GET and POST requests to the public HTTPS URL get 503, through `handleOwner` and through the deployable entry. That holds with the POST's Origin equal to the loopback value or to the HTTPS one. There are zero Access key lookups, no outbound certs fetch, zero D1 calls and unchanged tables.
    - The wrapper still serves loopback HTTP, with the exact-Origin, JWT and form-token checks intact. It serves nothing for a non-loopback request.
    - Another valid HTTPS origin works as before.
  - `npm run test:worker:owner`: 17/17 in three consecutive runs. It includes a new real-runtime check: the deployable entry is fully configured (all vars and keys, the seeded database) with `OWNER_ORIGIN` on loopback HTTP. GET and POST get 503 (not the 404 the Access check would give), and D1 is unchanged.
  - `npm run check`: 0 errors.

**Local authentication fixtures, and why they cannot enable production access:**
- The deployable entry (`worker/owner/index.ts`) always uses `accessKeySource(ACCESS_TEAM_DOMAIN)`. No variable, header or setting makes it trust any other key.
- The test key pair is generated in memory for each run (`tests/support/access-jwt.ts`). Only the test-only wrapper `tests/worker/owner-test-worker.ts` uses it. No repository wrangler config references that wrapper, and it serves nothing unless the request is addressed to `127.0.0.1`.
- A unit test runs the deployable entry with a token that is valid in every claim but signed by the local key. The entry fetches only `https://<team>.cloudflareaccess.com/cdn-cgi/access/certs`, and answers 404.
- On the real runtime, the deployable entry with the committed `wrangler.owner.local.jsonc` answers 503 to everything, including a test JWT.

**Evidence (Node 24.11.1; headless Chromium 151; wrangler 4.147.0):**
- `npm test`: 339/339 in 17 files. The owner suite has 34 tests on simulated D1. They cover:
  - JWT claims, forgery, algorithm, key and domain cases; the key source; and the deployable entry;
  - form-token binding, expiry and key;
  - amounts, scope and validity;
  - link-token derivation;
  - 404 without, or with a forged or other-owner, JWT;
  - 503 for each missing setting;
  - headers, methods, and no rows changed by any GET;
  - escaping;
  - draft creation, prefill and the confirmation details;
  - approval: snapshot, link hash, expiry, one job and events;
  - a second click, a replayed token and a stale confirmation page;
  - two concurrent approvals giving one job; two concurrent saves with one winner;
  - a resubmitted first-draft form;
  - field errors that save nothing;
  - cross-site, media-type, field-set, foreign-token, foreign-key and expired-token refusals;
  - logs with no personal data.
- `npm run test:worker:owner` (new): 15/15 in three consecutive runs on the real local Workers runtime and D1. It covers:
  - Access refusals;
  - headers;
  - in Chromium with native forms: the draft POST carries the owner Origin and lands on the confirmation page; Cancel sends nothing; the keyboard reaches every control with a visible outline; approval shows the queued, unsent state; no overflow at 390 px, or at 320 px with 32 px text;
  - concurrent approvals (one 303, one 409, then one job);
  - a stale confirmation page;
  - cross-site and malformed posts;
  - D1 state read back with the server stopped;
  - GETs changing no rows;
  - the committed local config refusing everything;
  - no off-origin browser requests;
  - no personal data, tokens or keys in the Worker's log lines.
  Wrangler's own startup banner prints configured vars, here the test values, truncated. That is local tooling output.
- `npm run test:worker` (intake, with migration 0002 applied): 30/30.
- `npm run check`: 0 errors. `npm run check:release`: passes.
- `npm run build`: every file byte-identical to the build before checkpoint 2.
- Production `wrangler.jsonc` and `tests/hosting.test.ts`: unchanged.
- Not run: `npm run test:browser`. No public page or site script changed; the identical build is the evidence.

**Not verified:** real Cloudflare Access, a real team's keys and JWT claims, and production D1 accounting for the owner batches. Other browsers, screen readers and real devices are also unverified.

### Checkpoint 2 status (2026-10-16)
Codex signed off on checkpoint 2 after its focused rechecks: the `OWNER_ORIGIN` validation, the referrer-policy record and the HTTPS-only deployment boundary. Checkpoint 2 is complete as a disabled local foundation.

### Checkpoint 3: durable email-job processing (2026-10-16, local, uncommitted; stopped for independent review)

**Scope, as authorized:** owner notifications, approved-quotation emails and one cap warning per UTC day, sent by a durable job runner with an injected mock transport. No provider request is made and no email is sent. Production sending fails closed without full configuration. Customer routes (`/quote/`) are not started.

**Provider behaviour, verified against Resend's official documentation (read 2026-10-16: Send Email, Idempotency Keys, Errors, Rate Limit):**
- **Request:** `POST https://api.resend.com/emails` with `Authorization: Bearer <key>` and a JSON body. `from`, `to` (up to 50) and `subject` are required. `text` and `html` are each optional.
- **Success:** the documented success body is `{ "id": "<uuid>" }`.
- **`Idempotency-Key` header:**
  - optional, 1–256 characters, "kept in the system for 24 hours";
  - a repeated key with the same payload returns "the same response, without actually sending the email again";
  - a different payload gets 409 `invalid_idempotent_request` ("Retrying this request is useless without changing the idempotency key or payload");
  - a key still in progress gets 409 `concurrent_idempotent_requests` ("safe to retry this request later");
  - an invalid key gets 400 `invalid_idempotency_key`.
- **Errors** (types listed with statuses):
  - 400 `validation_error`;
  - 401 `missing_api_key` and `restricted_api_key`;
  - 403: invalid or suspended key, an unverified domain, or testing-only recipients;
  - 409 `resource_locked`; 422 missing or invalid fields;
  - 429 `rate_limit_exceeded`, `daily_quota_exceeded` and `monthly_quota_exceeded`;
  - 500 `application_error`.
- **Rate limit:** "10 requests per second per team". A 429 carries the headers `ratelimit-limit`, `ratelimit-remaining`, `ratelimit-reset` and `retry-after` (seconds).

**Unresolved provider assumptions (documented, not guaranteed):**
1. **The success status code is not stated.** Any 2xx whose body has a string `id` counts as accepted. A 2xx without a readable `id` is treated as **ambiguous** and retried with the same key.
2. **The error body's JSON field names are not shown** in the error reference. The runner reads the type from `name`, then `type`. Without either, the status alone decides; an unrecognised 409 is ambiguous.
3. **Whether a failed (non-2xx) request is recorded under its idempotency key is not documented.** If it were, a retry could repeat the same failure until the cut-off. The job would then end as "Outcome unknown" for the owner, which is the safe side.
4. **When the 24-hour key period starts** (first request or acceptance) is not stated. The runner stops automatic attempts 20 hours after the **first attempt**, leaving a 4-hour margin either way.
5. **`resource_locked` (409) has no documented relevance to sending.** Like any unrecognised 409, it is treated as ambiguous.
6. **Daily and monthly quota 429s are retried on the normal backoff** (at most hourly) until the cut-off, and `retry-after` is honoured up to 1 hour. A quota that outlasts the window ends as "Not sent" for the owner.
7. **Delivery is unknown.** "Accepted by the provider" is not delivery. No webhook is used (deferred, §7).
8. **Workers limits for a scheduled run** (wall time while awaiting the provider, and CPU for the HMAC/SHA-256 work) were not measured in production. One run claims at most 10 jobs, makes at most 10 provider calls, and each call times out after 30 seconds.
9. **The mock provider imitates the documented behaviour; it is not the provider.** Nothing here proves how Resend behaves in production.

**What was built:**
- **Runner** (`worker/owner/sender.ts`): `runSender`. Each run:
  1. Queues at most one cap warning per UTC day, for today and yesterday only. It uses `INSERT … ON CONFLICT (idempotency_key) DO NOTHING` with key `bt-cap-<day>`, from `intake_daily.cap_reached_at`.
  2. Recovers expired leases: a `sending` job whose lease ended becomes `retry_wait`, marked ambiguous, due now.
  3. Moves `queued`/`retry_wait` jobs whose first attempt is 20 hours old to `needs_owner` (`E_WINDOW_CLOSED`).
  4. Claims up to 10 due jobs, one at a time, with a conditional `UPDATE … RETURNING`. The claim sets a fresh `lease_id` and a 2-minute `lease_until`, increments `attempts` and keeps `first_attempt_at`. Only one runner can win a job.
  Every later write for the job carries `AND lease_id = <mine>`. A runner that lost its lease changes nothing and logs `E_LEASE_LOST`.
- **Payloads** (`src/lib/quotation/email-templates.ts`, template `v1`, plain text, deterministic):
  - Owner notification: to `OWNER_EMAIL`, with the reference and the owner-page link only.
  - Cap warning: to `OWNER_EMAIL`; day and time only.
  - Quotation: to the approval snapshot's email, with the snapshot's name, scope, amount, expiry, the request and quotation references, the customer link, and the academic and no-payment statements.
  Subjects carry references and dates only; line breaks are removed.
- **Immutable snapshots:**
  - Migration `0003_quotation_email_jobs.sql` adds `to_address` and `template_version` to `email_jobs`.
  - The first attempt freezes `to_address`, `template_version` and `payload_sha256`. A later attempt whose rendered payload differs is not sent (`needs_owner`, `E_PAYLOAD_CHANGED`), as §7 requires.
  - Database triggers refuse any change to a job's identity (kind, request, quote, generation, resend number, idempotency key, creation time), to its frozen snapshot once set, and to its provider message id.
  - Triggers also refuse any change to an approved quotation's snapshot (recipient, scope, amount, validity, expiry, reference, approval time).
- **Stable keys:** owner notification `bt-r-<request id>-n0` (from intake), quotation `bt-q-<quote id>-g<generation>-s<resend>` (from approval), cap warning `bt-cap-<day>`. All are under 256 characters and never change (trigger).
- **Customer links** are rebuilt at send time from the quotation's recorded key version and generation (`QUOTE_LINK_KEY_V<n>`). Before sending, the rebuilt link's SHA-256 must equal the approved `token_hash`; otherwise nothing is sent (`E_LINK_MISMATCH`). A missing key gives `E_LINK_KEY_MISSING`. An expired quotation is not sent (`E_QUOTE_EXPIRED`). A changed generation or a quotation no longer open cancels the job. The link exists only in memory and in the message handed to the transport. It is never stored, logged or returned.
- **Outcomes** (`src/lib/quotation/email-transport.ts`, `classifyResend`):

  | Result | Job | Retry |
  |---|---|---|
  | 2xx with an `id` | `provider_accepted`, message id stored. For a quotation, the quote goes `approved`→`emailed` **in the same batch** (`emailed` means accepted by the provider). | none |
  | Timeout, network error, 5xx, 2xx without an `id`, 409 `concurrent_idempotent_requests` or unrecognised 409 | `retry_wait`, **ambiguous** | same key and payload |
  | 429 (rate or quota) | `retry_wait`, not ambiguous | same key; `retry-after` honoured up to 1 hour |
  | 409 `invalid_idempotent_request`, other 4xx | `needs_owner` | none |

  The backoff is 1, 5, 15 and 30 minutes, then hourly. An attempt that would fall after `first_attempt_at + 20 h` instead ends the job as `needs_owner`. That bounds automatic attempts to about 20–25.
- **Owner pages:**
  - Each quotation job shows a plain label: waiting; being sent; retrying (with "an earlier attempt may already have reached the email provider" when ambiguous); "Accepted by the email provider. This does not confirm that it reached the inbox."; "Not sent (reason)"; or "Outcome unknown: the email provider may have accepted it. Check the provider's dashboard before sending again."
  - The list page counts owner notifications and cap warnings that could not be sent.
- **Explicit resend outside the window** (§7):
  - "Send the quotation email again…" appears only when the latest quotation job is `needs_owner` and the quotation is still `approved` and unexpired.
  - Its confirmation page warns "The customer may receive two copies." when an earlier attempt was ambiguous.
  - The POST needs the exact owner Origin and a signed single-use form token bound to the latest job and the quotation version.
  - It creates one new job with the next resend number, hence a new key, for the same link and generation, in one batch. Nothing is ever resent automatically under a new key.
- **Fail-closed sending** (`worker/owner/scheduled.ts`; `scheduled` in `worker/owner/index.ts`):
  - A run happens only with all of: `WORKFLOW_ENABLED=on`, `SENDING_ENABLED=on`, canonical HTTPS `OWNER_ORIGIN` and `PUBLIC_ORIGIN`, D1, a valid `OWNER_EMAIL`, a one-line `MAIL_FROM` (`address` or `Name <address>`), the current link key, and a transport.
  - The deployable entry builds a transport only for `EMAIL_MODE=resend` with `RESEND_API_KEY`. It has no mock mode.
  - Otherwise the run logs `sending_unavailable` and reads nothing from D1.
  - `wrangler.owner.local.jsonc` gains the 5-minute cron and leaves sending off.
- **Logging:** fixed codes, job kind, attempt number and counts only. `last_result` stores only `E_…` codes or `OK_ACCEPTED`.

**Changes to the plan, recorded:**
- §7's `mock_mailbox` D1 table and `EMAIL_MODE=mock` are **not** used. A mock mailbox in D1 would store message bodies, including customer links, in the database, which §4 forbids. Tests inject an in-memory provider (`tests/support/mock-email.ts`) instead. The test-only wrapper uses it for the real-runtime run and reports only keys, recipients and link hashes.
- The public-site origin for links is the `PUBLIC_ORIGIN` var, the same name as the public Worker's, rather than §13's `PUBLIC_BASE_URL`.
- No `quote_events` row is written for a send. Migration 0002's event CHECK allows only created, saved and approved; the job rows record each send.

**Evidence (Node 24.11.1; wrangler 4.147.0; headless Chromium 151):**
- **`npm test`:** 405/405 in 18 files. The new email suite has 43 tests on simulated D1. They cover:
  - fail-closed sending for ten configuration gaps, with zero D1 calls and no transport calls;
  - the deployable entry: no mock mode and no transport without a Resend key; with full configuration, the documented Resend request shape (URL, method, Bearer key, `Idempotency-Key`, body fields) through a stubbed `fetch`;
  - the owner notification without customer details, and its frozen snapshot;
  - the quotation email: link rebuilt to the approved hash, quote `emailed`, owner page "not … inbox", and no token in D1 or logs;
  - one cap warning per day across concurrent runs (today and yesterday only);
  - three concurrent runners making one provider call per job;
  - a crashed runner: its lease expires; the provider answers "in progress" for the open key; the old runner wakes without its lease and changes nothing; the retry is accepted with one email in total;
  - a timeout after acceptance: ambiguous, retried with the same key and payload, one email;
  - a hung call aborted at the timeout;
  - retry exhaustion: about 20–25 attempts, never past the 20-hour cut-off, `needs_owner` with "Outcome unknown";
  - definite rejection versus rate limiting;
  - triggers refusing snapshot, key and hash changes;
  - changed content not sent;
  - a changed link key not sent; an expired quotation not sent;
  - resend: offered only when stopped; the duplicate warning; GET changes nothing; a confirmed POST creates one new key; a replayed token, a cross-site post, a forged token and a still-retrying job are refused;
  - redaction of logs and stored results;
  - `classifyResend` for 14 documented status/type cases, `retry-after` bounds, network errors, aborts and unreadable bodies.
- **`npm run test:worker:owner`:** 19/19 in three consecutive runs, plus one run after the local config gained its cron. New on the real local Workers runtime and D1:
  - two concurrent scheduled runs and a third: four due jobs (two quotations, one owner notification, one cap warning), each sent exactly once with a distinct key;
  - both quotations `emailed`, with rebuilt links whose hashes equal the approved `token_hash` values;
  - recipients from the snapshot and the owner address;
  - the triggers refuse snapshot and key changes on real D1 (`UPDATE … RETURNING` claims, batches and triggers all ran on real local D1).
- **`npm run test:worker`** (intake, with migrations 0002 and 0003): 30/30.
- **`npm run check`:** 0 errors. **`npm run check:release`:** passes.
- **`npm run build`:** byte-identical to the build before checkpoint 2.
- **Production config:** unchanged.

**Not verified:** any real provider behaviour, delivery, Resend's handling of the assumptions above, production D1 and Workers limits, and real Cloudflare Access.

**Activation gates added at checkpoint 3 (pending):**
- **No sending before the customer link works:** `SENDING_ENABLED` must stay off until the customer routes (`/quote/`) exist and are reviewed. Today the link in a quotation email would open a page that does not exist.
- **Sending account and setup:** a verified sending domain, a sending-only API key, and a controlled end-to-end test (§10) before any real email.

### Checkpoint 3 review repairs (2026-10-16, local, uncommitted; stopped for Codex's focused recheck)

Customer-route work stays paused, and the workflow and sending stay disabled.

**1. Send boundary.** A runner used one timestamp for its whole run and did not recheck after awaits. It could therefore start a send after the 20-hour deadline, after the quotation expired, or after losing its lease.
- **Clock:** the runner now reads a clock for every decision: claim, render, the boundary, and the outcome.
- **Before the call, in order:**
  1. **First check, on a freshly read clock:** the deadline (`first_attempt_at + 20 h`) and the quotation's expiry. If either has passed, the job goes to `needs_owner` and the provider is not called.
  2. **Durable mark:** "provider call started" (`email_attempts.provider_called_at`) is written only if this runner still holds the job with an unexpired lease *(corrected in the skipped-call pass below: this mark is now `send_intent_at`, and `provider_called_at` records only actual invocations)* (`lease_id` mine, status `sending`, `lease_until` > now). If not, the runner stops without calling the provider and changes nothing.
  3. **Final check, with no await before the call:** the clock is read again. The deadline, the expiry, and enough lease left for the whole call (now + 30 s timeout < `lease_until`) are rechecked, and then the transport is called.
- **Result:** a stale runner never knowingly starts a send.
- **Remaining gap, stated plainly:** a database check and an external HTTP request **cannot be one atomic step**. A runner can stall after its final check (for example, a paused isolate) and call the provider late. The provider's idempotency key stays the separate safeguard: the same key and payload within Resend's documented 24-hour period are not sent twice. The 20-hour cut-off and the lease margin keep any late call well inside that period.
- **Regressions** (`tests/quotation-email.test.ts`, a controlled clock and hooks inside the runner's awaits):
  - the deadline passing during rendering;
  - the quotation expiring during rendering;
  - the lease taken over by another runner, on a first attempt and on a retry (on a retry, the lease-checked mark is the only guard);
  - the lease expiring by the clock with no other runner;
  - the clock read again after the durable mark (deadline passed, and too little lease left).
  In every case no provider call is made. The retry-takeover and clock-expiry tests fail when the mark's lease condition is removed.

**2. Resend duplicate warning.** The warning looked only at the latest job, so after an ambiguous first send and a definitely rejected resend, the next confirmation dropped it.
- The risk is now computed from **all of the quotation's email jobs** (`duplicateRisk`: any ambiguous attempt under any key).
- Authorization still binds to the latest job and the quotation version.
- **Regression:** ambiguous first send → confirmed resend → new key rejected → another resend confirmation still shows "The customer may receive two copies."; the earlier confirmation's token is refused (403).

**3. Owner status wording.** The page showed "No email has been sent yet" even when an attempt might have reached the provider. One statement now covers all of the quotation's jobs (`emailSummary`), consistent with the per-job labels:
- never attempted: "No email has been sent yet: the quotation email is waiting in the queue." (plus "Quotation emails are held until the customer quotation page is ready." while readiness is off);
- attempted, none ambiguous, none accepted: "Not sent: the email provider has not accepted the quotation email.";
- any ambiguous attempt: "Unknown whether the customer received the quotation email: an attempt may have reached the email provider. Check the provider's dashboard.";
- accepted: "The email provider accepted the quotation email. That does not confirm that it reached the customer's inbox."
Provider acceptance is never called delivery. The regression walks one quotation through queued, not accepted, unknown and accepted.

**4. Scheduled configuration gate.** The scheduled run checked less than the owner pages did.
- `ownerConfigured` (`worker/owner/handler.ts`) is now shared by the pages and the scheduled run. It checks:
  - the origin first;
  - `WORKFLOW_ENABLED`, D1 and `OWNER_EMAIL`;
  - a valid `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD`;
  - an importable `OWNER_FORM_KEY` and the current link key.
- The run additionally needs `SENDING_ENABLED=on`, a valid `PUBLIC_ORIGIN`, `OWNER_EMAIL` and `MAIL_FROM`, and a transport.
- Everything is checked before any database access. The regressions add a missing `ACCESS_AUD`, an invalid `ACCESS_TEAM_DOMAIN`, and a missing or too-short `OWNER_FORM_KEY`. Each gives zero D1 calls, zero transport calls and an unchanged database.

**5. Attempt history** (migration `0004_email_attempts.sql`). `email_attempts` holds one row per claimed attempt:
- `id` (the attempt's lease id), `job_id`, `attempt` number, `started_at`, `provider_called_at`, `finished_at`, and `outcome` (`E_…` or `OK_ACCEPTED` only, enforced by CHECK);
- no recipient, content, link token or secret.
How it is written:
- The row is inserted **in the same batch as the claim**, so a runner that crashes right after claiming still leaves a record.
- The provider-call mark is written just before the call. *(Corrected below: that mark is the send intent; the call itself is recorded when the attempt is closed.)*
- The outcome is written in the same batch as the job's outcome.
- A crashed attempt is closed as `E_LEASE_EXPIRED` in the same batch that recovers its lease.
- History is kept across retries. **Retention follows the parent job:** a trigger deletes a job's attempts when the job is deleted, and job deletion comes with the request-retention checkpoint (§17).
The regressions:
- a crash, then "in progress", then acceptance gives three rows with codes and times only;
- the row's columns are exactly those listed;
- no addresses, names, subjects or keys appear;
- deleting the job deletes its attempts.
On real D1, four jobs give four `OK_ACCEPTED` attempts with the call marked, and deleting a job removes its attempt.

**6. Customer-route readiness.** `customerRoutes.ready` in `src/config/quotation.ts` is a **committed constant, default `false`**, not an environment variable.
- While it is false, quotation email jobs are **never claimed**. They stay queued with no attempt, so their 20-hour period does not start, whatever mail settings or credentials exist.
- Owner notifications and cap warnings are unaffected.
- Only the test-only wrapper and the unit tests opt in. The deployable entry always uses the constant.
- **Regression:** fully configured for Resend (fetch stubbed), the deployable entry sends the owner notification and makes no quotation request; the quotation job stays queued with zero attempts.
- **Activation gate, unchanged:** setting the constant to `true` requires the customer routes (`/quote/`) to exist and be verified first. Readiness is a reviewed code change, not configuration.

**Evidence (Node 24.11.1, wrangler 4.147.0, Chromium 151 headless; mocked transport only, no provider request):**
- `npm test`: 419/419, including 14 new tests.
- `npm run test:worker:owner`: 19/19 in three consecutive runs (real local Workers/D1, mocked provider), now including attempt history and its deletion with the job.
- `npm run test:worker`: 30/30 (migration 0004 applied).
- `npm run check`: 0 errors.
- Production config: unchanged.

### Checkpoint 3 skipped-call bookkeeping (2026-10-16, local, uncommitted; stopped for Codex's narrow recheck)

**Defect.** When the final pre-send checks (deadline, quotation expiry, too little lease left) prevented the transport call, the attempt had already been marked `provider_called_at`, as if the provider had been called. The deadline and expiry cases closed the attempt with that false mark. The too-little-lease case left the job `sending` until lease recovery, which then marked it **ambiguous**, so the owner later saw a false duplicate warning.

**Repair** (`worker/owner/sender.ts`; migration `0004_email_attempts.sql`, revised in place because it has only ever been applied to throwaway test databases):
- **Intent versus invocation.** `send_intent_at` is the durable, lease-checked mark written before the final checks: from that point the runner may call the provider. `provider_called_at` is now recorded only when an attempt is closed after the transport was actually invoked. A CHECK requires an intent for any recorded call.
- **Knowingly skipped calls are closed definitively.**
  - When a final check fails, the transport is not invoked. One batch, applied only while this runner still owns the job, writes the attempt record first (finished, outcome = the reason, no call recorded) and then the job.
  - The job's next state depends on the reason: deadline passed → `needs_owner` (`E_WINDOW_CLOSED`); quotation expired → `needs_owner` (`E_QUOTE_EXPIRED`); too little lease left → `retry_wait`, due again at once (`E_LEASE_TOO_SHORT`). The job is never left stranded in `sending`.
  - A skipped call adds no ambiguity, and any ambiguity from earlier real attempts is kept.
- **Ownership lost:** both statements in that batch require this runner's lease, so neither changes anything, and a newer runner's job state and attempt evidence stand. Attempt closures after a real call use the same ownership condition.
- **Lease recovery:**
  - A job becomes ambiguous only if its open attempt had recorded a send intent; that attempt is closed as `E_LEASE_EXPIRED`.
  - An attempt that crashed before its intent is closed as `E_LEASE_EXPIRED_BEFORE_SEND`, and the job's ambiguity is left unchanged (it was certainly not sent by that attempt).
  - Earlier ambiguity is never cleared.
- **Genuine crashes stay conservative.** A runner that dies or stalls after its intent, in the unavoidable gap between the database and the network, leaves an intent without an outcome. Recovery treats that as ambiguous. No perfect atomicity is claimed, and the provider's idempotency key remains the separate safeguard.
- **Cancellation, stated accurately.** The runner awaits the transport. After 30 seconds a timer aborts the `AbortSignal`. The Resend transport passes the signal to `fetch`, which then rejects; that is recorded as ambiguous (`E_TIMEOUT`).
  - Aborting only stops waiting on our side. The provider may still have received and processed the request.
  - A transport that ignored the signal would keep the runner waiting. Its lease would then expire, and the job would be recovered as ambiguous, because an intent is recorded.
  - No timeout behaviour was changed in this pass.

**Regressions** (controlled delays inside the runner's awaits; mocked transport):
- **Quotation expiry during the pre-send write:** zero transport calls; the attempt is closed with intent, no call and `E_QUOTE_EXPIRED`; the job is `needs_owner` and not ambiguous; a later run recovers nothing; the owner sees "Not sent", never "Unknown".
- **Too little lease left:** zero calls; the attempt is closed `E_LEASE_TOO_SHORT`; the job is `retry_wait` (not ambiguous, due at once); the next run proceeds (here, a definite rejection); the resend page shows **no** duplicate warning.
- **Deadline during the pre-send write:** the attempt is closed `E_WINDOW_CLOSED` with no call, and the earlier real attempt's ambiguity is kept.
- **Ownership taken over before the skip write:** nothing is overwritten; the newer runner's lease stands and the attempt stays open for recovery.
- **Lease expired before the intent:** recovery closes the attempt as `E_LEASE_EXPIRED_BEFORE_SEND` and does not mark the job ambiguous.
- **A genuine crash after the intent:** recovery marks the job ambiguous.
- **Verified against the old behaviour:** the too-little-lease and no-intent-recovery tests fail when the skip leaves the job for recovery or when recovery always marks ambiguity.

**Evidence (Node 24.11.1, wrangler 4.147.0, Chromium 151 headless; mocked transport only, no provider request):**
- `npm test`: 423/423.
- `npm run test:worker:owner`: 19/19 in three consecutive runs (real local Workers/D1, mocked provider).
- `npm run test:worker`: 30/30.
- `npm run check`: 0 errors.
- Production config: unchanged.

### Checkpoint 3 status (2026-10-16)
Codex signed off on checkpoint 3 (durable email jobs and its repairs). It is complete as a disabled local foundation.

### Checkpoint 4: customer quotation routes and simulated checkout (2026-10-16, local, uncommitted; stopped for independent review)

**Scope, as authorized:** the `/quote/` shell with a fragment-token exchange; secure retrieval, explicit acceptance (and decline, §5) and the simulated checkout; clear invalid, expired, revoked and superseded link states; and the simulated card/bank interface with a persistent no-real-payment disclosure. The committed configuration keeps the workflow, sending and customer readiness off. Only temporary test builds turn them on. No real Access or provider behaviour is verified or implied.

**What was built:**
- **The `/quote/` shell** (`src/routes/quote.astro`, script `src/scripts/quote.ts`, helpers `src/lib/quotation/quote-page.ts`):
  - **Not in `src/pages/`.** The `quoteRoute()` integration (`src/integrations/quote-route.ts`) adds it with `injectRoute`. `astro.config.ts` adds the integration only while `quotationWorkflow.enabled` is on, and test builds add it themselves. A committed (flag-off) build therefore never processes the page or its script.
  - **Why the integration:** with the page in `src/pages/`, the flag-off build gained an unreferenced script chunk, and `/payment-demo/` switched from an inline script to a shared chunk.
  - **Token handling:** the script takes the token only from an exact `#t=<token>` fragment and removes the fragment with `history.replaceState` before any request. It keeps the token in this tab's `sessionStorage` (memory if storage fails), so a reload works. It also reacts to `hashchange`, so a link opened in a tab already showing `/quote/` is used too (found by the end-to-end run).
  - **Display:** the approved snapshot: reference, request reference, first name, scope, amount, expiry in Philippine time, and the **quotation version**. Text is set with `textContent` only.
  - **Decisions:** "Accept quotation" and "Decline quotation" each open an in-page confirmation, for example "Accept quotation BT-Q-… for ₱… ? BuildTrack is an academic project; no payment is due." Only "Yes, accept this quotation" sends a POST, and focus moves to the question and then to the result.
  - **On leaving:** `pagehide` clears the rendered quotation and the demo field.
  - **Fallbacks:** without JavaScript, a `noscript` explanation (with the phone number) shows and nothing else. A browser without `fetch`, `crypto.randomUUID` or `history.replaceState` gets a clear message.
  - **Persistent disclosure:** "Academic project — no real payment. BuildTrack never asks for card or bank details. Do not enter real financial information."
- **Shell headers** (public Worker, `worker/public/index.ts`):
  - `/quote/*` now runs the Worker first (`wrangler.workflow.jsonc`, local only), which serves the static asset with `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex`, `X-Frame-Options: DENY`, `nosniff` and no ETag.
  - The CSP is `default-src 'self'`; `script-src 'self'` plus the **SHA-256 of each inline script in the served page**; `style-src 'self' 'unsafe-inline'`; `connect-src 'self'`; `form-action 'none'`; `frame-ancestors 'none'`; `object-src 'none'`; `base-uri 'none'`.
  - **Why hashes:** Astro inlines small page scripts, so `'self'` alone would block them. The hashes are computed from the page actually served.
  - **No production change:** `public/_headers` and production `wrangler.jsonc` are untouched. The cutover config will need `/quote/*` in `run_worker_first`.
  - **Crawling:** `robots.txt` adds `Disallow: /quote/` only while the workflow is enabled, and the sitemap filter excludes `/quote/`. Neither changes the committed build.
- **Customer API** (`worker/public/quote.ts`): `POST /api/quote/view`, `/accept`, `/decline` and `/simulate`. Every request needs:
  - POST, `Content-Type: application/json`, and the exact public `Origin`, with `Sec-Fetch-Site: same-origin` when sent. A simple cross-site form post (`text/plain` or form-encoded) gets 415.
  - A strict flat JSON body of at most 1 KB, with exactly the expected fields. An extra field, such as a demo code, gets 400.
  - A well-formed token.
  - The per-client limit of 30 requests an hour (§4): a keyed client hash and an hourly bucket in `client_counters`, purged after 48 hours by the existing cleanup.
  The server then hashes the token, looks it up in `quote_links`, and checks the quotation's state on every request. No CORS headers are ever sent, responses are `no-store`, and the token is never echoed or logged.
- **Link states** (migration `0005_quotation_customer.sql`: `quote_links` holds only each issued link's hash, generation, key version and revocation time):
  - unknown → 404 `invalid`;
  - link or quotation revoked → 410 `revoked`;
  - an older generation than the quotation's current one → 410 `superseded`;
  - past `expires_at` → 410 `expired`.
  Approval inserts generation 1 in its batch. Verification is by stored hash, so a link keeps working after the current key version changes. The revoke and new-link owner actions are not built yet; the revoked and superseded states were exercised by changing the database directly.
- **Viewing never changes anything.** Only explicit POSTs decide.
- **Accept and decline** (`decide`) are one batch:
  1. `UPDATE quotes SET status = accepted|declined, accepted_at|declined_at, version + 1` — only for the current link's hash, a still-open status (`approved` or `emailed`), **exactly the version the customer was shown**, unexpired and unrevoked;
  2. a `customer` event keyed to that update.
  A repeated or concurrent request finds the same decision and gets 200 (`repeated: true`). The opposite decision gets 409 `decided`, and a stale version gets 409 `changed`. An email job still pending when the customer decides is cancelled by the runner (`E_QUOTE_NOT_OPEN`), not sent.
- **Simulated checkout** (§8):
  - The request is `{ token, method: card|bank, outcome: success|failure|cancelled, attempt_id }` and needs an **accepted** quotation.
  - It writes only `simulated_checkouts`, which has `simulated = 1` by CHECK and no amount, payer, card or bank column. Writes are idempotent per `attempt_id` (`UNIQUE (quote_id, attempt_id)`; a repeat returns the first answer) and capped at 20 per quotation.
  - It **never changes the quotation's status**; there is no "paid" state.
  - Every result shows "Simulated—no money moved. Not a payment receipt." verbatim, the existing `outcomeMessages`, and the method labels "Card (simulated)" and "Bank transfer (simulated)".
- **Demo code** (`src/lib/quotation/customer.ts`):
  - It is labelled "Demo code — enter 12345678" (as instructed, replacing §8's "Demo code"), with "Use sample code".
  - The field is `type="text"`, `inputmode="numeric"`, `autocomplete="off"`, `spellcheck="false"`, `maxlength="8"`, has no `name`, and is in no form.
  - The browser checks the value against `12345678` exactly. A wrong value gets "That is not the demo code. Use the sample code 12345678." with `aria-invalid`.
  - The field is cleared after the check, on Back, on Start over and on `pagehide`.
  - The value is never sent, stored, logged or put in a URL. The backend neither knows nor cares whether it was entered.
  - It is not authentication and not proof of payment. There are no financial fields, bank instructions or QR codes.
- **Snapshot consistency:** the page and the email both show the approved snapshot (`snap_*`, frozen and immutable since checkpoint 3). The version shown is the quotation version the acceptance checks.
- **Migrations:** 0002's `quote_events` CHECK gains `accepted` and `declined`, revised in place because it has only ever been applied to throwaway test databases. 0005 is additive. `quote_links` and `simulated_checkouts` rows are deleted with their quotation (§17; retention checkpoint).

**Origin behaviour, tested directly (not inherited from the owner pages):** the `/quote/` page is served with `Referrer-Policy: no-referrer`. In headless Chromium 151, its same-origin `fetch` POSTs carried `Origin: http://127.0.0.1:<port>`, the exact public origin (recorded at the request level in `npm run test:worker:e2e`). The owner pages' `same-origin` workaround was therefore **not** applied to `/quote/`, and the plan's `no-referrer` stands.

**Evidence (Node 24.11.1; wrangler 4.147.0; headless Chromium 151; mocked email only):**
- `npm test`: 445/445. The new customer suite has 22 tests on simulated D1. They cover:
  - the view equal to the snapshot and to the email's values;
  - views changing nothing;
  - the four link states, with messages free of quotation details;
  - key rotation;
  - Origin, CSRF and media-type refusals that change nothing;
  - method, body and extra-field (demo code) refusals;
  - the hourly limit;
  - version-checked acceptance;
  - six concurrent acceptances recording one;
  - decline and the decision conflicts;
  - an expired link unable to accept;
  - a pending email job cancelled after acceptance;
  - simulate refused before acceptance, labelled simulated, status unchanged, idempotent (including concurrently) and capped;
  - log redaction;
  - the shell's headers and CSP hashes;
  - the page helpers and the demo-code check.
- `npm run test:worker:e2e` (new): 15/15 in three consecutive runs on the real local Workers runtime and D1, with two origins on one port. It covers:
  - a visitor's request (browser) → the owner reviews, drafts and approves in the browser (native forms) → a scheduled run hands the owner notification and the invitation to the in-memory provider → the customer opens the link;
  - the fragment is gone from the address bar; the values match the approval; the `/api/quote/view` POST carries the token only in its body and the exact Origin under `no-referrer`; no request URL ever contains the token;
  - reload in the same tab; explicit acceptance;
  - the simulated checkout: field markup, wrong code, sample code, the field cleared, "Simulated success" with the verbatim disclaimer; no request carries the demo code; the simulate body has exactly four fields;
  - no-JS; missing and invalid links;
  - declining by keyboard with a visible focus outline and focus management;
  - 390 px, and 320 px with 32 px text;
  - six concurrent HTTP acceptances recording one, and five concurrent identical simulations recording one;
  - the owner origin refused on the customer API, with no CORS headers;
  - D1 read with the server stopped: states never "paid", one simulated row per attempt, no token or demo code stored;
  - revoked and superseded links on the real runtime and in the page;
  - `/payment-demo/` still makes no API call;
  - no request left the two local origins; no CSP violation or script error; no tokens, names or addresses in the Worker's log lines.
- `npm run test:worker:owner`: 19/19. `npm run test:worker`: 30/30. `npm run test:browser`: 21/21 + 55/55 (existing inquiry, Home/demo and payment-demo regressions).
- `npm run check`: 0 errors.
- `npm run build` (committed config): byte-identical to the build before checkpoint 2.
- Production `wrangler.jsonc` and `public/_headers`: unchanged.

**Expiry coverage:** approved snapshots and their expiry are immutable (checkpoint 3 triggers), so the real-runtime run cannot age a quotation. Expiry is covered by the unit suite with a controlled clock. *(Corrected in the checkpoint 4 review repairs below: short-lived immutable fixtures now test expiry on real workerd/D1, including during delayed actions.)*

**Not verified:** real Cloudflare Access, the real provider, production D1 and Workers limits, other browsers, screen readers and real devices.

**Activation gates (all pending):**
- Review of checkpoint 4.
- Customer readiness (`customerRoutes.ready`) stays `false` until the customer routes are reviewed and verified in a controlled preview.
- Cutover config with `/quote/*` in `run_worker_first`.
- The owner revoke and new-link actions.
- Plus every earlier gate: IP header, Turnstile and no-JS, Access setup, sending account and controlled end-to-end test, production config, request retention, privacy wording.

### Checkpoint 4 review repairs (2026-10-16, local, uncommitted; stopped for Codex's focused recheck)

Codex's checkpoint-4 review reported six findings; all are repaired. **For each one, a regression was run against the defective implementation and failed, then passed after the repair:**
- For finding 1, 4 and 5 (page script), the saved defective `src/scripts/quote.ts` was swapped in, with the repaired server: 7 end-to-end scenarios failed (21/28).
- For findings 2, 3 and 6 (server), the saved defective `worker/public/quote.ts` was swapped in, given only the test pause point and no other change, with the repaired page: 4 end-to-end scenarios failed (24/28), and 9 unit tests failed (26/35).
- Both files were restored byte-for-byte, and everything passed again.

**1. Browser state bound to its own quotation** (`src/scripts/quote.ts`).
- **Before:** a response for an earlier link could render over a newer one, and confirmations were not tied to the quotation shown.
- **Now:**
  - Every link change starts a new session, aborts outstanding requests, and resets the view, the confirmation and any pending check. A response that still arrives for an older session is discarded; cancellation is not relied on.
  - A confirmation captures the session, token and version of the quotation on screen, and "Yes" sends exactly those.
  - Each simulated-checkout click captures its own token and attempt id.
- **Regressions (end to end, with Chromium holding responses after the server answered):**
  - A's delayed view response, then B opened, then A released: B stays.
  - A's acceptance response held (committed on the server), then B opened, then released: B is unchanged and not accepted; A shows its acceptance when reopened.
  - Rapid A → B → A with B delayed: A stays.

**2. Authorization re-checked inside every write** (`worker/public/quote.ts`).
- **Before:** a revocation or expiry between the validation read and the write did not stop the write.
- **Now:** each mutation repeats the authorization **inside its own SQL statement**:
  - the quotation's current `token_hash` is the presented link;
  - that link's `quote_links` row is unrevoked and of the current generation;
  - the quotation is unrevoked and in the right state (open for accept and decline; accepted for simulate), at the right version for decisions;
  - `expires_at` is after the write time.
- **The boundary:** the write time is read afresh immediately before the write, after any await. A quotation is **expired at the mutation boundary when `expires_at <= write time`**.
- **On failure** nothing is written: no acceptance, no event (it is keyed to the update) and no simulated row. The answer is then 410 (`expired`, `revoked`, `superseded`) or 409 (`decided`, `changed`).
- **Regressions:**
  - Unit, at a test-only pause point between the read and the write: link revoked, quotation revoked, expired and superseded, each for accept, decline and simulate; and a concurrent decline during an acceptance.
  - **Real workerd/D1:** expiry during a delayed acceptance, expiry during a delayed simulated checkout, and revocation during each. Every case leaves no row.
- **The pause point** (`QuoteHooks.beforeWrite`) is a test-only parameter. The deployed public Worker never passes it.

**3. Checkout attempt conflicts.**
- The same `attempt_id` with the same method and outcome returns the original result.
- A different method or outcome is **409 `conflict` and changes nothing**.
- The unit test that expected conflicting reuse to succeed was corrected. The real-runtime check confirms the same.

**4. Explicit fragments.**
- The tab's stored link is used **only when the address has no fragment**.
- Any explicit fragment that is not exactly `#t=<token>` shows "This quotation link is incomplete or not valid.", forgets the stored link, and clears the view and any open confirmation. That covers malformed, repeated (`#t=A#t=B`), percent-encoded and extra-parameter fragments.
- A well-formed but unknown token is checked by the server ("not valid") and replaces the stored link, so the earlier quotation is never silently reopened, not even after a reload.
- **Regression:** four malformed forms, each with a confirmation open beforehand. The error appears, no acceptance is sent even by a scripted click, and a reload does not reopen the earlier quotation. The unknown-token case behaves the same way.

**5. Uncertain outcomes and recovery.**
- **Before:** after a network failure the page said "Nothing was sent", which was not known.
- **Now:** after a network failure or a server error, the page says the outcome is unknown, for example "BuildTrack could not confirm whether your acceptance was recorded. It may have been. Select Check again to find out; this repeats the same answer and never records it twice."
- **"Check again"** repeats the **identical request**: same token, same version, same attempt id. It is kept only for the session that sent it, and the server answers it idempotently.
- One request runs at a time, so a second "Yes" while one is pending sends nothing. Stale answers cannot touch a newer quotation (finding 1).
- **Regressions:** the response is lost (reset by Chromium after the server committed) for an acceptance, a decline and a simulated outcome. Each shows the uncertainty, "Check again" reconciles it with exactly one identical repeat, and exactly one decision or row is recorded. A held acceptance plus extra "Yes" clicks sends one request.

**6. Runtime-expiry evidence.**
- **Correction:** the checkpoint-4 record said the real-runtime run "cannot age a quotation" and left expiry to unit tests. That was a limitation of the test fixtures, not of the runtime.
- The test-only end-to-end Worker now inserts **short-lived immutable fixtures** (an approved or accepted quotation that expires in 1.5–4 seconds, inserted directly; the immutability triggers cover only updates).
- **Real workerd/D1** now shows: an expired link answers 410 `expired` in the API and on the page; expiry during a delayed acceptance records nothing; expiry during a delayed simulated checkout records nothing.
- **Test harness note:** with the added scenarios, the single local test client exceeded the 30-requests-an-hour limit and was correctly refused (429). The end-to-end test now gives each customer request its own client address, as different customers would have. *(Superseded by the second review repairs below: per-request rotation hid the limit. Each customer journey now has one stable identity.)*

**Evidence (Node 24.11.1; wrangler 4.147.0; headless Chromium 151; mocked email; browser requests outside the two local origins are blocked and fail the run):**
- `npm test`: 458/458 (including 13 new customer tests for write-time authorization and conflicts).
- `npm run test:worker:e2e`: 28/28 in three consecutive runs (13 new scenarios).
- `npm run test:worker:owner`: 19/19.
- `npm run test:worker`: 30/30.
- `npm run test:browser`: 21/21 + 55/55 (the Home/demo suite once failed to start because Windows briefly locked Chromium's DevToolsActivePort file before any test ran; rerun: 55/55).
- `npm run check`: 0 errors.
- `npm run build`: byte-identical to the build before checkpoint 2.
- Production `wrangler.jsonc` and `public/_headers`: unchanged.
- The workflow, sending and customer readiness stay off in committed config.

**Remaining limitation, stated:** a check inside the write and the browser's handling cannot make a lost response "known". After a lost answer the customer is told the outcome is unknown until "Check again" (or a reload) asks the server.

### Checkpoint 4 second review repairs (2026-10-16, local, uncommitted; stopped for Codex's focused recheck)

Codex's second checkpoint-4 review reported five findings; all are repaired. Later checkpoints stay paused. The defective files were saved before any change and swapped back in for each demonstration, then restored byte-for-byte.
- **Findings 1 and 2** (page script): the defective script, changed only to send the now-required checkout version, failed 6 of the new end-to-end scenarios (29/36). It also threw a script error on a malformed body.
- **Findings 3 and 4** (server): the defective server, changed only to accept the new `version` field and then ignore it, failed 6 of the new unit tests (40/46 at that point).
- **Finding 5** (test identities): the old per-request rotation in the unit helper failed the one-bucket-per-journey test.

**1. Response uncertainty** (`src/lib/quotation/quote-page.ts` `classifyResponse`, `src/scripts/quote.ts`).
- **What counts as an answer:** only a fully recognised response:
  - a complete quotation view of the quotation on screen;
  - for accept or decline, that view in the decided state plus the `repeated` flag;
  - for a simulated result, exactly the method and outcome sent, on an accepted quotation;
  - a known link problem with its message, or a known definite refusal (409 conflict, changed, limit, not accepted; 429; 400/403/415) with its message.
- **Everything else is uncertain:** an unreadable or interrupted body, invalid JSON, an empty object, a mismatched shape, or any other status. This includes **HTTP 200**.
- **The kept request:** "Check again" keeps the exact request: token, action, displayed version, method, outcome and attempt id.
- **While unresolved:** no new decision or checkout attempt can start. The decision and outcome buttons are disabled and their handlers refuse; only "Check again" repeats the kept request. An open confirmation is closed.
- **Tests:**
  - End to end: after a **committed** acceptance, Chromium replaces the server's 200 answer with an interrupted body, invalid JSON, `{}` or a mismatched shape. Each is reported as uncertain, is not shown as accepted, cannot start a new decision, and reconciles with exactly one identical repeat; the server keeps one acceptance.
  - End to end: a simulated result answered with a different outcome is uncertain; clicking other outcomes sends nothing; "Check again" repeats the identical request (same attempt id and version); one row is recorded.
  - 11 unit tests of the classifier.

**2. Explicit empty fragment.**
- `/quote/#` has an empty `location.hash` but is an explicit link. The page now tests for the `#` itself (`location.href.includes('#')`), both on load and on `hashchange`.
- It shows the "incomplete or not valid" error, forgets the stored link, and clears the active session, view and any confirmation.
- A fragment-free address still restores the tab's stored link on reload.
- **Tests (end to end):** same-document navigation to `/quote/#` with a confirmation open (no acceptance is sent, even by a scripted click), then a fragment-free reload (the earlier quotation does not reopen); and a fresh load of `/quote/#` followed by a reload.

**3. Checkout version binding.**
- Simulated-checkout requests now carry the displayed quotation `version` (`{ token, version, method, outcome, attempt_id }`; a request without it gets 400).
- The conditional insert requires `quotes.version` to equal it.
- A version change, before or during the request, gets **409 `changed` with the current view** (never the stale one) and writes no row.
- **Tests (unit):** missing version, stale version, and a version change between the check and the write.

**4. Stored-attempt authorization.**
- Before any answer, including the stored result of an earlier attempt, the server re-reads authorization at a fresh time, after all awaits: current link and generation, link and quotation revocation, accepted state, the requested version, and expiry.
- A stored result is returned only if all of these still hold. The response then carries the current view.
- Otherwise the answer is the link problem (410) or `changed` (409), with no stored details.
- Valid idempotency is unchanged: the same authorized attempt returns its original result.
- **Tests (unit):** a stored attempt repeated while the link is revoked, the quotation is revoked, the version changes, or the quotation expires mid-request is refused with no stored details; the same attempt, still authorized, returns its original result.

**5. Stable test identities.**
- The per-request address rotation was removed from the unit helper (`tests/quotation-customer.test.ts`), the end-to-end API helper and the browser interceptor (`tests/worker/quotation-e2e.ts`).
- Each customer journey (one quotation link) now has **one stable client identity**, shared by the API helper and the browser. Separate journeys use separate fixtures and identities.
- The concurrent-acceptance and concurrent-simulation races now come from one customer, as they would in reality.
- **Tests:**
  - Unit: one rate-limit bucket per journey; a normal journey under the limit; deliberate exhaustion (30 allowed, the 31st gets 429 with `Retry-After: 3600` and "Too many requests from this connection. Please wait an hour and try again."; another customer is unaffected).
  - End to end: a normal browser journey under one identity (open, two reloads, a lost answer and "Check again", acceptance, checkout, return), using fewer than 30 requests; and deliberate exhaustion followed by the same journey in the browser, which shows the 429 guidance (not "uncertain", no quotation).

**Test-only plumbing:**
- The pause point is `QuoteHooks.beforeWrite`, an optional code parameter of `handleQuote`. Only the test-only Worker `tests/worker/e2e-test-worker.ts` passes it. That Worker also holds the pause, release, fixture and revoke routes.
- No request or environment value can activate the pause point in production code.
- A unit test checks that no Worker or site module imports from `tests/`, and that the deployable public entry calls `handleQuote` without hooks.

**Evidence (Node 24.11.1; wrangler 4.147.0; headless Chromium 151; mocked email; external browser requests blocked):**
- `npm test`: 481/481.
- `npm run test:worker:e2e`: 36/36 in three consecutive runs (8 new scenarios).
- `npm run test:worker:owner`: 19/19.
- `npm run test:worker`: 30/30.
- `npm run test:browser`: 21/21 + 55/55.
- `npm run check`: 0 errors.
- `npm run build`: byte-identical to the build before checkpoint 2.
- Production `wrangler.jsonc` and `public/_headers`: unchanged.
- The workflow, sending and customer readiness stay off in committed config.

### Checkpoint 4 third review repairs (2026-10-16, local, uncommitted; stopped for Codex's narrow recheck)

Codex reported two remaining findings; both are repaired. Later checkpoints stay paused. The defective files were saved first and swapped back in for the demonstrations, then restored byte-for-byte:
- **Old page script:** the three finding-1 recovery scenarios failed end to end (38/41).
- **Old server, with only a test hook point added where it performed its separate result and history reads:** 10 of the new unit tests failed (58/68), and the two real-D1 finding-2 scenarios failed end to end (39/41).

**1. A refused "Check again" leaves the outcome unknown** (`src/lib/quotation/quote-page.ts` `settles`, `stillUnknownText`; `src/scripts/quote.ts`).
- **Before:** a 429 (or any other refusal) on "Check again" cleared the saved request and the lock, as if the original action had been settled.
- **Now, on a retry:** only a recognised result settles it, or for a decision, the quotation already decided the other way (then the original cannot have happened).
- **Everything else keeps the exact saved request** (token, action, displayed version, method, outcome, attempt id) **and the action lock:** 429, 409 `changed`/`not_accepted`/`limit`/`conflict`, 400/403/415, a link problem, or an unrecognised answer.
- **Wording:** the page says the check was refused, not that the action failed, and shows the wait from `Retry-After`. For example: "This check could not be completed: Too many requests from this connection. Please wait an hour and try again. That does not mean your simulated result was not recorded; whether it was is still unknown. You can check again in about 60 minutes. Select Check again to find out."
- **Lock:** no fresh outcome or decision can start while the original is unknown.
- **A link problem on a retry** shows the problem and adds that whether the earlier action was recorded could not be confirmed.
- **Audit of first-request refusals** for the same premature clearing:
  - Refusals that can only happen before any write (rate limit, origin, shape, a stale decision version with the current view) settle the request as not done.
  - Refusals that can follow a write keep it unknown: a checkout answered `changed` or `not_accepted`, and a conflict without a view.
- **Regressions (end to end, real workerd/D1, Chromium):**
  - A committed checkout, then a lost answer, then the journey's own hourly allowance used up, then "Check again" refused with 429 (text checked; "Check again" still offered; other outcomes send nothing), then the next hourly window, then "Check again" reconciles.
  - The identical request is sent three times, and **exactly one** simulated result exists.
  - The same for a committed acceptance and a committed decline (no new confirmation can open meanwhile; exactly one decision).
  - The next window is reached by advancing the customer API's clock by one hour in the test-only Worker. Nothing is reset.
  - 9 unit tests of `settles` and the wording.

**2. Every response's data comes from one authorized snapshot** (`worker/public/quote.ts` `authorizedSnapshot`).
- **Before:** authorization was checked, and then the view, the simulated-result history and the stored attempt result were read by separate, unguarded queries.
- **Now:** everything a response tells the link holder about the quotation comes from **one `SELECT`**. That covers the view (including the views in 409 conflict answers), the simulated-result history, and the stored result for this attempt.
- **The same statement enforces, at a time read just before it:**
  - the presented link is the quotation's current one;
  - the link and the quotation are unrevoked;
  - the link is of the current generation;
  - the quotation is in a customer-visible state and unexpired.
- **Version and state checks** for checkouts are applied to that same snapshot.
- **The snapshot boundary:** that single statement reads one consistent database state, so nothing is read outside the authorization that admits it. Anything that happens after it does not affect what was already admitted, and it is the last read of each response. This replaces the earlier chain of separate final checks.
- **If the snapshot authorizes nothing,** the response gives only the reason (the link problem, or 409 `changed` for a race): no view, history or stored result.
- **Regressions:**
  - **Unit:** a hook just before the response read applies each change: revocation, a newer link generation with history recorded under it, expiry, and a version change. Each is checked for the view, a repeated acceptance and a stored checkout result. The answer is a refusal with no scope, history or stored result; for the version change, the conflict view is the current one.
  - **Real D1 (end to end):** revocation, supersession with newer history, and expiry while a view or a stored-attempt checkout is held just before its read. All give 410 with no data. A version change gives 409 with the current view and no stored result.

**Evidence (Node 24.11.1; wrangler 4.147.0; headless Chromium 151; mocked email; external browser requests blocked):**
- `npm test`: 500/500 (19 new tests).
- `npm run test:worker:e2e`: 41/41 in three consecutive runs (5 new scenarios).
- `npm run test:worker:owner`: 19/19.
- `npm run test:worker`: 30/30.
- `npm run test:browser`: 21/21 + 55/55.
- `npm run check`: 0 errors.
- `npm run build`: byte-identical to the build before checkpoint 2.
- Production `wrangler.jsonc` and `public/_headers`: unchanged.
- The workflow, sending and readiness stay off in committed config.

**Remaining limitation, stated:** if a link is revoked or expires between a committed decision and the response read, the customer sees the link problem rather than the decision. The decision itself was recorded exactly once.

### Checkpoint 4 fourth review repairs (2026-10-17, local, uncommitted; stopped for Codex's narrow recheck)

Codex reported two remaining recovery defects; both are repaired in the page (`src/scripts/quote.ts`, `src/lib/quotation/quote-page.ts`). The server and its authorized-snapshot SQL are unchanged. Later checkpoints stay paused.

**Defect.**
- `showProblem()` both displayed a link problem and cleared recovery: the saved request, the lock and "Check again". So a link error ended an unresolved acceptance, decline or checkout as if it had been settled:
  1. when the error answered a "Check again";
  2. when it answered the first request after the write had committed but before the response snapshot was read (the link was revoked, expired or replaced in between).
- A link problem alone cannot tell whether the action was recorded.

**Repair:**
- **Two separate functions:**
  - `displayProblem()` shows the link problem in place of the quotation (no quotation details) and does not touch recovery.
  - `showProblem()`, which also ends recovery, is used only when loading a link, when nothing is pending.
- **After an accept, decline or checkout has been sent,** a link problem, on the first answer or a retry, shows the problem **and** the uncertainty: "Your acceptance may or may not have been recorded before this link stopped working. Select Check again to repeat the same request; while this link is expired, withdrawn or replaced it may not be able to confirm the result. To find out for certain, contact BuildTrack using the phone number shown below." The problem panel carries the public phone link.
- **What is kept:** the exact request, the lock and "Check again". A retry sends exactly that request and still goes through the server's normal link authorization. Nothing is bypassed, and no quotation details are shown while the link is unusable.
- `settles()` now treats any link problem after a decision or checkout as not settling it; only loading a link treats it as final.
- **Recovery ends only on:**
  - a recognised answer that settles it;
  - a session replacement: a new link, or an explicit fragment, including an invalid one (that still invalidates the previous session);
  - a fresh page load.
- **Back from the page cache:** an unresolved action now stays pending, instead of being reloaded away.
- **Unchanged:** A → B → A session isolation and the authorized-snapshot SQL.

**Regressions:**
- **Browser matrix** (`npm run test:worker:e2e`, real workerd/D1, Chromium): accept, decline and checkout × revoked, expired and superseded × the link failing on the **initial response** or on the **retry response**. That is 18 scenarios.
  - **Initial response:** the Worker holds the request after its write and before its response snapshot, the link is invalidated, then the request is released.
  - **Retry response:** the first answer is lost after the commit, the link is invalidated, then "Check again".
  - **Each asserts:**
    - the link problem and the uncertainty wording are both shown, with the phone link and no quotation details;
    - "Check again" stays;
    - scripted clicks on decision and outcome controls send nothing (the lock);
    - a retry while the link is unusable sends the identical request and stays uncertain;
    - once the link is valid again (revocation undone, clock restored, original generation restored, all by test-only routes), "Check again" reconciles;
    - only the identical request was ever sent, and exactly one acceptance, decline or simulated result exists.
  - **Against the defective page script and helpers, all 18 failed** (42/60). The repaired files were then restored byte-for-byte.
- **Preserved:** a new link, then the old one, then an explicitly invalid fragment still replace an unresolved session.
- **Unit:** `settles` for link problems after each action (first answer and retry), and the wording. Both failed against the old helpers.

**Evidence (Node 24.11.1; wrangler 4.147.0; headless Chromium 151; mocked email; external browser requests blocked):**
- `npm test`: 502/502.
- `npm run test:worker:e2e`: 60/60 in three consecutive runs (19 new scenarios).
- `npm run test:worker:owner`: 19/19.
- `npm run test:worker`: 30/30.
- `npm run test:browser`: 21/21 + 55/55.
- `npm run check`: 0 errors.
- `npm run build`: byte-identical to the build before checkpoint 2.
- Production `wrangler.jsonc` and `public/_headers`: unchanged.
- The workflow, sending and readiness stay off in committed config.

**Remaining limitation, stated:**
- While a link stays expired, withdrawn or replaced, the page cannot confirm a pending action itself. It says so and points to BuildTrack's phone.
- A fresh page load (not a return from the page cache) starts a new session and does not remember an unresolved action. It then shows whatever the server reports for the link. *(Superseded on 2026-10-17 by the reload repair below.)*

### Local completion: reload repair, owner lifecycle, retention, Turnstile (prepared, off), deployment preparation (2026-10-17, local, uncommitted; no independent signoff yet)

The owner authorized completing the local implementation in one pass. The workflow, sending, customer readiness and Turnstile all stay **off**. Production `wrangler.jsonc` and `public/_headers` are unchanged, and the committed build is byte-identical to the build before checkpoint 2. Nothing external was created or contacted. The consolidated review packet is `docs/CODEX_HANDOFF_QUOTATION.md`; the owner setup steps are in `docs/QUOTATION_RUNBOOK.md`.

**A. Checkpoint 4 reload defect.** Codex found that an unresolved action was forgotten on reload, so a repeated choice could create a second record.
- **Before dispatch:** the page now writes minimal pending-action metadata to `sessionStorage` (`buildtrack-quote-pending`, tab-scoped) and reads it back.
  - The metadata: format version, action, link token, displayed version, attempt id, method and outcome.
  - It never contains the demo code, amounts, names or quotation content.
  - If the write or the read-back fails, nothing is sent. The page says the action needs browser storage to be sent safely.
- **On load:** the stored value is treated as untrusted and validated strictly (`parsePending`): exact fields, enums, a UUIDv4 attempt id, a length cap, no prototype keys, and a token equal to both the current link and the session's token.
  - A valid value restores the exact request, the lock, the uncertainty wording and "Check again" before the quotation view loads. Views are allowed while the action is unresolved.
  - A view that reports a link problem keeps the uncertainty (the link was revoked, expired or replaced after the action).
- **When the metadata is cleared:**
  - on a recognised settling answer;
  - on a session replacement: another link, an explicit invalid fragment, or no token.

  An invalid or new link therefore never resurrects an earlier action.
- **Unchanged:** the shell's private `no-store` headers. Privacy was not weakened to make the page cacheable for the Back button.
- **Tests:**
  - 14 unit tests in `tests/quotation-customer.test.ts`.
  - End-to-end tests in `tests/worker/quotation-e2e.ts`. A request-stage gateway returns 504 to the browser while forwarding the identical request to the Worker. Scenarios:
    - Codex's case: checkout still running → timeout → reload → repeated choice blocked → original released → reconciled, one record;
    - accept and decline across a reload;
    - a link revoked after reload;
    - new, invalid and tampered links do not resurrect an action;
    - a storage failure sends nothing.
  - Against the previous page, the 4 reload scenarios failed (61/65). With the repair: 65/65.

**B. Owner lifecycle controls** (owner Worker; migration `0006_quotation_lifecycle.sql`; the event list in `0002` gains `revoked`, `link_replaced` and `resent`).
- **Routes and protection:** `/requests/<id>/(revoke|new-link|dismiss|delete)`. GET shows an explicit confirmation page; POST mutates. Every POST needs:
  - the Access JWT;
  - the exact owner Origin;
  - a single-use signed form token bound to (action, id, version);
  - a version match.

  Token consumption and the change happen in one atomic D1 batch, so duplicate clicks or concurrent posts take effect once. GET and HEAD never mutate or send.
- **Revoke** (approved or emailed quotations only):
  - The status becomes `revoked`, the link hash is removed and every link row is revoked.
  - Queued and retry-wait quotation emails are cancelled (`E_REVOKED`).
  - An email already claimed, or accepted by the provider, **cannot be recalled**. The confirmation page says so, and the link in that email no longer works.
  - The customer page says the quotation was withdrawn, without quotation details.
- **New link** (approved, emailed or revoked, and not yet expired):
  - Creates the next link generation, which invalidates older links, and queues one new email job (`bt-q-<id>-g<n>-s0`).
  - Cancels older generations' unsent jobs (`E_LINK_REPLACED`).
  - The approved snapshot and the expiry are **immutable**. A new link re-sends the same quotation with the same expiry. After expiry no new link is offered; a changed quotation needs a new request.
- **Dismiss:** only for a `received` request without a quotation.
- **Delete:**
  - Removes the request and everything attached to it in one batch: quotation, links, events, jobs and attempt history, simulated outcomes, confirmation tokens.
  - It is **refused while an email for the request is being sent** (a claimed job with a live lease); the owner retries later.
  - The confirmation page lists what is not deleted because BuildTrack does not control it: sent emails, the provider's logs and backups.
- **Activity:** owner actions and resends (now recorded as a `resent` event) update `last_activity_at`.

**C. Retention** (approved: 90 days after last activity; `worker/owner/retention.ts`).
- **Last activity:** `quote_requests.last_activity_at` is authoritative.
  - It is set at intake and moved by owner actions and by customer actions that change something (accept, decline, a new simulated outcome).
  - Views, retries and repeats never move it. Customer actions end at link expiry, so the public cannot extend retention indefinitely.
- **Each owner cron run** (every 5 minutes, independent of sending):
  - deletes at most 25 expired requests whole, with the same statements as owner delete, skipping any request with a send in flight;
  - deletes at most 500 used form tokens a day after they expire;
  - deletes at most 100 cap-warning jobs older than 90 days.
- **Kept:** the per-year reference counters (`ref_sequences`, `quote_ref_sequences`; year and number only), so references are never reused. The public Worker still purges rate-limit counters after 48 h and daily totals after 8 days.
- **Measured** on real local D1 with 6,000 requests: each pass deleted 25 requests using 178 statements, 132 rows read and 50 rows written. The query plans use indexes, with no full scans. CPU time on Cloudflare still has to be checked in the preview.
- **Outside the application, and not promised** (§17): D1 Time Travel (7 days), the email provider's logs (Resend Free: 30 days), recipients' mailboxes and Formspree.

**D. Turnstile (prepared and disabled).**
- **Server side** (`src/lib/quotation/turnstile.ts`, `worker/public/intake.ts`): with `TURNSTILE_ENABLED=on`, the public Worker validates the widget token with Siteverify after deriving the client identity and before any database access. It checks:
  - success, the hostname and the action `quotation-request`;
  - expiry and replay (`timeout-or-duplicate`);
  - a token of at most 2048 characters.
- **Retries:** one retry with the same Siteverify idempotency key after a network error, timeout, 5xx or `internal-error`. This key is separate from the form's `submission_id`.
- **Fails closed:** enabled without the secret gives 503, and so does an unavailable Siteverify.
- **Native (no-JS) posts:** refused with phone guidance before the body is read. The page also renders a `<noscript>` explanation with the phone number.
- **Unchanged:** the global cap and the single daily owner warning.
- **Off in the build:** a literal `export const TURNSTILE_ON = false` keeps the committed build byte-for-byte unchanged; an object-property flag had changed the Contact bundle. `npm run test:build:turnstile` checks two things:
  - the committed build has no Turnstile code;
  - an enabled fixture build renders the widget, the script and the no-JS guidance.
- **No real request:** Siteverify is mocked in tests.
- **The decision to require JavaScript for quotation intake remains unapproved.** No unprotected fallback exists, and the published form is unchanged.

**E. Deployment preparation (not deployment).**
- **Templates:** `deploy/public.wrangler.example.jsonc` and `deploy/owner.wrangler.example.jsonc`:
  - placeholders only, with no secrets;
  - all switches off and invocation logs off;
  - the public Worker runs first only for `/api/*` and `/quote/*`.

  `tests/deploy-templates.test.ts` checks them, and checks that production stays assets-only.
- **Runbook:** `docs/QUOTATION_RUNBOOK.md` covers:
  - owner decisions and costs;
  - D1 and migrations;
  - the owner Worker and Access, set up before any secret;
  - secrets and rotation;
  - Resend and the sending domain;
  - Turnstile, if approved;
  - a separate controlled preview pair;
  - cutover, schedules, logging and privacy;
  - rollback and recovery.
- **Inspected locally:** no D1 database, owner Worker, Access application, sending domain or Turnstile widget exists for this project, and none is assumed.

**Evidence:** see `docs/CODEX_HANDOFF_QUOTATION.md`, "Test results".

### Codex consolidated review repairs (2026-10-17, local, uncommitted; stopped for Codex's focused recheck)

Codex's consolidated review of the local completion reported seven findings. All are repaired in one local pass. The workflow, sending, customer readiness and Turnstile stay **off**; production `wrangler.jsonc` and `public/_headers` are unchanged; nothing was provisioned, deployed, sent or committed. Earlier evidence in this section is kept as recorded; where a figure is superseded, that is said below.

1. **Stale email completion** (`worker/owner/sender.ts`). A send for an older link generation that was already claimed when the owner issued a new link could finish afterwards and mark the quotation `emailed`, although the new link's email had not been accepted (and the `emailed` state then hid the new link's resend). The `approved → emailed` update in the acceptance batch now also requires `quotes.link_generation` to equal the job's generation. The older job still records its own truthful acceptance (`provider_accepted`, provider message id, attempt `OK_ACCEPTED`).
2. **Cross-generation resend guard** (`worker/owner/store.ts`, `resendQuotation`). `resend_seq` restarts at 0 for each link generation, but the "no later job" guard compared it across generations, so an earlier generation's resend blocked a confirmed resend for the new link (409). The guard now compares within the job's generation. The owner page and handler already pick the latest job by (generation, resend number), and the store still refuses an older generation's job.
3. **Retention query cost** (`migrations/0007_retention_cap_warning_index.sql`, `worker/owner/retention.ts`). The cap-warning deletion scanned all of `email_jobs` (`SCAN email_jobs`), so every pass, even one with nothing to delete, read the whole email history. Migration `0007` (additive) adds a partial index on `email_jobs (created_at) WHERE kind = 'owner_cap_warning'`; the statement now uses it. The plan test now covers every retention statement, including this one and the attempt deletion the trigger runs. While measuring on real D1 it also showed that D1's `meta.changes` for this DELETE counts the attempt rows the trigger deletes (200 for 100 jobs), so deleted jobs are now counted from `RETURNING id`.
4. **Expired cap-warning leases** (`worker/owner/retention.ts`). Retention skipped every cap warning in `sending`. A runner that vanished leaves its job in `sending`, and lease recovery runs only while sending is on, so with sending off such a job was kept forever. Retention now deletes old cap warnings unless the lease is live (`status <> 'sending' OR lease_until < now`, the sender's own recovery rule); attempts go with the job (trigger). It is one statement: a runner claiming at the same moment either finds the job gone or holds a fresh, live lease; a runner whose lease expired and whose job was deleted writes nothing back (its updates require the job and its lease).
5. **Deployment templates** (`deploy/*.example.jsonc`, `docs/QUOTATION_RUNBOOK.md`). Wrangler resolves `main`, `assets.directory` and `migrations_dir` relative to the config file's folder, so the templates could not be used where they are (`deploy/worker/...`, `deploy/migrations`). Paths stay repository-root relative (so the cutover merge into `wrangler.jsonc` keeps them), and the templates and runbook now name the exact root-level files: `wrangler.owner.jsonc`, `wrangler.owner.preview.jsonc`, `wrangler.preview.jsonc`, and `wrangler.jsonc` at the cutover. `npm run test:deploy:templates` (new) runs the pinned Wrangler on a filled copy at the root (`deploy --dry-run` bundles; `d1 migrations apply --local` applies all seven to a throwaway database) and, as a negative control, on the same file inside `deploy/`, where both commands must fail. No remote command is run.
6. **Reload identity assertions** (`tests/worker/quotation-e2e.ts`). `expectEqual(new Set(sent), new Set([original]))` compared `"{}"` with `"{}"` and always passed. `expectEqual` now refuses any Set or Map, and the reload scenarios assert the exact number of requests (the original and each "Check again") and that every one is the same action with the same fields (token, version, method, outcome, attempt id). A harness self-test proves that a different action, token, version, outcome, attempt id, an extra field, one retry too many or none at all each fail, and that the old Set comparison is refused.
7. **Cancellation-error suppression** (`tests/worker/quotation-e2e.ts`). The harness ignored "Invalid InterceptionId" for any request id, and other response-stage CDP errors were ignored entirely. Now only the exact error `Invalid InterceptionId.` is tolerated, and only for an interception id the harness saw paused and whose cancellation Chromium itself reported: `Network.loadingFailed` with `canceled: true` for that request (matched through the interception's `networkId`; this is what Chromium sends when the page aborts its own fetch), or a main-frame navigation (`Page.frameNavigated`) committed after it was paused. A standalone probe (2026-10-17, headless shell 1234) showed that when a reload replaces the document, Chromium sends **no** per-request event for a request paused at the request stage, only the navigation; the first version of this repair required `loadingFailed` and its own self-test failed for that reason. Any other CDP error, or that error for an id never paused or never reported cancelled, fails the scenario in progress and the run. Nothing throws inside a CDP callback and unhandled rejections are recorded, so no later scenario or assertion is skipped. A self-test pauses real requests and checks four cases: cancelled by a reload (tolerated), aborted by the page (tolerated), an unknown id (fails), another error for a tracked id (fails).

**Regressions, each shown to fail against its defect** (the defect re-applied temporarily, then restored):

| Finding | Simulated D1 (`tests/quotation-lifecycle.test.ts`) | Real local Workers/D1 (`npm run test:worker:owner`) |
|---|---|---|
| 1 | in-flight older send after a new link: fails (`emailed`) | "Generations": fails ("the replacement link was marked emailed") |
| 2 | resend → new link → rejection → confirmed resend: fails (409) | "Generations": fails (409) |
| 3 | plan test: fails without `0007` (`SCAN email_jobs`) | populated runs: an empty pass read 6,009 rows (6,000 jobs) and 12,009 (12,000) instead of 6; fails |
| 4 | expired lease deleted with sending off; live lease kept; stale runner writes nothing: fails | "Cap warnings (sending off)": fails |

Findings 5–7 are test or documentation repairs; their checks fail on the defect as follows: the Wrangler negative control is the defect itself (the file used from `deploy/` fails); with the old `expectEqual` and the old handler restored, `npm run test:worker:e2e` gave 67/69: the identity self-test failed ("a Set comparison is refused: expected true, got false") and the cancellation self-test failed (the unknown id was suppressed silently, and the unrelated error `Fetch.failRequest: Unknown errorReason` was rethrown from the handler instead of being recorded).

**Retention cost, measured on real local D1 (2026-10-17).** The fixture is a realistic history, not requests alone: per request a quotation, a link, an approval event, the owner notification (1 attempt) and the quotation email (2 attempts), plus 200 cap warnings (1 attempt each), half of everything older than 90 days. Complete `runRetention` passes, D1's own `rows_read` / `rows_written` per statement:

| Email jobs (attempts) | Pass | Deleted | Statements | Rows read | Rows written |
|---|---|---|---|---|---|
| 6,000 (8,900) | nothing eligible | 0 | 3 | 6 | 0 |
| | first | 25 requests, 100 cap warnings | 178 | 1,477 | 450 |
| | second | 25 requests | 178 | 780 | 250 |
| 12,000 (17,900) | nothing eligible | 0 | 3 | 6 | 0 |
| | first | 25 requests, 100 cap warnings | 178 | 1,477 | 450 |
| | second | 25 requests | 178 | 780 | 250 |

Identical at both sizes: the cost does not grow with the history. This supersedes the earlier "132 rows read and 50 written per pass on 6,000 rows" (part C above), which was measured on requests without jobs or attempts. These are local D1 counters, not Cloudflare billing; CPU time on Cloudflare still needs the preview.

**Follow-up (2026-10-17, owner request).** The owner email statement observed above is fixed: `approvedSummary` (`worker/owner/pages.ts`) states the current link generation's email status only and lists earlier generations' emails under "Earlier links (history)". Regression: `tests/quotation-lifecycle.test.ts`, which fails when the statement is computed over all generations. A manual local walkthrough, `npm run walkthrough:quotation`, reuses the end-to-end test Worker with mocked Access and a mock inbox, on loopback only (runbook §0a).

**Presentation build and demo-checkout redesign (2026-10-17, owner request; local only; not reviewed).** `npm run walkthrough:quotation` serves the complete website for a recorded presentation (runbook §0a). Its build also swaps the general Contact form to the no-endpoint fixture (the committed config holds the real Formspree endpoint), and the walkthrough Worker adds `form-action 'self'; connect-src 'self'` to website pages. The `/quote/` checkout (§8) was redesigned: a BuildTrack-branded card with an order summary of the approved snapshot; methods as a keyboard-operable radio group ("Card — demo", "Bank transfer — demo") with static local SVG illustrations; a review step with "Complete demo payment" and the failure/cancellation alternatives; and a "Demo confirmation" result with the unchanged disclaimer "Simulated—no money moved. Not a payment receipt.". It adds no financial fields. Script changes are presentation-only (the method radio group, the step list, filling the summary and result); the request fields, pending-action storage, retry identity, locks and link-session handling are unchanged, and `npm run test:worker:e2e` passes through the new markup.

### Manual email release mode and the three outstanding review findings (2026-10-17, local, uncommitted; awaiting Codex's focused review)

The owner changed the release plan: a free hosted academic version on the existing `buildtrack.sunnydelacruz.workers.dev` site, with **manual email** through Sunny's own email account. No domain, Resend account, other email integration or payment method. The approved presentation design and demo checkout are kept. Nothing was provisioned, deployed, committed or sent.

**Manual email mode (the release mode).** `EMAIL_MODE` other than `"resend"`, including unset, is manual (`src/lib/quotation/invitation.ts` `manualEmailMode`). In manual mode:
- **Intake** (`worker/public/store.ts`): the save batch's owner-notification statements are gated by one bound flag (`?30`); no notification job is created and the daily notification counter does not move. The reservation, refund and outcome statements are unchanged.
- **Approval and new link** (`worker/owner/store.ts`, `queueEmail: false`): the same atomic batches without the email-job statement. Approval records the quotation, its link hash (`quote_links`) and the event; no provider configuration is needed.
- **The prepared invitation** (`worker/owner/handler.ts` `invitationFor`, `pages.ts`): on the authenticated, no-store request page, the link token is rebuilt from the key version and generation recorded at approval and used only if its SHA-256 equals the stored `token_hash`. Otherwise the page says why (revoked, expired, key missing or changed, `PUBLIC_ORIGIN` not configured) and shows no link. The text is the same as the automatic quotation email. The page offers **Prepare email** (an RFC 6068 `mailto:`: address with only reserved characters encoded, subject and body percent-encoded UTF-8 with CRLF, never `+`), **Copy email text** and **Copy quotation link**. The copy buttons come from one same-origin script (`/owner.js`, behind Access; owner CSP `script-src 'self'`) and fall back to selecting the text. The wording never says that opening or copying sends or delivers anything.
- **Mark as manually sent** (migration `0008`: `quotes.manual_sent_generation`, `manual_sent_at`): a confirmed, single-use, Origin-checked POST bound to the quotation version, recorded only for the current, unexpired, unmarked link generation. It is shown as "Marked sent by owner on …; it does not confirm that the email was delivered or read". It does not change the quotation's version, status or anything the customer needs; a new link generation is unmarked.
- **Resend** is not offered or accepted.
- **The scheduled run** (`worker/owner/scheduled.ts`) sends nothing even with a transport and mail settings. Jobs still `queued` or `retry_wait` from automatic mode are cancelled (`E_MANUAL_MODE`, at most 100 per run) and shown as "Automatic email records (history) … None of these will be sent".
- **The owner list** says it is the request inbox and that no notification emails are sent.
- **The customer confirmation** (JS and no-JS) says the request is stored and will be reviewed, that an invitation is sent manually after approval, and that a request creates no payment, booking or subscription. No customer link ever appears on a public page.

The automatic (Resend) code is retained, tested and not released (`EMAIL_MODE: 'resend'` in its test suites). The draft privacy wording now describes manual email (version `draft-2026-10-17-manual`; still `draft` pending the owner):

> I understand my details will be stored by BuildTrack on Cloudflare and used to review my request and, if a quotation is approved, to email me a private link to it from BuildTrack's own email account. BuildTrack deletes its quotation records 90 days after the last activity; emails already sent stay in the sender's and my mailboxes.

**Free-plan limit (retention).** Workers Free allows 50 D1 queries per invocation, and Cloudflare documents per-statement limits inside batches. A retention pass of 25 requests used 178 statements, so retention now deletes at most 5 requests per run (38 statements; up to 1,440 requests a day). Real local D1: an empty pass 3 statements, 6 rows read; a deleting pass 38 statements, 857 read, 250 written; identical at 6,000 and 12,000 jobs, and asserted below 50.

**The three outstanding findings.**
1. **Interception harness** (`tests/worker/quotation-e2e.ts`): interceptions are tracked as outstanding from pause until completed. Every successful continue, fail or fulfil retires the id (`complete`). "Invalid InterceptionId." is tolerated only for an outstanding id with a browser-reported cancellation (`loadingFailed` canceled, or a main-frame navigation since it was paused). A retired id followed by a navigation now fails (new self-test case). With retirement removed, the run gave 67/69.
2. **Disabled-build preservation:**
   - **Published comparison:** compared against the published source `8263494`, the workflow-off build first DIFFERED: the Contact page's CSS (`.quotation-card`, `.type-options[data-columns='2']`), the inquiry script bundle, and an extra `InquiryForm` CSS chunk.
   - **Script:** a literal compile-time `QUOTATION_ON` (as `TURNSTILE_ON`) selects the published `src/scripts/inquiry.ts` (restored byte-for-byte) or the quotation-capable `src/scripts/quotation-inquiry.ts`.
   - **Page:** `/contact/quotation/` moved to an injected route (`src/routes/quotation-request.astro`, `quoteRoute`), so a workflow-off build never processes it.
   - **Styles:** the two quotation-only rules are emitted only when the workflow is on.
   - **Result:** `npm run check:published-build` (new) builds both and reports identical output: 71 files, 39 binary byte-for-byte, 32 text without carriage returns (Windows checkout line endings).
3. **Walkthrough `--test-scheduled`:** removed. The walkthrough Worker exports no scheduled handler, so Wrangler's runtime answers `GET /cdn-cgi/handler/scheduled` with 500 and runs nothing. The walkthrough runs in manual mode: the mock inbox and its email-job action are gone, and "Prepare email" is neutralized locally with a visible note.

**Platform facts checked 2026-10-17 (official docs; to be re-verified in the preview):**
- Workers Free: 100,000 requests/day, 10 ms CPU per request or cron run, 5 cron triggers per account.
- D1 Free: 10 databases, 500 MB each, 50 queries per invocation, daily row limits enforced since 2026-09-01.
- Access: Zero Trust must be enabled; community reports (not official) say the Free plan may ask for a payment method, which is not authorized.
- Worker-level Access documents identity via `ctx.access` and does not confirm the `Cf-Access-Jwt-Assertion` header. The runbook therefore uses a hostname-based self-hosted application, and the owner Worker fails closed (404) without the header.

**Not verifiable locally:** real Access and its JWT header, `CF-Connecting-IP` at the edge, cron CPU time on Cloudflare, and real email-client handling of long `mailto:` links. The copy fallbacks cover the last. All are preview checks (runbook §6).

### Codex findings on the manual release, repaired (2026-10-17, local)

- **A. Ambiguous legacy retry cancellation** (`worker/owner/pages.ts` `jobLabel`):
  - A cancelled job whose earlier attempt may have reached the provider now reads "Further attempts cancelled … whether it was sent is unknown", not "Cancelled; not sent."
  - A `sending` job whose lease has expired reads "Stopped …", never "Being sent now". `JobRow` now carries `lease_until`.
- **B. Expired legacy sending leases** (`worker/owner/store.ts` `cancelPendingEmail`, called by the manual-mode scheduled run before any transport): one D1 batch retires jobs left `sending` with an expired lease, using the sender's recovery rules.
  - The open attempt is closed: `E_LEASE_EXPIRED` if it recorded a send intent, otherwise `E_LEASE_EXPIRED_BEFORE_SEND`.
  - The job becomes `cancelled` (`E_MANUAL_MODE`), and ambiguous only for a send intent. Earlier ambiguity is never cleared.
  - Every statement acts only on rows still `sending` with that expired lease. Live leases are untouched until they expire.
- **C. Manual notification-cap flag** (`worker/public/store.ts`, statement 5): `flagged` is set only when a notification was requested (`?30 = 1`), so a manual request never inherits the cap warning from automatic-mode counters. The explanatory comment moved out of the SQL text, because the statement binder counts `?n` even inside SQL comments.
- **Regressions:** `tests/quotation-manual.test.ts`, "Codex findings on the manual release". Each fails against its defect (A: 2 tests, B: 1, C: 1). After the repairs: `npm test` 585/585, `test:worker:e2e` 69/69, `test:worker` 30/30, `test:worker:owner` 25/25, `npm run check` 0 errors, `check:published-build` identical.

### Public academic demo (2026-10-17; owner instruction; published)

The owner asked for a public presentation of the whole workflow without Cloudflare Access, and without exposing the real owner dashboard or real records. This supersedes finishing real owner authentication *before the presentation*; real workflow activation stays separate and pending.

- **Three pages, browser-only** (`src/lib/academic-demo.ts`; state in `localStorage` key `buildtrack-academic-demo-v1`, shared between same-origin tabs through `storage` events):
  1. `/academic-demo/`: a demo request. The visitor picks one of three **fictional sample customers** (`@example.test` addresses, "(fictional)" organizations) and a plan. There are no text, email or phone fields, so no real personal data is collected.
  2. `/academic-demo/owner/`: a demo owner dashboard (real owner-page styling, labelled ACADEMIC DEMO). Request list, draft (the real owner form's validation), review, approve; the invitation box shows the email text and **"Open demo customer invitation"**, which replaces the email step and opens tab 3. Checkout results appear here; the status never becomes paid. "Reset demo data" clears the browser record.
  3. `/academic-demo/quote/#d=<id>`: the real customer page markup and styles (`src/components/quotation/QuotePageBody.astro`, now shared with `/quote/`) with an academic-demo notice; accept or decline, then the approved demo checkout (demo code checked in the browser, never stored).
- **Isolation:** no request leaves the browser. The pages call no API; their `Content-Security-Policy` (`public/_headers`) sets `connect-src 'none'; form-action 'none'`, so they *cannot* reach D1, the owner or public Workers, Formspree or any email service. No owner secrets, no real link tokens (demo ids are random and only find a record in the same browser), no real emails. Stored data is validated on every read; malformed data gives an empty demo. The real owner Workers stay disabled, and the test wrappers and mocked-authentication backends are not deployed.
- **Wording:** every page says "Academic demo", that requests, emails and payments are not real, and that approval and email delivery are demonstrated. It is not an operational quotation service.
- **Website integration (2026-10-17, owner instruction):**
  - While the real workflow is off, Home and Pricing quotation CTAs open the demo (`quotationJourneyHref`; a plan link carries `?plan=`). With the workflow on, they open the real quotation page.
  - Contact shows a **Request a quotation — academic demo** box that carries `?service=`/`?plan=`. Contact's real request form, including its quotation option, is unchanged.
  - The request page uses the real quotation page's layout (navy banner, "Your project", the field styles, the request-received panel). It shows sample details as plain text, not inputs, and requires an academic-demo acknowledgment.
  - Service and plan (each optional) are stored on the demo request. They are shown on the receipt, the owner list, review and approved summary, and the customer quotation. The owner's draft scope and amount are prefilled from them.
  - Reloads keep each tab's place.
- **Tests:** `tests/academic-demo.test.ts` (state rules) and `npm run test:browser:academic-demo` (now 61 checks, starting from Home; the original 36 checks were: the three-tab journey in one browser with live updates between tabs, wording, a declined quotation, an unknown link, 390 px layouts, only same-origin GET requests, no `/api/`, demo code never stored, the real workflow pages not built).
