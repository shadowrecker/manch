import { describe, it, expect, vi } from 'vitest';
import { makeSupabase, makeChain } from '../../helpers/mocks';

// Deal-settlement assertions carried over from CreatorStack's
// tests/routes/razorpay-webhook.route.test.ts. In Manch the webhook route is
// core-owned (app/api/razorpay/webhook, tested by the core owner) and calls
// recordPaymentCaptured(dealId, payment.id) for `payment_link.paid` and for
// `payment.captured` with notes.deal_id — so the Deals side of that contract is
// tested here, directly against recordPaymentCaptured.

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/modules/deals/payments/route', () => ({ createDealPaymentLink: vi.fn() }));
vi.mock('@/lib/analytics', () => ({
  captureServer: vi.fn(),
  EVENTS: { dealCreated: 'deal_created', dealWon: 'deal_won', commissionCollected: 'commission_collected' },
}));

import { recordPaymentCaptured } from '@/lib/modules/deals/services/deals';
import { createAdminClient } from '@/lib/supabase/admin';
import { captureServer } from '@/lib/analytics';

const mAdmin = vi.mocked(createAdminClient);

function withDeal(row: unknown) {
  const deals = makeChain({ data: row, error: null });
  mAdmin.mockReturnValue(makeSupabase({ tables: { deals } }) as never);
  return deals;
}

describe('recordPaymentCaptured — webhook settlement contract', () => {
  it('payment_link.paid: settles the deal from notes.deal_id and stores the payment id', async () => {
    const deals = withDeal({ id: 'd1', user_id: 'u1', value_paise: 2500000, commission_status: 'pending' });
    const out = await recordPaymentCaptured('d1', 'pay_9');
    expect(out).toEqual({ status: 'collected', dealId: 'd1' });
    expect(deals.eq).toHaveBeenCalledWith('id', 'd1');
    const upd = deals.update.mock.calls[0][0] as { rzp_transfer_id: string; closed_at: string; commission_paise: number };
    expect(upd.rzp_transfer_id).toBe('pay_9');
    expect(upd.commission_paise).toBe(125000); // 5% of ₹25,000
    expect(typeof upd.closed_at).toBe('string');
  });

  it('accepts a null payment id (payment_link.paid without a payment entity)', async () => {
    const deals = withDeal({ id: 'd1', user_id: 'u1', value_paise: 1000000, commission_status: 'pending' });
    expect((await recordPaymentCaptured('d1', null)).status).toBe('collected');
    expect((deals.update.mock.calls[0][0] as { rzp_transfer_id: string | null }).rzp_transfer_id).toBeNull();
  });

  it('emits deal_won + commission_collected for the creator', async () => {
    withDeal({ id: 'd1', user_id: 'u1', value_paise: 2500000, commission_status: 'pending' });
    await recordPaymentCaptured('d1', 'pay_9');
    expect(captureServer).toHaveBeenCalledWith('deal_won', 'u1', expect.objectContaining({ deal_id: 'd1' }));
    expect(captureServer).toHaveBeenCalledWith('commission_collected', 'u1', expect.objectContaining({ commission_paise: 125000 }));
  });

  it('is idempotent across re-delivered events (payment.captured after payment_link.paid)', async () => {
    const deals = withDeal({ id: 'd1', user_id: 'u1', value_paise: 2500000, commission_status: 'collected' });
    expect((await recordPaymentCaptured('d1', 'pay_9')).status).toBe('already_collected');
    expect(deals.update).not.toHaveBeenCalled();
    expect(captureServer).not.toHaveBeenCalled();
  });

  it('propagates DB failures so the webhook returns 500 and Razorpay retries', async () => {
    const deals = makeChain({ data: null, error: null });
    deals.maybeSingle.mockRejectedValue(new Error('db down'));
    mAdmin.mockReturnValue(makeSupabase({ tables: { deals } }) as never);
    await expect(recordPaymentCaptured('d1', 'pay_9')).rejects.toThrow('db down');
  });
});
