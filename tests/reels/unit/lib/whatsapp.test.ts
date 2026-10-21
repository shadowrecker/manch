import { describe, it, expect, vi, afterEach } from 'vitest';
import crypto from 'node:crypto';

async function loadVerify(env: Record<string, string> = {}) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  return import('@/lib/whatsapp/verify');
}
async function loadClient(env: Record<string, string> = {}) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  return import('@/lib/whatsapp/client');
}
async function loadReelsWhatsapp(env: Record<string, string> = {}) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  return import('@/lib/modules/reels/whatsapp');
}
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('whatsapp verify', () => {
  it('verifyWebhookGet echoes the challenge only when the token matches', async () => {
    const { verifyWebhookGet } = await loadVerify({ DIALOG360_WEBHOOK_SECRET: 'tok' });
    const ok = new URLSearchParams('hub.mode=subscribe&hub.verify_token=tok&hub.challenge=123');
    expect(verifyWebhookGet(ok)).toBe('123');
    expect(verifyWebhookGet(new URLSearchParams('hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=123'))).toBeNull();
  });
  it('verifyWebhookGet returns null when no secret configured', async () => {
    const { verifyWebhookGet } = await loadVerify({ DIALOG360_WEBHOOK_SECRET: '' });
    expect(verifyWebhookGet(new URLSearchParams('hub.mode=subscribe&hub.verify_token=&hub.challenge=1'))).toBeNull();
  });
  it('verifySignature accepts a correct sha256 HMAC, rejects others', async () => {
    const secret = 'wh';
    const { verifySignature } = await loadVerify({ DIALOG360_WEBHOOK_SECRET: secret });
    const body = '{"x":1}';
    const good = 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
    expect(await verifySignature(body, good)).toBe(true);
    expect(await verifySignature(body, 'sha256=deadbeef')).toBe(false);
    expect(await verifySignature(body, null)).toBe(false);
  });
});

describe('whatsapp client', () => {
  it('sendText posts to the 360Dialog messages endpoint with the API key', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { sendText } = await loadClient({ DIALOG360_API_KEY: 'key123' });
    await sendText('+919876543210', 'hello');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/messages$/);
    expect((init.headers as Record<string, string>)['D360-API-KEY']).toBe('key123');
    // The shared core client sends digits-only numbers (Cloud API format).
    expect(JSON.parse(init.body as string)).toMatchObject({ to: '919876543210', type: 'text', text: { body: 'hello' } });
  });

  it('sendText throws without an API key', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const { sendText } = await loadClient({ DIALOG360_API_KEY: '' });
    await expect(sendText('+91', 'x')).rejects.toThrow(/DIALOG360_API_KEY/);
  });

  it('downloadMedia fetches the media URL then the bytes', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ url: 'https://media/x' }), { status: 200 }))
      .mockResolvedValueOnce(new Response('binary', { status: 200, headers: { 'content-type': 'audio/ogg' } }));
    vi.stubGlobal('fetch', fetchMock);
    const { downloadMedia } = await loadClient({ DIALOG360_API_KEY: 'k' });
    const out = await downloadMedia('media-1');
    expect(out.mimeType).toBe('audio/ogg');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('reels sendScript', () => {
  it('sends hook/body/cta + the studio deep link as one text message', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { sendScript } = await loadReelsWhatsapp({ DIALOG360_API_KEY: 'k' });
    await sendScript('+919876543210', { hook: 'हुक', body: 'बॉडी', cta: 'फॉलो' }, 'https://app/reels/studio');
    const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string) as { text: { body: string } };
    expect(body.text.body).toContain('हुक');
    expect(body.text.body).toContain('फॉलो');
    expect(body.text.body).toContain('https://app/reels/studio');
  });
});
