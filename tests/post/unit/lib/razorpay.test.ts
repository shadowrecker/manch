import { describe, it, expect, vi, afterEach } from 'vitest';
import crypto from 'node:crypto';

// Mock the Razorpay SDK so the subscription/order wrappers can be tested without
// network. vi.mock is hoisted, so it applies to the dynamic import in load().
const subCreate = vi.fn().mockResolvedValue({ id: 'sub_1' });
const orderCreate = vi.fn().mockResolvedValue({ id: 'order_1' });
vi.mock('razorpay', () => ({
  default: class {
    subscriptions = { create: subCreate };
    orders = { create: orderCreate };
    constructor(public opts: unknown) {}
  },
}));

// EXEMPLAR — env-dependent lib test pattern.
// lib/env builds a const from process.env AT IMPORT, so to vary env per test we
// reset the module registry, stub process.env, then dynamically import. This is
// the canonical way to test signature/secret logic deterministically.

async function load(envOverrides: Record<string, string>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(envOverrides)) vi.stubEnv(k, v);
  return import('@/lib/payments/razorpay');
}

afterEach(() => vi.unstubAllEnvs());

describe('verifyWebhookSignature', () => {
  const body = JSON.stringify({ event: 'subscription.activated' });

  it('accepts a correct HMAC-SHA256 signature', async () => {
    const secret = 'whsec_test_secret';
    const { verifyWebhookSignature } = await load({ RAZORPAY_WEBHOOK_SECRET: secret });
    const sig = crypto.createHmac('sha256', secret).update(body).digest('hex');
    expect(verifyWebhookSignature(body, sig)).toBe(true);
  });

  it('rejects a tampered body', async () => {
    const secret = 'whsec_test_secret';
    const { verifyWebhookSignature } = await load({ RAZORPAY_WEBHOOK_SECRET: secret });
    const sig = crypto.createHmac('sha256', secret).update(body).digest('hex');
    expect(verifyWebhookSignature(body + 'x', sig)).toBe(false);
  });

  it('rejects a null signature', async () => {
    const { verifyWebhookSignature } = await load({ RAZORPAY_WEBHOOK_SECRET: 'whsec_test_secret' });
    expect(verifyWebhookSignature(body, null)).toBe(false);
  });

  it('rejects when the secret is not configured', async () => {
    const { verifyWebhookSignature } = await load({ RAZORPAY_WEBHOOK_SECRET: '' });
    expect(verifyWebhookSignature(body, 'deadbeef')).toBe(false);
  });
});

describe('planFromPlanId / planIdFor', () => {
  const envIds = {
    RZP_PLAN_PLUS_MONTHLY: 'plan_plus_m',
    RZP_PLAN_PLUS_YEARLY: 'plan_plus_y',
    RZP_PLAN_PRO_MONTHLY: 'plan_pro_m',
    RZP_PLAN_TEAM_MONTHLY: 'plan_team_m',
  };

  it('reverse-maps a known plan_id to its plan', async () => {
    const { planFromPlanId } = await load(envIds);
    expect(planFromPlanId('plan_plus_m')).toBe('plus');
    expect(planFromPlanId('plan_pro_m')).toBe('pro');
    expect(planFromPlanId('plan_team_m')).toBe('team');
  });

  it('returns null for an unknown or empty plan_id', async () => {
    const { planFromPlanId } = await load(envIds);
    expect(planFromPlanId('plan_unknown')).toBeNull();
    expect(planFromPlanId('')).toBeNull();
  });

  it('planIdFor resolves the configured id', async () => {
    const { planIdFor } = await load(envIds);
    expect(planIdFor('plus', 'monthly')).toBe('plan_plus_m');
  });

  it('planIdFor throws when the plan id env is missing', async () => {
    const { planIdFor } = await load({ RZP_PLAN_PLUS_MONTHLY: '' });
    expect(() => planIdFor('plus', 'monthly')).toThrow(/RZP_PLAN_PLUS_MONTHLY/);
  });
});

describe('razorpay SDK wrappers', () => {
  const KEYS = { RAZORPAY_KEY_ID: 'rzp_id', RAZORPAY_KEY_SECRET: 'rzp_secret' };

  it('razorpay() throws without a configured key id', async () => {
    const { razorpay } = await load({ RAZORPAY_KEY_ID: '', RAZORPAY_KEY_SECRET: '' });
    expect(() => razorpay()).toThrow(/RAZORPAY_KEY_ID/);
  });

  it('createSubscription monthly bills 12 cycles with the configured plan id', async () => {
    const { createSubscription } = await load({ ...KEYS, RZP_PLAN_PRO_MONTHLY: 'plan_pro_m' });
    const res = await createSubscription('pro', 'monthly');
    expect(subCreate).toHaveBeenCalledWith({
      plan_id: 'plan_pro_m',
      total_count: 12,
      customer_notify: 1,
    });
    expect(res).toEqual({ id: 'sub_1' });
  });

  it('createSubscription yearly bills once', async () => {
    const { createSubscription } = await load({ ...KEYS, RZP_PLAN_PLUS_YEARLY: 'plan_plus_y' });
    await createSubscription('plus', 'yearly');
    expect(subCreate).toHaveBeenCalledWith(
      expect.objectContaining({ plan_id: 'plan_plus_y', total_count: 1 }),
    );
  });

  it('createMakeoverOrder creates a ₹199 (19900 paise) INR order', async () => {
    const { createMakeoverOrder } = await load(KEYS);
    const res = await createMakeoverOrder();
    expect(orderCreate).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 19900, currency: 'INR' }),
    );
    expect(res).toEqual({ id: 'order_1' });
  });
});
