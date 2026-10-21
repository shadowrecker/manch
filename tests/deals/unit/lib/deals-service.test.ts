import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeSupabase, makeChain } from '../../helpers/mocks';

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/modules/deals/payments/route', () => ({ createDealPaymentLink: vi.fn() }));
vi.mock('@/lib/analytics', () => ({
  captureServer: vi.fn(),
  EVENTS: { dealCreated: 'deal_created', dealWon: 'deal_won', commissionCollected: 'commission_collected' },
}));

import { createDeal, generateDealPayment, recordPaymentCaptured, NoDealError, NoValueError } from '@/lib/modules/deals/services/deals';
import { createAdminClient } from '@/lib/supabase/admin';
import { createDealPaymentLink } from '@/lib/modules/deals/payments/route';

const mAdmin = vi.mocked(createAdminClient);
const mLink = vi.mocked(createDealPaymentLink);

describe('createDeal', () => {
  it('inserts a pitched deal and returns it', async () => {
    const deals = makeChain({ data: { id: 'd1', value_paise: 2500000, status: 'pitched', commission_status: 'none' }, error: null });
    mAdmin.mockReturnValue(makeSupabase({ tables: { deals } }) as never);
    const out = await createDeal('u1', { brandName: 'Mamaearth', valuePaise: 2500000, deliverables: ['reel'] });
    expect(out.id).toBe('d1');
    const row = deals.insert.mock.calls[0][0] as { user_id: string; brand_name: string; status: string };
    expect(row.user_id).toBe('u1');
    expect(row.brand_name).toBe('Mamaearth');
    expect(row.status).toBe('pitched');
  });
});

describe('generateDealPayment', () => {
  beforeEach(() => {
    mLink.mockResolvedValue({ id: 'plink_1', url: 'https://rzp.io/i/x', routed: true, split: { valuePaise: 2500000, commissionPaise: 125000, creatorPaise: 2375000, bps: 500 } });
  });

  it('throws NoDealError for a missing deal', async () => {
    const deals = makeChain({ data: null, error: null });
    mAdmin.mockReturnValue(makeSupabase({ tables: { deals } }) as never);
    await expect(generateDealPayment('u1', 'missing')).rejects.toBeInstanceOf(NoDealError);
  });

  it('throws NoValueError when the deal has no value', async () => {
    const deals = makeChain({ data: { id: 'd1', value_paise: null }, error: null });
    mAdmin.mockReturnValue(makeSupabase({ tables: { deals } }) as never);
    await expect(generateDealPayment('u1', 'd1')).rejects.toBeInstanceOf(NoValueError);
  });

  it('creates a link, stamps commission pending, and reports KYC need', async () => {
    const deals = makeChain({ data: { id: 'd1', value_paise: 2500000, brand_name: 'Mamaearth', user_id: 'u1' }, error: null });
    const payout = makeChain({ data: { rzp_account_id: null }, error: null });
    mAdmin.mockReturnValue(makeSupabase({ tables: { deals, creator_payout_accounts: payout } }) as never);

    const out = await generateDealPayment('u1', 'd1');
    expect(out.url).toBe('https://rzp.io/i/x');
    expect(out.commissionPaise).toBe(125000);
    const upd = deals.update.mock.calls[0][0] as { commission_status: string; rzp_order_id: string };
    expect(upd.commission_status).toBe('pending');
    expect(upd.rzp_order_id).toBe('plink_1');
  });
});

describe('recordPaymentCaptured (idempotent webhook)', () => {
  it('marks a fresh deal collected + paid', async () => {
    const deals = makeChain({ data: { id: 'd1', user_id: 'u1', value_paise: 2500000, commission_status: 'pending' }, error: null });
    mAdmin.mockReturnValue(makeSupabase({ tables: { deals } }) as never);
    const out = await recordPaymentCaptured('d1', 'trf_1');
    expect(out.status).toBe('collected');
    const upd = deals.update.mock.calls[0][0] as { status: string; commission_status: string; rzp_transfer_id: string; commission_paise: number };
    expect(upd.status).toBe('paid');
    expect(upd.commission_status).toBe('collected');
    expect(upd.commission_paise).toBe(125000);
    expect(upd.rzp_transfer_id).toBe('trf_1');
  });

  it('is a no-op when already collected (re-delivered event)', async () => {
    const deals = makeChain({ data: { id: 'd1', user_id: 'u1', value_paise: 2500000, commission_status: 'collected' }, error: null });
    mAdmin.mockReturnValue(makeSupabase({ tables: { deals } }) as never);
    const out = await recordPaymentCaptured('d1', 'trf_2');
    expect(out.status).toBe('already_collected');
    expect(deals.update).not.toHaveBeenCalled();
  });

  it('reports unknown_deal when the deal is missing', async () => {
    const deals = makeChain({ data: null, error: null });
    mAdmin.mockReturnValue(makeSupabase({ tables: { deals } }) as never);
    const out = await recordPaymentCaptured('ghost', null);
    expect(out.status).toBe('unknown_deal');
  });
});
