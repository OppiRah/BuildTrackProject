// Owner BuildTrack Worker for the quotation workflow (docs/PROPOSAL_QUOTATION_WORKFLOW.md §2.1, §3):
// a separate Worker meant to run behind Cloudflare Access ("All traffic"), sharing the D1
// database with the public Worker. It holds the owner functions; the public Worker holds none.
// LOCAL ONLY: nothing deploys it (wrangler.owner.local.jsonc is local, and the production
// wrangler.jsonc is unchanged).
//
// Access keys always come from the configured team domain's published certs. There is no
// setting that makes this entry trust other keys; local test keys exist only in the test-only
// wrapper tests/worker/owner-test-worker.ts.
//
// Retention: the scheduled handler deletes records 90 days after last activity (retention.ts).
// Email (checkpoint 3): the scheduled handler sends due jobs only with SENDING_ENABLED=on,
// EMAIL_MODE=resend, RESEND_API_KEY, MAIL_FROM, HTTPS OWNER_ORIGIN and PUBLIC_ORIGIN, and the
// rest of the owner configuration; otherwise it does nothing (scheduled.ts).

import { accessKeySource } from '../../src/lib/quotation/access-jwt.ts';
import { resendTransport } from '../../src/lib/quotation/email-transport.ts';
import { handleOwner, type OwnerEnv } from './handler.ts';
import { runScheduled, runScheduledRetention, type SenderEnv } from './scheduled.ts';

export default {
  fetch(request: Request, env: OwnerEnv): Promise<Response> {
    return handleOwner(request, env, accessKeySource(env.ACCESS_TEAM_DOMAIN ?? ''));
  },

  async scheduled(_controller: unknown, env: SenderEnv): Promise<void> {
    // Retention first (needs only the owner configuration), then sending (needs the sending settings too).
    await runScheduledRetention(env);
    await runScheduled(env, (config) => (config.EMAIL_MODE === 'resend' && config.RESEND_API_KEY ? resendTransport(config.RESEND_API_KEY) : null));
  },
};
