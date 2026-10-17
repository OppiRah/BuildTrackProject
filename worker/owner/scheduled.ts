// The owner Worker's scheduled email run (docs/PROPOSAL_QUOTATION_WORKFLOW.md §3, §7, §18).
// Fails closed: unless every setting below is present and valid, nothing is claimed or sent, and
// the database is not touched. The deployable entry builds the real transport only for
// EMAIL_MODE=resend with RESEND_API_KEY; tests inject a mock transport instead.

import { customerRoutes } from '../../src/config/quotation.ts';
import type { EmailTransport } from '../../src/lib/quotation/email-transport.ts';
import { manualEmailMode } from '../../src/lib/quotation/invitation.ts';
import { log } from '../../src/lib/quotation/log.ts';
import { importHmacKey } from '../../src/lib/quotation/owner-form.ts';
import { ownerConfigured, validOwnerOrigin, type OwnerEnv, type OwnerOriginCheck } from './handler.ts';
import { runRetention, type RetentionSummary } from './retention.ts';
import { runSender, type RunSummary } from './sender.ts';
import { cancelPendingEmail } from './store.ts';

export interface SenderEnv extends OwnerEnv {
  /** "on" to send (automatic mode only); anything else leaves jobs queued. */
  SENDING_ENABLED?: string;
  /** "resend" in the deployable entry; no other mode is built in. */
  EMAIL_MODE?: string;
  /** Secret: a sending-only Resend API key. */
  RESEND_API_KEY?: string;
  /** e.g. "BuildTrack <quotes@mail.example.com>" on a verified sending domain. */
  MAIL_FROM?: string;
  /** Canonical origin of the public site, for customer links. */
  PUBLIC_ORIGIN?: string;
}

const ADDRESS = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;
/** "address" or "Name <address>", on one line, with no quotes or angle brackets in the name. */
export const validMailFrom = (value: string | undefined): value is string =>
  !!value && value.length <= 200 && (ADDRESS.test(value) || /^[A-Za-z0-9 .,'-]{1,64} <[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+>$/.test(value));

/**
 * Runs one email pass if fully configured; returns null (and touches nothing) otherwise.
 * Configuration is the owner Worker's full required set (ownerConfigured: origin, workflow switch,
 * D1, owner email, Access settings, OWNER_FORM_KEY, link key) plus the sending settings, all
 * checked before any database access. `transportFor` builds the transport, or returns null.
 * `time` is a fixed time or a clock; quotation emails also need `quotationEmailsReady`, which
 * defaults to the committed customer-route readiness constant (off).
 */
export async function runScheduled(
  env: SenderEnv,
  transportFor: (env: SenderEnv) => EmailTransport | null,
  time: number | (() => number) = () => Date.now(),
  originAllowed: OwnerOriginCheck = validOwnerOrigin,
  options: { quotationEmailsReady?: boolean } = {},
): Promise<RunSummary | null> {
  try {
    // Manual email mode (the release mode): BuildTrack sends nothing. Any job still waiting for a
    // provider (from automatic mode) is cancelled and kept as history, so it can never be sent later.
    if (manualEmailMode(env)) {
      const cancelled = (await ownerConfigured(env, originAllowed)) ? await cancelPendingEmail(env.DB!, typeof time === 'number' ? time : time()) : 0;
      log('manual_email_mode', { route: 'owner', claimed: 0, recovered: cancelled });
      return null;
    }
    const sendingSet =
      env.SENDING_ENABLED === 'on' && originAllowed(env.PUBLIC_ORIGIN) && !!env.OWNER_EMAIL && ADDRESS.test(env.OWNER_EMAIL) && validMailFrom(env.MAIL_FROM);
    const transport = sendingSet && (await ownerConfigured(env, originAllowed)) ? transportFor(env) : null;
    if (!transport) {
      log('sending_unavailable', { route: 'owner' });
      return null;
    }
    return await runSender({
      db: env.DB!,
      transport,
      sender: { from: env.MAIL_FROM!, ownerEmail: env.OWNER_EMAIL!, ownerOrigin: env.OWNER_ORIGIN!, publicOrigin: env.PUBLIC_ORIGIN! },
      linkKey: async (version) => {
        const secret = (env as Record<string, unknown>)[`QUOTE_LINK_KEY_V${version}`];
        const key = await importHmacKey(typeof secret === 'string' ? secret : undefined, ['sign']);
        return key ? { key, version } : null;
      },
      clock: typeof time === 'number' ? () => time : time,
      quotationEmailsReady: options.quotationEmailsReady ?? customerRoutes.ready,
    });
  } catch {
    log('error', { route: 'owner', code: 'E_SEND_RUN' });
    return null;
  }
}

/**
 * The scheduled retention pass (retention.ts). It needs only the owner configuration (not the
 * sending settings): records are deleted on time even while sending is off. Fails closed: without
 * the owner configuration nothing is read or deleted.
 */
export async function runScheduledRetention(
  env: OwnerEnv,
  time: number | (() => number) = () => Date.now(),
  originAllowed: OwnerOriginCheck = validOwnerOrigin,
): Promise<RetentionSummary | null> {
  try {
    if (!(await ownerConfigured(env, originAllowed))) return null;
    const summary = await runRetention(env.DB!, typeof time === 'number' ? time : time());
    log('retention_run', { route: 'owner', deleted: summary.requestsDeleted });
    return summary;
  } catch {
    log('error', { route: 'owner', code: 'E_RETENTION' });
    return null;
  }
}
