import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeSupabase } from '../../helpers/mocks';

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));

import { consumeCredit, grantCredits } from '@/lib/modules/reels/payments/credits';
import { createAdminClient } from '@/lib/supabase/admin';

describe('credits ledger RPCs', () => {
  it('consumeCredit calls consume_credit and returns the new balance', async () => {
    const sb = makeSupabase({ rpc: { data: 4, error: null } });
    vi.mocked(createAdminClient).mockReturnValue(sb as never);
    const bal = await consumeCredit('u1', 'piece-1', 1);
    expect(sb.rpc).toHaveBeenCalledWith('consume_credit', { p_user_id: 'u1', p_amount: 1, p_ref: 'piece-1' });
    expect(bal).toBe(4);
  });

  it('consumeCredit returns -1 when the RPC reports insufficient balance', async () => {
    const sb = makeSupabase({ rpc: { data: -1, error: null } });
    vi.mocked(createAdminClient).mockReturnValue(sb as never);
    expect(await consumeCredit('u1', 'p', 1)).toBe(-1);
  });

  it('grantCredits calls grant_credits and returns the new balance', async () => {
    const sb = makeSupabase({ rpc: { data: 10, error: null } });
    vi.mocked(createAdminClient).mockReturnValue(sb as never);
    const bal = await grantCredits('u1', 10, 'pack_purchase', 'order_1');
    expect(sb.rpc).toHaveBeenCalledWith('grant_credits', {
      p_user_id: 'u1',
      p_amount: 10,
      p_reason: 'pack_purchase',
      p_ref: 'order_1',
    });
    expect(bal).toBe(10);
  });

  it('throws when the RPC errors', async () => {
    const sb = makeSupabase({ rpc: { data: null, error: { message: 'boom' } } });
    vi.mocked(createAdminClient).mockReturnValue(sb as never);
    await expect(consumeCredit('u1', 'p', 1)).rejects.toBeTruthy();
  });
});
