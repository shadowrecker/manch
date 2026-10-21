import { describe, it, expect, vi, afterEach } from 'vitest';
import crypto from 'node:crypto';

// The shared core Razorpay client (Reels content packs are sold through it).
const subCreate = vi.fn().mockResolvedValue({ id: 'sub_1' });
const orderCreate = vi.fn().mockResolvedValue({ id: 'order_1' });
vi.mock('razorpay', () => ({
  default: class {
    subscriptions = { create: subCreate };
    orders = { create: orderCreate };
    constructor(public opts: unknown) {}
  },
}));

async function load(envOverrides: Record<string, string>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(envOverrides)) vi.stubEnv(k, v);
  return import('@/lib/payments/razorpay');
}
afterEach(() => vi.unstubAllEnvs());

describe('verifyWebhookSignature', () => {
  const body = JSON.stringify({ event: 'subscription.activated' });
  it('accepts a correct HMAC', async () => {
    const { verifyWebhookSignature } = await load({ RAZORPAY_WEBHOOK_SECRET: 'whsec' });
    const sig = crypto.createHmac('sha256', 'whsec').update(body).digest('hex');
    expect(verifyWebhookSignature(body, sig)).toBe(true);
  });
  it('rejects a tampered body / null sig / missing secret', async () => {
    const { verifyWebhookSignature } = await load({ RAZORPAY_WEBHOOK_SECRET: 'whsec' });
    const sig = crypto.createHmac('sha256', 'whsec').update(body).digest('hex');
    expect(verifyWebhookSignature(body + 'x', sig)).toBe(false);
    expect(verifyWebhookSignature(body, null)).toBe(false);
    const m2 = await load({ RAZORPAY_WEBHOOK_SECRET: '' });
    expect(m2.verifyWebhookSignature(body, 'deadbeef')).toBe(false);
  });
});

describe('plan mapping', () => {
  const ids = {
    RZP_PLAN_PLUS_MONTHLY: 'p_plus_m',
    RZP_PLAN_PRO_MONTHLY: 'p_pro_m',
    RZP_PLAN_TEAM_YEARLY: 'p_team_y',
  };
  it('planFromPlanId reverse-maps', async () => {
    const { planFromPlanId } = await load(ids);
    expect(planFromPlanId('p_plus_m')).toBe('plus');
    expect(planFromPlanId('p_pro_m')).toBe('pro');
    expect(planFromPlanId('p_team_y')).toBe('team');
    expect(planFromPlanId('p_unknown')).toBeNull();
  });
  it('planIdFor resolves / throws when missing', async () => {
    const { planIdFor } = await load(ids);
    expect(planIdFor('plus', 'monthly')).toBe('p_plus_m');
    expect(() => planIdFor('plus', 'yearly')).toThrow(/RZP_PLAN_PLUS_YEARLY/);
  });
});

describe('SDK wrappers', () => {
  const KEYS = { RAZORPAY_KEY_ID: 'k', RAZORPAY_KEY_SECRET: 's' };
  it('createSubscription monthly=12 cycles, yearly=1', async () => {
    const { createSubscription } = await load({ ...KEYS, RZP_PLAN_PLUS_MONTHLY: 'p_p_m', RZP_PLAN_PRO_YEARLY: 'p_pr_y' });
    await createSubscription('plus', 'monthly');
    expect(subCreate).toHaveBeenCalledWith(expect.objectContaining({ plan_id: 'p_p_m', total_count: 12 }));
    await createSubscription('pro', 'yearly');
    expect(subCreate).toHaveBeenCalledWith(expect.objectContaining({ plan_id: 'p_pr_y', total_count: 1 }));
  });
  it('createContentPackOrder is a ₹49 INR order', async () => {
    const { createContentPackOrder } = await load(KEYS);
    await createContentPackOrder();
    expect(orderCreate).toHaveBeenCalledWith(expect.objectContaining({ amount: 4900, currency: 'INR' }));
  });
});
