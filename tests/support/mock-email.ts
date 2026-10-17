// TEST-ONLY in-memory email provider, injected as the runner's transport. It mimics the
// idempotency behaviour Resend documents (read 2026-10-16): a repeated key with the same payload
// returns the original response without sending again; a different payload under a used key is
// refused (409 invalid_idempotent_request); a key still in progress is refused as concurrent.
// Nothing leaves the process. Scripted behaviours simulate failures per call.

import type { EmailMessage, EmailTransport, SendResult } from '../../src/lib/quotation/email-transport.ts';

export type Behaviour =
  | 'accept'
  /** The provider accepts the message, but the response never arrives (timeout after acceptance). */
  | 'accept_then_timeout'
  | 'server_error'
  | 'rate_limited'
  | 'reject'
  /** Never answers until the runner aborts (or `release()` is called). */
  | 'hang'
  /** Accepts, then waits until `release()` before answering (a slow provider). */
  | 'accept_slow';

export interface MockProvider {
  transport: EmailTransport;
  /** Messages the provider accepted, once per key: what recipients would receive. */
  inbox: { key: string; messageId: string; message: EmailMessage }[];
  /** Every call the runner made. */
  calls: { key: string; to: string }[];
  /** Behaviours for the next calls, in order; afterwards every call is 'accept'. */
  script: Behaviour[];
  /** Answers every waiting 'hang' or 'accept_slow' call. */
  release(): void;
}

export function createMockProvider(delayMs = 0): MockProvider {
  const accepted = new Map<string, { payload: string; messageId: string }>();
  const inProgress = new Set<string>();
  const waiting: (() => void)[] = [];
  const provider: MockProvider = {
    inbox: [],
    calls: [],
    script: [],
    release: () => waiting.splice(0).forEach((resume) => resume()),
    transport: {
      async send(message, key, signal): Promise<SendResult> {
        provider.calls.push({ key, to: message.to });
        const behaviour = provider.script.shift() ?? 'accept';
        const payload = JSON.stringify(message);
        if (inProgress.has(key)) return { outcome: 'ambiguous', code: 'E_IDEMPOTENCY_IN_PROGRESS' };
        inProgress.add(key);
        try {
          if (delayMs) await new Promise((done) => setTimeout(done, delayMs));
          const earlier = accepted.get(key);
          if (earlier) {
            return earlier.payload === payload ? { outcome: 'accepted', messageId: earlier.messageId } : { outcome: 'rejected', code: 'E_IDEMPOTENCY_CONFLICT' };
          }
          const accept = () => {
            const messageId = crypto.randomUUID();
            accepted.set(key, { payload, messageId });
            provider.inbox.push({ key, messageId, message });
            return messageId;
          };
          switch (behaviour) {
            case 'accept':
              return { outcome: 'accepted', messageId: accept() };
            case 'accept_then_timeout':
              accept();
              return { outcome: 'ambiguous', code: 'E_TIMEOUT' };
            case 'server_error':
              return { outcome: 'ambiguous', code: 'E_PROVIDER_5XX' };
            case 'rate_limited':
              return { outcome: 'rate_limited', code: 'E_RATE_LIMITED', retryAfterMs: null };
            case 'reject':
              return { outcome: 'rejected', code: 'E_REJECTED_422' };
            case 'accept_slow': {
              const messageId = accept();
              await new Promise<void>((resume) => waiting.push(resume));
              return { outcome: 'accepted', messageId };
            }
            case 'hang':
              await new Promise<void>((resume) => {
                waiting.push(resume);
                signal.addEventListener('abort', () => resume());
              });
              return { outcome: 'ambiguous', code: 'E_TIMEOUT' };
          }
        } finally {
          inProgress.delete(key);
        }
      },
    },
  };
  return provider;
}
