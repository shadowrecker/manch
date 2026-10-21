import { describe, it, expect, vi, afterEach } from 'vitest';
import crypto from 'node:crypto';

// env-dependent: lib/env snapshots process.env at import, so reset + stub + load.
async function load(envOverrides: Record<string, string> = {}) {
  vi.resetModules();
  for (const [k, v] of Object.entries(envOverrides)) vi.stubEnv(k, v);
  return import('@/lib/whatsapp/verify');
}

afterEach(() => vi.unstubAllEnvs());

const SECRET = 'wh_secret_123';

describe('verifyWebhookGet', () => {
  it('returns the challenge on a valid subscribe handshake', async () => {
    const { verifyWebhookGet } = await load({ DIALOG360_WEBHOOK_SECRET: SECRET });
    const params = new URLSearchParams({
      'hub.mode': 'subscribe',
      'hub.verify_token': SECRET,
      'hub.challenge': 'challenge-42',
    });
    expect(verifyWebhookGet(params)).toBe('challenge-42');
  });

  it('returns null when the verify_token does not match the secret', async () => {
    const { verifyWebhookGet } = await load({ DIALOG360_WEBHOOK_SECRET: SECRET });
    const params = new URLSearchParams({
      'hub.mode': 'subscribe',
      'hub.verify_token': 'wrong',
      'hub.challenge': 'challenge-42',
    });
    expect(verifyWebhookGet(params)).toBeNull();
  });

  it('returns null when hub.mode is not subscribe', async () => {
    const { verifyWebhookGet } = await load({ DIALOG360_WEBHOOK_SECRET: SECRET });
    const params = new URLSearchParams({
      'hub.mode': 'unsubscribe',
      'hub.verify_token': SECRET,
      'hub.challenge': 'challenge-42',
    });
    expect(verifyWebhookGet(params)).toBeNull();
  });

  it('returns null (fails closed) when the secret is not configured', async () => {
    const { verifyWebhookGet } = await load({ DIALOG360_WEBHOOK_SECRET: '' });
    const params = new URLSearchParams({
      'hub.mode': 'subscribe',
      'hub.verify_token': '',
      'hub.challenge': 'challenge-42',
    });
    expect(verifyWebhookGet(params)).toBeNull();
  });
});

describe('verifySignature', () => {
  const rawBody = JSON.stringify({ entry: [{ id: '1' }] });

  function sign(body: string, secret = SECRET) {
    return crypto.createHmac('sha256', secret).update(body, 'utf8').digest('hex');
  }

  it('accepts a correct sha256= prefixed HMAC', async () => {
    const { verifySignature } = await load({ DIALOG360_WEBHOOK_SECRET: SECRET });
    const header = `sha256=${sign(rawBody)}`;
    await expect(verifySignature(rawBody, header)).resolves.toBe(true);
  });

  it('accepts a bare hex digest without the sha256= prefix', async () => {
    const { verifySignature } = await load({ DIALOG360_WEBHOOK_SECRET: SECRET });
    await expect(verifySignature(rawBody, sign(rawBody))).resolves.toBe(true);
  });

  it('rejects a digest for a tampered body', async () => {
    const { verifySignature } = await load({ DIALOG360_WEBHOOK_SECRET: SECRET });
    const header = `sha256=${sign(rawBody)}`;
    await expect(verifySignature(rawBody + 'x', header)).resolves.toBe(false);
  });

  it('rejects a digest computed with the wrong secret', async () => {
    const { verifySignature } = await load({ DIALOG360_WEBHOOK_SECRET: SECRET });
    const header = `sha256=${sign(rawBody, 'other_secret')}`;
    await expect(verifySignature(rawBody, header)).resolves.toBe(false);
  });

  it('rejects a null signature header', async () => {
    const { verifySignature } = await load({ DIALOG360_WEBHOOK_SECRET: SECRET });
    await expect(verifySignature(rawBody, null)).resolves.toBe(false);
  });

  it('rejects when the secret is not configured', async () => {
    const { verifySignature } = await load({ DIALOG360_WEBHOOK_SECRET: '' });
    await expect(verifySignature(rawBody, `sha256=${sign(rawBody)}`)).resolves.toBe(false);
  });

  it('rejects a malformed (non-hex / wrong-length) signature', async () => {
    const { verifySignature } = await load({ DIALOG360_WEBHOOK_SECRET: SECRET });
    await expect(verifySignature(rawBody, 'sha256=zzzz')).resolves.toBe(false);
  });

  it('rejects an empty signature value', async () => {
    const { verifySignature } = await load({ DIALOG360_WEBHOOK_SECRET: SECRET });
    await expect(verifySignature(rawBody, 'sha256=')).resolves.toBe(false);
  });
});
