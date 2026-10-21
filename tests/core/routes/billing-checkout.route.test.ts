import { describe, it, expect, vi, beforeEach } from 'vitest';
import { jsonRequest, makeChain, makeSupabase, fakeUser, readJson } from '../../helpers/mocks';

vi.mock('@/lib/supabase/server', () => ({ getUser: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/payments/razorpay', () => ({
  createSubscription: vi.fn(),
  createMakeoverOrder: vi.fn(),
  createContentPackOrder: vi.fn(),
}));
vi.mock('@/lib/ratelimit', () => ({ rateLimit: vi.fn() }));
vi.mock('@/lib/analytics', () => ({ EVENTS: { upgradeClicked: 'upgrade_clicked' }, captureServer: vi.fn() }));
vi.mock('@/lib/observability', () => ({ log: { error: vi.fn() }, captureException: vi.fn() }));

import { POST } from '@/app/api/billing/checkout/route';
import { getUser } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createContentPackOrder, createMakeoverOrder, createSubscription } from '@/lib/payments/razorpay';
import { rateLimit } from '@/lib/ratelimit';

const url = 'http://test/api/billing/checkout';
let subs: ReturnType<typeof makeChain>;
let otp: ReturnType<typeof makeChain>;

beforeEach(() => {
  vi.mocked(getUser).mockResolvedValue(fakeUser() as never);
  vi.mocked(rateLimit).mockResolvedValue({ success: true, remaining: 9 });
  subs = makeChain();
  otp = makeChain();
  vi.mocked(createAdminClient).mockReturnValue(makeSupabase({ tables: { subscriptions: subs, one_time_purchases: otp } }) as never);
  vi.mocked(createSubscription).mockResolvedValue({ id: 'sub_1' } as never);
  vi.mocked(createMakeoverOrder).mockResolvedValue({ id: 'order_m' } as never);
  vi.mocked(createContentPackOrder).mockResolvedValue({ id: 'order_p' } as never);
});

describe('POST /api/billing/checkout', () => {
  it('401 when signed out', async () => {
    vi.mocked(getUser).mockResolvedValue(null);
    expect((await POST(jsonRequest(url, { plan: 'plus' }))).status).toBe(401);
  });

  it('429 when rate limited', async () => {
    vi.mocked(rateLimit).mockResolvedValue({ success: false, remaining: 0 });
    expect((await POST(jsonRequest(url, { plan: 'plus' }))).status).toBe(429);
  });

  it('400 for free, sales-led or unknown plans and bad JSON', async () => {
    for (const plan of ['free', 'newsroom', 'telco', 'solo', undefined]) {
      expect((await POST(jsonRequest(url, { plan }))).status).toBe(400);
    }
    const bad = new Request(url, { method: 'POST', body: '{' });
    expect((await POST(bad)).status).toBe(400);
    expect(createSubscription).not.toHaveBeenCalled();
  });

  it('creates a subscription and records it for the webhook', async () => {
    const { status, body } = await readJson(await POST(jsonRequest(url, { plan: 'pro', billing: 'yearly' })));
    expect(status).toBe(200);
    expect(body).toMatchObject({ type: 'subscription', subscriptionId: 'sub_1' });
    expect(createSubscription).toHaveBeenCalledWith('pro', 'yearly', 'user-1');
    expect(subs.insert).toHaveBeenCalledWith({ user_id: 'user-1', plan: 'pro', rzp_subscription_id: 'sub_1', status: 'created' });
  });

  it('creates one-time orders (makeover, content pack with credits)', async () => {
    const m = await readJson(await POST(jsonRequest(url, { kind: 'makeover' })));
    expect(m.body).toMatchObject({ type: 'order', orderId: 'order_m', amount: 19900 });
    const p = await readJson(await POST(jsonRequest(url, { kind: 'content_pack' })));
    expect(p.body).toMatchObject({ type: 'order', orderId: 'order_p', amount: 4900 });
    expect(otp.insert).toHaveBeenCalledWith(expect.objectContaining({ kind: 'content_pack', credits: 10, status: 'created' }));
    expect(otp.insert).toHaveBeenCalledWith(expect.objectContaining({ kind: 'makeover', credits: 0 }));
  });

  it('500 when Razorpay fails', async () => {
    vi.mocked(createSubscription).mockRejectedValue(new Error('rzp down'));
    expect((await POST(jsonRequest(url, { plan: 'plus' }))).status).toBe(500);
  });
});
