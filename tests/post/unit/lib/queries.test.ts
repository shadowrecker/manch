import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeSupabase, makeChain } from '@/tests/post/helpers/mocks';
import { monthPeriod } from '@/lib/utils';

// DB query helpers. All read through the service-role admin client, which we
// mock so no live Supabase is touched. We drive behaviour by passing per-table
// chains (via makeChain) into makeSupabase, then assert both the returned value
// AND that the right table/columns/filters were queried.

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));

import { createAdminClient } from '@/lib/supabase/admin';
import {
  getProfile,
  getPlan,
  getUsage,
  incrementUsage,
  getProfileByWhatsapp,
} from '@/lib/db/queries';
import { getActiveVoiceProfile } from '@/lib/modules/post/queries';

// Account + metering helpers come from the shared core (@/lib/db/queries);
// getActiveVoiceProfile is Post-specific (@/lib/modules/post/queries). Post
// meters under usage_counters(user_id, period, metric='posts', used).

const mAdmin = vi.mocked(createAdminClient);

/** Install a fake admin client built from the given makeSupabase options. */
function useSupabase(opts: Parameters<typeof makeSupabase>[0] = {}) {
  const sb = makeSupabase(opts);
  mAdmin.mockReturnValue(sb as never);
  return sb;
}

beforeEach(() => {
  mAdmin.mockReset();
});

describe('getProfile', () => {
  it('returns the profile row for a user', async () => {
    const profile = { id: 'user-1', plan: 'pro', full_name: 'Asha' };
    const chain = makeChain({ data: profile, error: null });
    const sb = useSupabase({ tables: { profiles: chain } });

    const result = await getProfile('user-1');

    expect(result).toEqual(profile);
    expect(sb.from).toHaveBeenCalledWith('profiles');
    expect(chain.select).toHaveBeenCalledWith('*');
    expect(chain.eq).toHaveBeenCalledWith('id', 'user-1');
    expect(chain.maybeSingle).toHaveBeenCalled();
  });

  it('returns null when there is no profile row', async () => {
    useSupabase({ tables: { profiles: makeChain({ data: null, error: null }) } });
    expect(await getProfile('nobody')).toBeNull();
  });
});

describe('getPlan', () => {
  it('returns the plan from the profile row', async () => {
    useSupabase({ tables: { profiles: makeChain({ data: { id: 'user-1', plan: 'team' }, error: null }) } });
    expect(await getPlan('user-1')).toBe('team');
  });

  it('defaults to "free" when the profile has no plan field', async () => {
    useSupabase({ tables: { profiles: makeChain({ data: { id: 'user-1' }, error: null }) } });
    expect(await getPlan('user-1')).toBe('free');
  });

  it('defaults to "free" when there is no profile row at all', async () => {
    useSupabase({ tables: { profiles: makeChain({ data: null, error: null }) } });
    expect(await getPlan('user-1')).toBe('free');
  });
});

describe('getActiveVoiceProfile', () => {
  it('returns the active voice profile, filtering by user_id and is_active', async () => {
    const vp = { id: 'vp-1', user_id: 'user-1', is_active: true };
    const chain = makeChain({ data: vp, error: null });
    const sb = useSupabase({ tables: { voice_profiles: chain } });

    const result = await getActiveVoiceProfile('user-1');

    expect(result).toEqual(vp);
    expect(sb.from).toHaveBeenCalledWith('voice_profiles');
    expect(chain.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(chain.eq).toHaveBeenCalledWith('is_active', true);
    expect(chain.maybeSingle).toHaveBeenCalled();
  });

  it('returns null when there is no active voice profile', async () => {
    useSupabase({ tables: { voice_profiles: makeChain({ data: null, error: null }) } });
    expect(await getActiveVoiceProfile('user-1')).toBeNull();
  });
});

describe("getUsage(userId, 'posts')", () => {
  it("returns the stored 'posts' count for the current period", async () => {
    const chain = makeChain({ data: { used: 7 }, error: null });
    const sb = useSupabase({ tables: { usage_counters: chain } });

    const result = await getUsage('user-1', 'posts');

    expect(result).toBe(7);
    expect(sb.from).toHaveBeenCalledWith('usage_counters');
    expect(chain.select).toHaveBeenCalledWith('used');
    expect(chain.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(chain.eq).toHaveBeenCalledWith('period', monthPeriod());
    expect(chain.eq).toHaveBeenCalledWith('metric', 'posts');
  });

  it('returns 0 when there is no usage row', async () => {
    useSupabase({ tables: { usage_counters: makeChain({ data: null, error: null }) } });
    expect(await getUsage('user-1', 'posts')).toBe(0);
  });

  it('returns 0 when the row has a null/undefined count', async () => {
    useSupabase({ tables: { usage_counters: makeChain({ data: { used: null }, error: null }) } });
    expect(await getUsage('user-1', 'posts')).toBe(0);
  });
});

describe('incrementUsage', () => {
  it('calls the increment_usage RPC with user/period/metric/by and returns the new total', async () => {
    const sb = useSupabase({ rpc: { data: 5, error: null } });

    const result = await incrementUsage('user-1', 'posts', 2);

    expect(result).toBe(5);
    expect(sb.rpc).toHaveBeenCalledWith('increment_usage', {
      p_user_id: 'user-1',
      p_period: monthPeriod(),
      p_metric: 'posts',
      p_by: 2,
    });
  });

  it('defaults the increment amount to 1', async () => {
    const sb = useSupabase({ rpc: { data: 1, error: null } });
    await incrementUsage('user-1', 'posts');
    expect(sb.rpc).toHaveBeenCalledWith(
      'increment_usage',
      expect.objectContaining({ p_by: 1 }),
    );
  });

  it('returns 0 when the RPC yields no data', async () => {
    useSupabase({ rpc: { data: null, error: null } });
    expect(await incrementUsage('user-1', 'posts')).toBe(0);
  });

  it('throws when the RPC returns an error', async () => {
    const err = new Error('rpc boom');
    useSupabase({ rpc: { data: null, error: err } });
    await expect(incrementUsage('user-1', 'posts')).rejects.toBe(err);
  });
});

describe('getProfileByWhatsapp', () => {
  it('resolves a profile by E.164 whatsapp number', async () => {
    const profile = { id: 'user-1', whatsapp_e164: '+919876543210' };
    const chain = makeChain({ data: profile, error: null });
    const sb = useSupabase({ tables: { profiles: chain } });

    const result = await getProfileByWhatsapp('+919876543210');

    expect(result).toEqual(profile);
    expect(sb.from).toHaveBeenCalledWith('profiles');
    expect(chain.eq).toHaveBeenCalledWith('whatsapp_e164', '+919876543210');
    expect(chain.maybeSingle).toHaveBeenCalled();
  });

  it('returns null when no profile matches the number', async () => {
    useSupabase({ tables: { profiles: makeChain({ data: null, error: null }) } });
    expect(await getProfileByWhatsapp('+910000000000')).toBeNull();
  });
});
