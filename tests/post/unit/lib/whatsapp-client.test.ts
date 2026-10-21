import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

// env-dependent: lib/env snapshots process.env at import. Reset + stub + load
// so the API key / base url come from the env we set per test.
async function load(envOverrides: Record<string, string> = {}) {
  vi.resetModules();
  for (const [k, v] of Object.entries(envOverrides)) vi.stubEnv(k, v);
  return import('@/lib/whatsapp/client');
}

const FULL_ENV = {
  DIALOG360_API_KEY: 'api-key-1',
  DIALOG360_BASE_URL: 'https://waba-v2.360dialog.io',
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

describe('sendText', () => {
  it('POSTs to /messages with the D360-API-KEY header and a whatsapp text body', async () => {
    const { sendText } = await load(FULL_ENV);
    vi.mocked(fetch).mockResolvedValue(new Response('{}', { status: 200 }));

    await sendText('+91 98765 43210', 'hi there');

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe('https://waba-v2.360dialog.io/messages');
    expect(init?.method).toBe('POST');
    const headers = init?.headers as Record<string, string>;
    expect(headers['D360-API-KEY']).toBe('api-key-1');
    expect(headers['Content-Type']).toBe('application/json');

    const body = JSON.parse(init?.body as string);
    expect(body.messaging_product).toBe('whatsapp');
    expect(body.recipient_type).toBe('individual');
    expect(body.type).toBe('text');
    // normaliseE164 strips non-digits, then the leading + is removed -> digits only.
    expect(body.to).toBe('919876543210');
    expect(body.text.body).toBe('hi there');
    expect(body.text.preview_url).toBe(true);
  });

  it('truncates body text to 4096 chars', async () => {
    const { sendText } = await load(FULL_ENV);
    vi.mocked(fetch).mockResolvedValue(new Response('{}', { status: 200 }));
    await sendText('+10000000000', 'x'.repeat(5000));
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string);
    expect(body.text.body.length).toBe(4096);
  });

  it('throws on a non-ok response', async () => {
    const { sendText } = await load(FULL_ENV);
    vi.mocked(fetch).mockResolvedValue(new Response('bad', { status: 400 }));
    await expect(sendText('+10000000000', 'hi')).rejects.toThrow(/400/);
  });

  it('throws when DIALOG360_API_KEY is absent (requireEnv)', async () => {
    const { sendText } = await load({ ...FULL_ENV, DIALOG360_API_KEY: '' });
    await expect(sendText('+10000000000', 'hi')).rejects.toThrow(/DIALOG360_API_KEY/);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it('strips a trailing slash from the base url', async () => {
    const { sendText } = await load({ ...FULL_ENV, DIALOG360_BASE_URL: 'https://custom.io/' });
    vi.mocked(fetch).mockResolvedValue(new Response('{}', { status: 200 }));
    await sendText('+10000000000', 'hi');
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe('https://custom.io/messages');
  });
});

// sendDrafts moved out of the shared client into the Post module
// (lib/modules/post/whatsapp.ts), built on the core sendText.
async function loadPostWhatsapp(envOverrides: Record<string, string> = {}) {
  vi.resetModules();
  for (const [k, v] of Object.entries(envOverrides)) vi.stubEnv(k, v);
  return import('@/lib/modules/post/whatsapp');
}

describe('sendDrafts', () => {
  it('sends a single text containing labels, previews and the editor url', async () => {
    const { sendDrafts } = await loadPostWhatsapp(FULL_ENV);
    vi.mocked(fetch).mockResolvedValue(new Response('{}', { status: 200 }));

    await sendDrafts(
      '+10000000000',
      [
        { angle: 'story', body: 'A story body' },
        { angle: 'insight', body: 'An insight body' },
        { angle: 'opinion', body: 'An opinion body' },
      ],
      'https://app.manch.app/edit/123',
    );

    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string);
    const text = body.text.body as string;
    expect(text).toContain('Story');
    expect(text).toContain('Insight');
    expect(text).toContain('Opinion');
    expect(text).toContain('https://app.manch.app/edit/123');
  });
});

describe('downloadMedia', () => {
  it('does two hops and returns the blob + mime type', async () => {
    const { downloadMedia } = await load(FULL_ENV);
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ url: 'https://media.example/abc', mime_type: 'audio/ogg' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(new Response('bytes', { status: 200 }));

    const out = await downloadMedia('media-id-1');
    expect(out.mimeType).toBe('audio/ogg');
    expect(out.data).toBeInstanceOf(Blob);

    const [metaUrl, metaInit] = fetchMock.mock.calls[0];
    expect(metaUrl).toBe('https://waba-v2.360dialog.io/media-id-1');
    expect(metaInit?.method).toBe('GET');
    expect((metaInit?.headers as Record<string, string>)['D360-API-KEY']).toBe('api-key-1');

    const [fileUrl, fileInit] = fetchMock.mock.calls[1];
    expect(fileUrl).toBe('https://media.example/abc');
    expect((fileInit?.headers as Record<string, string>)['D360-API-KEY']).toBe('api-key-1');
  });

  it('falls back to the content-type header when mime_type is absent', async () => {
    const { downloadMedia } = await load(FULL_ENV);
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ url: 'https://media.example/x' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response('bytes', { status: 200, headers: { 'content-type': 'image/png' } }),
      );

    const out = await downloadMedia('m1');
    expect(out.mimeType).toBe('image/png');
  });

  it('throws when the media metadata lookup fails', async () => {
    const { downloadMedia } = await load(FULL_ENV);
    vi.mocked(fetch).mockResolvedValueOnce(new Response('nope', { status: 404 }));
    await expect(downloadMedia('m1')).rejects.toThrow(/404/);
  });

  it('throws when the metadata response has no url', async () => {
    const { downloadMedia } = await load(FULL_ENV);
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ mime_type: 'audio/ogg' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    await expect(downloadMedia('m1')).rejects.toThrow(/missing url/i);
  });

  it('throws when the file download fails', async () => {
    const { downloadMedia } = await load(FULL_ENV);
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ url: 'https://media.example/x' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(new Response('gone', { status: 410 }));
    await expect(downloadMedia('m1')).rejects.toThrow(/410/);
  });

  it('throws when DIALOG360_API_KEY is absent', async () => {
    const { downloadMedia } = await load({ ...FULL_ENV, DIALOG360_API_KEY: '' });
    await expect(downloadMedia('m1')).rejects.toThrow(/DIALOG360_API_KEY/);
  });
});
