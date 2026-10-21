import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'node:crypto';

// env is evaluated at import → stub the secret BEFORE importing the module.
const SECRET = 'whsec_test_123';

async function loadVerify() {
  vi.resetModules();
  vi.stubEnv('RAZORPAY_WEBHOOK_SECRET', SECRET);
  const mod = await import('@/lib/payments/razorpay');
  return mod.verifyWebhookSignature;
}

function sign(body: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

beforeEach(() => vi.unstubAllEnvs());
afterEach(() => vi.unstubAllEnvs());

describe('verifyWebhookSignature', () => {
  const body = JSON.stringify({ event: 'payment_link.paid', payload: {} });

  it('accepts a correctly-signed body', async () => {
    const verify = await loadVerify();
    expect(verify(body, sign(body, SECRET))).toBe(true);
  });

  it('rejects a wrong signature', async () => {
    const verify = await loadVerify();
    expect(verify(body, sign(body, 'wrong-secret'))).toBe(false);
  });

  it('rejects a tampered body', async () => {
    const verify = await loadVerify();
    const sig = sign(body, SECRET);
    expect(verify(body + ' ', sig)).toBe(false);
  });

  it('rejects a missing signature', async () => {
    const verify = await loadVerify();
    expect(verify(body, null)).toBe(false);
  });

  it('fails closed when no webhook secret is configured', async () => {
    vi.resetModules();
    vi.stubEnv('RAZORPAY_WEBHOOK_SECRET', '');
    const { verifyWebhookSignature } = await import('@/lib/payments/razorpay');
    expect(verifyWebhookSignature(body, sign(body, SECRET))).toBe(false);
  });
});
