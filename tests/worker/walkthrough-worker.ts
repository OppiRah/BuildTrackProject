// TEST-ONLY Worker for the local owner/customer walkthrough and presentation
// (tests/worker/quotation-walkthrough.ts); never deployed or referenced by any wrangler config in the
// repository. It wraps the end-to-end test Worker (tests/worker/e2e-test-worker.ts: the real public
// site, customer API and owner handlers on one loopback port) in MANUAL email mode, the release
// mode: BuildTrack sends no email, and the owner page prepares the customer invitation for the owner
// to copy. It adds only local test tooling:
// - mocked Cloudflare Access for http://localhost:<port> (the owner pages): a request without an
//   Access header gets the run's test JWT (WALKTHROUGH_ACCESS_JWT, signed by a key generated for
//   this run). The owner handler still verifies it exactly as in the tests;
// - on the owner pages, the "Prepare email" mailto link is replaced by a jump to the prepared text,
//   with a visible note, so a local recording never opens an email application; the copy buttons
//   work as they will in the real deployment;
// - a presentation hub at http://127.0.0.1:<port>/__walkthrough/ (links to the website and the
//   owner dashboard, and the journey);
// - a guard on the website's pages: unless a page already sets its own policy, HTML gets
//   `Content-Security-Policy: form-action 'self'; connect-src 'self'`, so no form or script on the
//   presentation site can submit to an outside service (for example Formspree). The presentation
//   build also has no general-form endpoint at all (tests/browser/fixtures/inquiry-unconfigured.ts).
// No scheduled handler is exported, and the launcher does not pass --test-scheduled: Wrangler's
// runtime still answers GET /cdn-cgi/handler/scheduled, but with an error (500), running nothing. The e2e
// Worker's /__test/ helpers (revoke, clock, fixtures...) are not reachable through this Worker.

import e2eWorker from './e2e-test-worker.ts';

type Env = Parameters<typeof e2eWorker.fetch>[1] & { WALKTHROUGH_ACCESS_JWT?: string; PUBLIC_ORIGIN?: string; OWNER_ORIGIN?: string };

const escape = (value: string) => value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function hub(env: Env): Response {
  const site = env.PUBLIC_ORIGIN ?? '';
  const owner = env.OWNER_ORIGIN ?? '';
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>BuildTrack presentation (local)</title>
<style>
:root{--navy:#0b2742;--blue:#1268b3;--pale:#eaf6ff;--yellow:#ffd43b;--muted:#475569;--border:#cbd5e1}
*{box-sizing:border-box}body{margin:0;font:16px/1.5 Inter,system-ui,'Segoe UI',Roboto,sans-serif;color:#071a2b;background:#f7fafc}
header{background:var(--navy);color:#fff;padding:1.25rem 1rem}header div{max-width:60rem;margin:0 auto}header p{margin:.25rem 0 0;color:var(--pale)}
main{max-width:60rem;margin:0 auto;padding:1.5rem 1rem 3rem}h1{margin:0;font-size:1.5rem}h2{font-size:1.15rem;margin:2rem 0 .75rem}
.tag{display:inline-block;background:var(--yellow);color:#071a2b;font-weight:700;font-size:.8rem;padding:.15rem .5rem;border-radius:4px;margin-bottom:.5rem}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(15rem,1fr));gap:1rem}
.card{display:block;padding:1.25rem;border:2px solid var(--border);border-radius:12px;background:#fff;color:inherit;text-decoration:none}
.card:hover{border-color:var(--blue)}.card strong{display:block;font-size:1.1rem;color:var(--blue)}.card span{display:block;color:var(--muted);font-size:.9rem;margin-top:.25rem;word-break:break-all}
a:focus-visible{outline:3px solid var(--blue);outline-offset:3px}
.note{background:#fef9c3;border-left:4px solid var(--yellow);padding:.6rem 1rem}
</style></head><body>
<header><div><span class="tag">LOCAL PRESENTATION</span><h1>BuildTrack quotation workflow</h1><p>Synthetic data and mocked sign-in. Nothing leaves this computer; no email is sent.</p></div></header>
<main><div class="cards">
<a class="card" href="${escape(site)}/"><strong>Website Home</strong><span>${escape(site)}/</span></a>
<a class="card" href="${escape(owner)}/"><strong>Owner dashboard</strong><span>${escape(owner)}/ (mocked sign-in)</span></a>
</div>
<h2>Journey</h2>
<ol><li>Website: Home or Pricing → <em>Request a Quotation</em> → submit fictional details.</li>
<li>Owner dashboard: open the request → draft → review → <em>Approve quotation</em>.</li>
<li>The request page prepares the customer invitation: <em>Copy email text</em> or <em>Copy quotation link</em>. In the real release the owner pastes it into Gmail and presses Send; here, paste the link into the address bar.</li>
<li>Customer page: accept → Demo checkout → <em>Complete demo payment</em> → Demo confirmation.</li></ol>
<p class="note">Academic demonstration. Invitations are sent manually by the owner in the real release; here nothing is sent. No money moves and nothing is charged.</p></main>
</body></html>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'" } },
  );
}

/** Adds the outbound-submission guard to website HTML that has no policy of its own. */
function guarded(response: Response): Response {
  if (!(response.headers.get('Content-Type') ?? '').includes('text/html') || response.headers.has('Content-Security-Policy')) return response;
  const headers = new Headers(response.headers);
  headers.set('Content-Security-Policy', "form-action 'self'; connect-src 'self'");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

const WALKTHROUGH_NOTE =
  '<p class="notice"><strong>Local walkthrough:</strong> “Prepare email” is switched off here so that no email application opens during a recording. Use the copy buttons; in the real release, “Prepare email” opens a new message in your email application.</p>';

/** Owner pages in the walkthrough: no mailto link can open an email application. */
async function withoutMailto(response: Response): Promise<Response> {
  if (!(response.headers.get('Content-Type') ?? '').includes('text/html')) return response;
  const html = await response.text();
  if (!html.includes('href="mailto:')) return new Response(html, response);
  const changed = html.replace(/href="mailto:[^"]*"/g, 'href="#invitation-text"').replace('<h3>Customer invitation (you send it)</h3>', `<h3>Customer invitation (you send it)</h3>\n${WALKTHROUGH_NOTE}`);
  return new Response(changed, { status: response.status, statusText: response.statusText, headers: response.headers });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.hostname === 'localhost') {
      // Mocked Access: what Cloudflare Access adds in production after the owner signs in.
      if (!env.WALKTHROUGH_ACCESS_JWT || request.headers.has('Cf-Access-Jwt-Assertion')) return withoutMailto(await e2eWorker.fetch(request, env));
      const headers = new Headers(request.headers);
      headers.set('Cf-Access-Jwt-Assertion', env.WALKTHROUGH_ACCESS_JWT);
      return withoutMailto(await e2eWorker.fetch(new Request(request, { headers }), env));
    }
    if (url.hostname === '127.0.0.1') {
      if (request.method === 'GET' && url.pathname === '/__walkthrough/') return hub(env);
      if (url.pathname.startsWith('/__test/') || url.pathname.startsWith('/__walkthrough') || url.pathname.startsWith('/cdn-cgi/')) return new Response('Not found', { status: 404 });
      return guarded(await e2eWorker.fetch(request, env));
    }
    return new Response('Not found', { status: 404 });
  },
};
