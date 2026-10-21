import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mutable mock env so we can flip Route on/off between tests.
vi.mock('@/lib/env', () => ({
  env: { razorpayRouteEnabled: true, commissionBps: 500 },
  requireEnv: (v: unknown) => v,
}));
const createLink = vi.fn();
vi.mock('@/lib/payments/razorpay', () => ({
  razorpay: () => ({ paymentLink: { create: createLink } }),
}));

import { createDealPaymentLink } from '@/lib/modules/deals/payments/route';
import { env } from '@/lib/env';

beforeEach(() => {
  createLink.mockReset();
  createLink.mockResolvedValue({ id: 'plink_1', short_url: 'https://rzp.io/i/abc' });
  (env as { razorpayRouteEnabled: boolean }).razorpayRouteEnabled = true;
});

describe('createDealPaymentLink', () => {
  it('Route ON + creator account → adds a 95% transfer to the Linked Account', async () => {
    const out = await createDealPaymentLink({ dealId: 'd1', valuePaise: 2500000, brandName: 'Mamaearth', creatorAccountId: 'acc_123' });

    expect(out.routed).toBe(true);
    expect(out.url).toBe('https://rzp.io/i/abc');
    expect(out.split.commissionPaise).toBe(125000);

    const payload = createLink.mock.calls[0][0] as { amount: number; reference_id: string; notes: { deal_id: string }; transfers?: { account: string; amount: number }[] };
    expect(payload.amount).toBe(2500000); // brand pays the full value
    expect(payload.reference_id).toBe('d1');
    expect(payload.notes.deal_id).toBe('d1');
    expect(payload.transfers).toHaveLength(1);
    expect(payload.transfers![0].account).toBe('acc_123');
    expect(payload.transfers![0].amount).toBe(2375000); // creator's 95%
  });

  it('Route ON but no creator account → fallback (no transfers, routed=false)', async () => {
    const out = await createDealPaymentLink({ dealId: 'd2', valuePaise: 1000000, brandName: null, creatorAccountId: null });
    expect(out.routed).toBe(false);
    const payload = createLink.mock.calls[0][0] as { transfers?: unknown };
    expect(payload.transfers).toBeUndefined();
  });

  it('Route OFF → fallback even with an account', async () => {
    (env as { razorpayRouteEnabled: boolean }).razorpayRouteEnabled = false;
    const out = await createDealPaymentLink({ dealId: 'd3', valuePaise: 1000000, brandName: 'X', creatorAccountId: 'acc_9' });
    expect(out.routed).toBe(false);
    const payload = createLink.mock.calls[0][0] as { transfers?: unknown };
    expect(payload.transfers).toBeUndefined();
  });
});
