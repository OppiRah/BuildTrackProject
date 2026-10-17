// The only logger the Workers may use (docs/PROPOSAL_QUOTATION_WORKFLOW.md §4, "Logging").
// Fields are restricted by type to a fixed set of non-personal keys with short code values,
// so request bodies, tokens, addresses, names and error messages cannot be logged.
// A unit test fails if any other Worker file calls console.* directly.

export type LogEvent =
  | 'intake_received'
  | 'intake_duplicate'
  | 'intake_rejected'
  | 'intake_honeypot'
  | 'rate_limited'
  | 'unavailable'
  | 'counters_purged'
  | 'owner_denied'
  | 'owner_refused'
  | 'owner_changed'
  | 'sending_unavailable'
  | 'manual_email_mode'
  | 'email_job'
  | 'email_run'
  | 'retention_run'
  | 'quote_action'
  | 'error';

export interface LogFields {
  route?: 'quotation-requests' | 'unknown' | 'owner' | 'quote';
  /** Owner Worker: which change was attempted or made. */
  action?: 'create' | 'save' | 'approve' | 'resend' | 'revoke' | 'replace' | 'dismiss' | 'delete' | 'mark_sent' | 'view' | 'accept' | 'decline' | 'simulate';
  /** Email jobs: the job's kind and its attempt number. Never addresses, subjects or bodies. */
  kind?: 'owner_notification' | 'owner_cap_warning' | 'quotation';
  attempt?: number;
  /** Email runner summaries: counts only. */
  claimed?: number;
  recovered?: number;
  status?: number;
  /** A fixed code such as E_STORE or E_BODY; never an error message. */
  code?: `E_${string}`;
  source?: 'js' | 'native';
  /** Rows removed by a scheduled cleanup (counters and daily totals). */
  deleted?: number;
}

export type LogSink = (line: string) => void;

// The one place in Worker code that writes to the console.
let sink: LogSink = (line) => console.log(line);

/** Replaces the output (tests capture lines to assert nothing personal is written). */
export function setLogSink(next: LogSink): void {
  sink = next;
}

export function log(event: LogEvent, fields: LogFields = {}): void {
  sink(JSON.stringify({ event, ...fields }));
}
