import { afterEach, describe, expect, it, vi } from 'vitest';
import { createClickUpProvider } from './clickup';
import { createResendProvider } from './email';
import { createSlackProvider } from './slack';

type FetchMock = ReturnType<typeof vi.fn<(url: string, init?: RequestInit) => Promise<Response>>>;

/**
 * D-044: a slow or unreachable provider must never hang a caller forever - a
 * `health()` call in particular runs synchronously while `/integrations`
 * renders, so an unbounded fetch there blocks the whole page, not just one
 * provider's status.
 */
describe('live provider requests carry a timeout signal', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubFetch(): FetchMock {
    const fetchMock: FetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it('Slack requests carry an AbortSignal', async () => {
    const fetchMock = stubFetch();
    await createSlackProvider('xoxb-test').health();
    expect(fetchMock).toHaveBeenCalled();
    const init = fetchMock.mock.calls[0]?.[1];
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('ClickUp requests carry an AbortSignal', async () => {
    const fetchMock = stubFetch();
    await createClickUpProvider('pk_test').health();
    expect(fetchMock).toHaveBeenCalled();
    const init = fetchMock.mock.calls[0]?.[1];
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('Resend health and send requests both carry an AbortSignal', async () => {
    const fetchMock = stubFetch();
    const provider = createResendProvider('re_test', 'portal@relay.test');

    await provider.health();
    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);

    fetchMock.mockClear();
    await provider.send({
      to: [{ email: 'someone@relay.test' }],
      subject: 'x',
      text: 'x',
      html: '<p>x</p>',
    });
    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it('a connection that never settles still resolves to "not reachable" rather than hanging', async () => {
    // A real hung connection: `fetch` never resolves on its own, exactly
    // like a stalled TCP connection or a DNS lookup that never returns -
    // the only thing that ever settles this call is the signal aborting.
    const hangingFetch: FetchMock = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal!.reason));
        }),
    );
    vi.stubGlobal('fetch', hangingFetch);

    const health = await createSlackProvider('xoxb-test').health();
    expect(health.reachable).toBe(false);
  }, 15_000);
});
