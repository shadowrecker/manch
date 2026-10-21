import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeSupabase, makeChain } from '../../helpers/mocks';

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));

import { countApiChecks, apiQuota } from '@/lib/modules/check/api/quota';
import { createAdminClient } from '@/lib/supabase/admin';

const mAdmin = vi.mocked(createAdminClient);

function withCount(count: number) {
  const result = { data: null, error: null, count };
  mAdmin.mockReturnValue(makeSupabase({ tables: { checks: makeChain(result) } }) as never);
}

describe('countApiChecks', () => {
  it('returns this month’s count for the key', async () => {
    withCount(42);
    expect(await countApiChecks('k1')).toBe(42);
  });
});

describe('apiQuota', () => {
  beforeEach(() => withCount(10000));
  it('flags exceeded at/over the monthly quota', async () => {
    const q = await apiQuota('k1', 10000);
    expect(q.exceeded).toBe(true);
    expect(q.used).toBe(10000);
  });
  it('is within quota below the limit', async () => {
    withCount(9999);
    expect((await apiQuota('k1', 10000)).exceeded).toBe(false);
  });
});
