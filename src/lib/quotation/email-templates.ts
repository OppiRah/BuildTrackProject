// Email templates for the job runner (docs/PROPOSAL_QUOTATION_WORKFLOW.md §7, §11). Pure and
// deterministic: the same frozen inputs always give the same message, so a retry sends exactly
// the payload whose hash was recorded at the first attempt. Plain text only.
// - Owner notification and cap warning: no customer details (reference and owner-page link only).
// - Quotation: the snapshot frozen at approval, and the customer link rebuilt from its key
//   version and generation (quote-link.ts). The link is never logged or stored.

import { formatAmount } from './owner-form.ts';
import type { EmailMessage } from './email-transport.ts';

export const TEMPLATE_VERSION = 'v1';

const when = (ms: number) => `${new Date(ms).toISOString().slice(0, 16).replace('T', ' ')} UTC`;
/** Subjects are built only from references and dates, but line breaks are removed regardless. */
const oneLine = (text: string) => text.replace(/[\r\n]+/g, ' ');

export interface Sender {
  from: string;
  ownerEmail: string;
  /** Canonical HTTPS origin of the owner Worker (or loopback HTTP in local tests). */
  ownerOrigin: string;
  /** Canonical origin of the public site, for customer links. */
  publicOrigin: string;
}

export function ownerNotification(sender: Sender, request: { id: string; ref: string; created_at: number }): EmailMessage {
  return {
    from: sender.from,
    to: sender.ownerEmail,
    subject: oneLine(`New quotation request ${request.ref}`),
    text: [
      `A new quotation request, ${request.ref}, was received on ${when(request.created_at)}.`,
      '',
      `Review it on the owner page: ${sender.ownerOrigin}/requests/${request.id}`,
      '',
      'This email contains no customer details. Open the owner page (sign-in required) to see them.',
    ].join('\n'),
  };
}

export function capWarning(sender: Sender, day: string, reachedAt: number): EmailMessage {
  return {
    from: sender.from,
    to: sender.ownerEmail,
    subject: oneLine(`Quotation requests reached the daily limit (${day})`),
    text: [
      `The public quotation form reached its daily limit at ${when(reachedAt)}.`,
      `Further requests on ${day} (UTC) were refused with a message asking visitors to try again tomorrow.`,
      '',
      `Recent requests: ${sender.ownerOrigin}/`,
      '',
      'This is the only warning for that day.',
    ].join('\n'),
  };
}

export interface QuotationSnapshot {
  quoteRef: string;
  requestRef: string;
  name: string;
  email: string;
  scope: string;
  amountCentavos: number;
  expiresAt: number;
}

export function quotationEmail(sender: Sender, quote: QuotationSnapshot, linkToken: string): EmailMessage {
  return {
    from: sender.from,
    to: quote.email,
    subject: oneLine(`Your BuildTrack quotation ${quote.quoteRef}`),
    text: [
      `Hello ${quote.name},`,
      '',
      `BuildTrack has prepared quotation ${quote.quoteRef} for your request ${quote.requestRef}.`,
      '',
      'Scope:',
      quote.scope,
      '',
      `Amount: ${formatAmount(quote.amountCentavos)} (PHP)`,
      `This link works until ${when(quote.expiresAt)}:`,
      `${sender.publicOrigin}/quote/#t=${linkToken}`,
      '',
      'BuildTrack is an academic project. No payment is due, and BuildTrack will never ask you for card or bank details by email.',
      'If you did not request this quotation, you can ignore this email.',
    ].join('\n'),
  };
}
