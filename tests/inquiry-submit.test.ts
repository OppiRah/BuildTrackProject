import { afterEach, describe, expect, it, vi } from 'vitest';
import { formProvider } from '../src/config/inquiry.ts';
import { classifyResponse, selectionLabels, sendInquiry, subjectLine } from '../src/lib/inquiry-submit.ts';

const ENDPOINT = 'https://form-test.invalid/f/unit';
const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('classifyResponse', () => {
  it('accepts only the recognised Formspree success shape: a 2xx object with a string next', () => {
    expect(classifyResponse(200, { next: '/thanks', ok: true })).toEqual({ kind: 'accepted' });
    expect(classifyResponse(201, { next: 'https://formspree.io/thanks?language=en' })).toEqual({ kind: 'accepted' });
  });

  it.each([
    ['an empty object', {}],
    ['ok without next', { ok: true }],
    ['a numeric next', { next: 1 }],
    ['a null next', { next: null }],
    ['an object next', { next: { url: '/thanks' } }],
    ['an array next', { next: ['/thanks'] }],
    ['no body', null],
    ['an array body', [{ next: '/thanks' }]],
    ['a string body', 'ok'],
  ])('treats a 2xx with %s as unconfirmed, never as success or definite failure', (_name, body) => {
    expect(classifyResponse(200, body)).toEqual({ kind: 'unconfirmed' });
  });

  it('checks provider errors before a success-looking next, as @formspree/core does', () => {
    expect(classifyResponse(200, { next: '/thanks', error: 'Form not found' })).toEqual({
      kind: 'provider',
      status: 200,
      formErrors: ['Form not found'],
    });
    expect(classifyResponse(200, { next: '/thanks', errors: [] })).toEqual({ kind: 'provider', status: 200, formErrors: [] });
    expect(classifyResponse(200, { next: '/thanks', errors: [{ field: 'email', message: 'should be an email' }] })).toEqual({
      kind: 'rejected',
      fieldErrors: { email: 'should be an email' },
      formErrors: [],
    });
  });

  it('does not accept a string next on a non-2xx status', () => {
    expect(classifyResponse(302, { next: '/thanks' })).toEqual({ kind: 'provider', status: 302, formErrors: [] });
    expect(classifyResponse(500, { next: '/thanks' })).toEqual({ kind: 'provider', status: 500, formErrors: [] });
  });

  it('maps 4xx field errors to known fields and keeps the rest as form errors', () => {
    expect(
      classifyResponse(422, {
        errors: [
          { field: 'email', code: 'TYPE_EMAIL', message: 'should be an email' },
          { field: 'email', message: 'second email message is ignored' },
          { field: 'unknown_field', message: 'is odd' },
          { message: 'Form-level problem' },
          { field: 'name' },
          'not an object',
        ],
      }),
    ).toEqual({
      kind: 'rejected',
      fieldErrors: { email: 'should be an email' },
      formErrors: ['is odd', 'Form-level problem'],
    });
  });

  it('treats 4xx without field errors as a provider failure with its messages', () => {
    expect(classifyResponse(403, { error: 'Form not active', errors: [{ code: 'INACTIVE', message: 'Inactive' }] })).toEqual({
      kind: 'provider',
      status: 403,
      formErrors: ['Inactive', 'Form not active'],
    });
  });

  it('classifies 429 as rate limited and 5xx as provider failure', () => {
    expect(classifyResponse(429, { errors: [{ field: 'email', message: 'x' }] })).toEqual({ kind: 'rate-limited' });
    expect(classifyResponse(500, null)).toEqual({ kind: 'provider', status: 500, formErrors: [] });
    expect(classifyResponse(503, '<html>')).toEqual({ kind: 'provider', status: 503, formErrors: [] });
  });

  it('truncates very long provider messages', () => {
    const result = classifyResponse(400, { error: 'x'.repeat(1000) });
    expect(result.kind === 'provider' && result.formErrors[0]?.length).toBe(300);
  });
});

describe('sendInquiry', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('POSTs the FormData with a JSON Accept header and classifies acceptance', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { next: '/thanks', ok: true }));
    const data = new FormData();
    data.set('name', 'Test');
    const outcome = await sendInquiry(ENDPOINT, data, { timeoutMs: 1000, fetchImpl });
    expect(outcome).toEqual({ kind: 'accepted' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(ENDPOINT);
    expect(init.method).toBe('POST');
    expect(init.body).toBe(data);
    expect(init.headers).toEqual({ Accept: 'application/json' });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('returns a rejected outcome for provider validation errors', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(422, { errors: [{ field: 'email', message: 'should be an email' }] }));
    expect(await sendInquiry(ENDPOINT, new FormData(), { timeoutMs: 1000, fetchImpl })).toMatchObject({
      kind: 'rejected',
      fieldErrors: { email: 'should be an email' },
    });
  });

  it('classifies a non-JSON server error by status alone', async () => {
    const fetchImpl = vi.fn(async () => new Response('Bad gateway', { status: 502 }));
    expect(await sendInquiry(ENDPOINT, new FormData(), { timeoutMs: 1000, fetchImpl })).toEqual({
      kind: 'provider',
      status: 502,
      formErrors: [],
    });
  });

  it('reports a 2xx response without a JSON body as unconfirmed', async () => {
    const fetchImpl = vi.fn(async () => new Response('<html>Thanks</html>', { status: 200 }));
    expect(await sendInquiry(ENDPOINT, new FormData(), { timeoutMs: 1000, fetchImpl })).toEqual({ kind: 'unconfirmed' });
  });

  it('reports a 2xx response with an empty JSON object as unconfirmed', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, {}));
    expect(await sendInquiry(ENDPOINT, new FormData(), { timeoutMs: 1000, fetchImpl })).toEqual({ kind: 'unconfirmed' });
  });

  it('returns a network outcome when fetch rejects', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(await sendInquiry(ENDPOINT, new FormData(), { timeoutMs: 1000, fetchImpl })).toEqual({ kind: 'network' });
  });

  it('times out before headers: aborts and returns a timeout outcome after timeoutMs', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const fetchImpl = vi.fn(
      (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          signal = init?.signal ?? undefined;
          signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        }),
    );
    const pending = sendInquiry(ENDPOINT, new FormData(), { timeoutMs: formProvider.timeoutMs, fetchImpl });
    await vi.advanceTimersByTimeAsync(formProvider.timeoutMs - 1);
    expect(signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toEqual({ kind: 'timeout' });
    expect(signal?.aborted).toBe(true);
  });
});

describe('sendInquiry timeout while reading the body', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  /** A response whose headers arrive (status 200) but whose body stalls until the request is aborted. */
  const stalledBody = (init?: RequestInit) =>
    new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{"ne'));
          init?.signal?.addEventListener('abort', () => controller.error(new DOMException('Aborted', 'AbortError')));
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );

  it('keeps the timeout classification when the body read is aborted after a 2xx status', async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => stalledBody(init));
    const pending = sendInquiry(ENDPOINT, new FormData(), { timeoutMs: 5000, fetchImpl });
    await vi.advanceTimersByTimeAsync(5000);
    expect(await pending).toEqual({ kind: 'timeout' });
  });

  it('classifies a body that fails without a timeout from the status alone', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.error(new TypeError('connection reset'));
            },
          }),
          { status: 200 },
        ),
    );
    expect(await sendInquiry(ENDPOINT, new FormData(), { timeoutMs: 5000, fetchImpl })).toEqual({ kind: 'unconfirmed' });
  });
});

describe('selection labels and subject', () => {
  it('uses allowlisted labels and "Not sure yet" for anything else', () => {
    expect(selectionLabels({ type: 'service', service: 'maintenance-support', plan: 'starter' })).toEqual({
      type: 'Avail a Service',
      service: 'Maintenance and support',
      plan: 'Starter (₱2,990 / month)',
    });
    expect(selectionLabels({ type: '<b>x</b>', service: '', plan: 'gold' })).toEqual({
      type: 'Request',
      service: 'Not sure yet',
      plan: 'Not sure yet',
    });
  });

  it('builds the notification subject from labels only', () => {
    expect(subjectLine({ type: 'demo', service: '', plan: '' })).toBe('BuildTrack: Request a Demo');
    expect(subjectLine({ type: 'quotation', service: 'custom-integration', plan: 'professional' })).toBe(
      'BuildTrack: Request a Quotation (Professional plan, Custom integration and consulting)',
    );
  });
});
