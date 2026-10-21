import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeSupabase, makeChain } from '../../helpers/mocks';

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/modules/deals/instagram/metrics', () => ({ fetchAndSnapshot: vi.fn() }));

import { refreshConnectedMetrics } from '@/lib/modules/deals/services/metrics-refresh';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchAndSnapshot } from '@/lib/modules/deals/instagram/metrics';

const mAdmin = vi.mocked(createAdminClient);
const mSnap = vi.mocked(fetchAndSnapshot);

function withConnections(rows: { user_id: string }[]) {
  const conns = makeChain({ data: rows, error: null });
  mAdmin.mockReturnValue(makeSupabase({ tables: { instagram_connections: conns } }) as never);
}

beforeEach(() => mSnap.mockReset());

describe('refreshConnectedMetrics', () => {
  it('refreshes every connected creator', async () => {
    withConnections([{ user_id: 'u1' }, { user_id: 'u2' }, { user_id: 'u3' }]);
    mSnap.mockResolvedValue();
    const summary = await refreshConnectedMetrics();
    expect(summary).toEqual({ total: 3, refreshed: 3, failed: 0 });
    expect(mSnap).toHaveBeenCalledTimes(3);
  });

  it('counts failures without aborting the batch', async () => {
    withConnections([{ user_id: 'u1' }, { user_id: 'u2' }]);
    mSnap.mockResolvedValueOnce().mockRejectedValueOnce(new Error('token expired'));
    const summary = await refreshConnectedMetrics();
    expect(summary).toEqual({ total: 2, refreshed: 1, failed: 1 });
  });

  it('is a no-op when no accounts are connected', async () => {
    withConnections([]);
    const summary = await refreshConnectedMetrics();
    expect(summary).toEqual({ total: 0, refreshed: 0, failed: 0 });
    expect(mSnap).not.toHaveBeenCalled();
  });
});
