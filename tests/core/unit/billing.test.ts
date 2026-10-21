import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeChain, makeSupabase } from '../../helpers/mocks';

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/payments/razorpay', () => ({ planFromPlanId: vi.fn() }));
vi.mock('@/lib/modules/reels/payments/credits', () => ({ grantCredits: vi.fn() }));
vi.mock('@/lib/analytics', () => ({
  EVENTS: { subscriptionActivated: 'subscription_activated', contentPackPurchased: 'content_pack_purchased' },
  captureServer: vi.fn(),
}));
vi.mock('@/lib/observability', () => ({ log: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));

import { activateSubscription, completeOneTimePurchase, endSubscription, haltSubscription, isoFromUnix } from '@/lib/billing';
import { planFromPlanId } from '@/lib/payments/razorpay';
import { grantCredits } from '@/lib/modules/reels/payments/credits';
import { captureServer } from '@/lib/analytics';

const mPlan = vi.mocked(planFromPlanId);
const mGrant = vi.mocked(grantCredits);

function admin(tables: Record<string, ReturnType<typeof makeChain>>) {
  return makeSupabase({ tables }) as never;
}

beforeEach(() => {
  mPlan.mockReturnValue(null);
  mGrant.mockResolvedValue(10);
});

describe('activateSubscription', () => {
  it('flips the profile to the plan derived from the verified plan_id', async () => {
    mPlan.mockReturnValue('pro');
    const subs = makeChain({ data: { id: 'row', user_id: 'u1', plan: 'plus' }, error: null });
    const profiles = makeChain();
    await activateSubscription('sub_1', 'plan_pro', '2027-01-01T00:00:00.000Z', admin({ subscriptions: subs, profiles }));
    expect(subs.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'active', plan: 'pro' }));
    expect(profiles.update).toHaveBeenCalledWith(expect.objectContaining({ plan: 'pro' }));
    expect(captureServer).toHaveBeenCalledWith('subscription_activated', 'u1', { plan: 'pro' });
  });

  it('falls back to the plan recorded at checkout', async () => {
    const subs = makeChain({ data: { id: 'row', user_id: 'u1', plan: 'team' }, error: null });
    const profiles = makeChain();
    await activateSubscription('sub_1', 'unknown', null, admin({ subscriptions: subs, profiles }));
    expect(profiles.update).toHaveBeenCalledWith(expect.objectContaining({ plan: 'team' }));
  });

  it('does nothing for an unknown subscription', async () => {
    const subs = makeChain({ data: null, error: null });
    const profiles = makeChain();
    await activateSubscription('nope', null, null, admin({ subscriptions: subs, profiles }));
    expect(subs.update).not.toHaveBeenCalled();
    expect(profiles.update).not.toHaveBeenCalled();
  });
});

describe('haltSubscription / endSubscription', () => {
  it('halts without downgrading', async () => {
    const subs = makeChain();
    const profiles = makeChain();
    await haltSubscription('s', admin({ subscriptions: subs, profiles }));
    expect(subs.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'halted' }));
    expect(profiles.update).not.toHaveBeenCalled();
  });

  it('keeps access until the paid period ends', async () => {
    const subs = makeChain({ data: { id: 'row', user_id: 'u1' }, error: null });
    const profiles = makeChain();
    const future = new Date(Date.now() + 86_400_000).toISOString();
    await endSubscription('s', 'cancelled', future, admin({ subscriptions: subs, profiles }));
    expect(subs.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'cancelled', cancel_at_period_end: true }));
    expect(profiles.update).not.toHaveBeenCalled();
  });

  it('downgrades to free once the period has lapsed', async () => {
    const subs = makeChain({ data: { id: 'row', user_id: 'u1' }, error: null });
    const profiles = makeChain();
    await endSubscription('s', 'completed', null, admin({ subscriptions: subs, profiles }));
    expect(profiles.update).toHaveBeenCalledWith(expect.objectContaining({ plan: 'free' }));
  });
});

describe('completeOneTimePurchase', () => {
  it('claims a content pack and grants its credits exactly once', async () => {
    const otp = makeChain({ data: { id: 'p1', user_id: 'u1', kind: 'content_pack', credits: 10 }, error: null });
    expect(await completeOneTimePurchase('order_1', 'pay_1', admin({ one_time_purchases: otp }))).toBe('paid');
    expect(otp.update).toHaveBeenCalledWith({ status: 'paid', rzp_payment_id: 'pay_1' });
    expect(otp.neq).toHaveBeenCalledWith('status', 'paid');
    expect(mGrant).toHaveBeenCalledWith('u1', 10, 'pack_purchase', 'order_1');
  });

  it('marks a makeover paid without granting credits', async () => {
    const otp = makeChain({ data: { id: 'p1', user_id: 'u1', kind: 'makeover', credits: 0 }, error: null });
    expect(await completeOneTimePurchase('order_1', 'pay_1', admin({ one_time_purchases: otp }))).toBe('paid');
    expect(mGrant).not.toHaveBeenCalled();
  });

  it('a retried delivery cannot double-grant', async () => {
    // Conditional update matched nothing, but the order exists → already paid.
    let call = 0;
    const otp = makeChain();
    otp.maybeSingle = vi.fn(() => Promise.resolve(call++ === 0 ? { data: null, error: null } : { data: { id: 'p1' }, error: null }));
    expect(await completeOneTimePurchase('order_1', 'pay_1', admin({ one_time_purchases: otp }))).toBe('already_paid');
    expect(mGrant).not.toHaveBeenCalled();
  });

  it('reports unknown orders', async () => {
    const otp = makeChain({ data: null, error: null });
    expect(await completeOneTimePurchase('order_x', null, admin({ one_time_purchases: otp }))).toBe('unknown_order');
  });

  it('releases the claim if granting credits fails, so a retry can finish', async () => {
    mGrant.mockRejectedValueOnce(new Error('rpc down'));
    const otp = makeChain({ data: { id: 'p1', user_id: 'u1', kind: 'content_pack', credits: 10 }, error: null });
    await expect(completeOneTimePurchase('order_1', 'pay_1', admin({ one_time_purchases: otp }))).rejects.toThrow('rpc down');
    expect(otp.update).toHaveBeenLastCalledWith({ status: 'created' });
  });
});

describe('isoFromUnix', () => {
  it('converts seconds and passes through empties', () => {
    expect(isoFromUnix(0)).toBeNull();
    expect(isoFromUnix(null)).toBeNull();
    expect(isoFromUnix(1)).toBe('1970-01-01T00:00:01.000Z');
  });
});
