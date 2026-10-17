// Manual email release mode (docs/PROPOSAL_QUOTATION_WORKFLOW.md §18, "Manual email release mode").
// BuildTrack sends no email: on the owner page the owner prepares the customer invitation (a mailto
// link, copyable text and the bare link) and sends it from their own email account. Pure.
//
// The invitation text is the same as the automatic quotation email (email-templates.ts), so both
// modes say the same thing. It contains the customer's link, so it exists only inside an
// authenticated owner response (no-store); it is never stored or logged.

import { quotationEmail, type QuotationSnapshot } from './email-templates.ts';

/** "resend" is the retained automatic mode; anything else (including unset) is manual email mode. */
export const manualEmailMode = (env: { EMAIL_MODE?: string }) => env.EMAIL_MODE !== 'resend';

export interface Invitation {
  to: string;
  subject: string;
  text: string;
  link: string;
  mailto: string;
}

/**
 * A mailto: URI (RFC 6068): the address with only reserved characters percent-encoded (a plain "@"
 * is kept, as some mail apps reject "%40"), and subject and body percent-encoded as UTF-8, with
 * line breaks as CRLF ("%0D%0A"), never "+" for spaces.
 */
export function mailtoHref(to: string, subject: string, body: string): string {
  const address = encodeURIComponent(to).replace(/%40/g, '@');
  const encode = (value: string) => encodeURIComponent(value.replace(/\r?\n/g, '\r\n'));
  return `mailto:${address}?subject=${encode(subject)}&body=${encode(body)}`;
}

export function buildInvitation(publicOrigin: string, quote: QuotationSnapshot, linkToken: string): Invitation {
  const message = quotationEmail({ from: '', ownerEmail: '', ownerOrigin: '', publicOrigin }, quote, linkToken);
  return {
    to: message.to,
    subject: message.subject,
    text: message.text,
    link: `${publicOrigin}/quote/#t=${linkToken}`,
    mailto: mailtoHref(message.to, message.subject, message.text),
  };
}
