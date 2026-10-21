import { describe, it, expect, vi } from 'vitest';
import { makeSupabase, makeChain } from '../../helpers/mocks';

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));

import {
  getBotUserByWaId,
  getOrCreateBotUser,
  linkBotUser,
  planForBotUser,
  getCheckUsage,
  incrementCheckUsage,
  getRecentChecksForUser,
} from '@/lib/modules/check/queries';
import { createAdminClient } from '@/lib/supabase/admin';

const mAdmin = vi.mocked(createAdminClient);

describe('planForBotUser (Manch plan for Check entitlements)', () => {
  it('uses the linked account’s profile plan', async () => {
    mAdmin.mockReturnValue(makeSupabase({ tables: { profiles: makeChain({ data: { id: 'u1', plan: 'pro' }, error: null }) } }) as never);
    expect(await planForBotUser({ user_id: 'u1', plan: 'free' })).toBe('pro');
  });
  it('falls back to bot_users.plan when the linked profile is missing', async () => {
    mAdmin.mockReturnValue(makeSupabase({ tables: { profiles: makeChain({ data: null, error: null }) } }) as never);
    expect(await planForBotUser({ user_id: 'u1', plan: 'plus' })).toBe('plus');
  });
  it('uses bot_users.plan for an unlinked bot user (no profile lookup)', async () => {
    const sb = makeSupabase();
    mAdmin.mockReturnValue(sb as never);
    expect(await planForBotUser({ user_id: null, plan: 'newsroom' })).toBe('newsroom');
    expect(sb.from).not.toHaveBeenCalled();
  });
  it('normalises unknown/legacy plan values to free', async () => {
    expect(await planForBotUser({ user_id: null, plan: 'personal' })).toBe('free');
  });
});

describe('bot_user queries', () => {
  it('getBotUserByWaId returns the row', async () => {
    mAdmin.mockReturnValue(makeSupabase({ tables: { bot_users: makeChain({ data: { id: 'bu1', wa_id: '9198' }, error: null }) } }) as never);
    expect((await getBotUserByWaId('9198'))?.id).toBe('bu1');
  });

  it('getOrCreateBotUser returns an existing user without inserting', async () => {
    const bu = makeChain({ data: { id: 'bu1', wa_id: '9198' }, error: null });
    mAdmin.mockReturnValue(makeSupabase({ tables: { bot_users: bu } }) as never);
    const out = await getOrCreateBotUser('9198');
    expect(out.id).toBe('bu1');
    expect(bu.insert).not.toHaveBeenCalled();
  });

  it('getOrCreateBotUser inserts on first contact', async () => {
    const bu = makeChain({ data: null, error: null }); // maybeSingle → null (not found)
    bu.single = vi.fn(() => Promise.resolve({ data: { id: 'bu_new', wa_id: '9199' }, error: null })) as never;
    mAdmin.mockReturnValue(makeSupabase({ tables: { bot_users: bu } }) as never);
    const out = await getOrCreateBotUser('9199');
    expect(out.id).toBe('bu_new');
    expect(bu.insert).toHaveBeenCalled();
  });

  it('linkBotUser sets bot_users.user_id', async () => {
    const bu = makeChain({ data: null, error: null });
    mAdmin.mockReturnValue(makeSupabase({ tables: { bot_users: bu } }) as never);
    await linkBotUser('bu1', 'u1');
    expect(bu.update).toHaveBeenCalledWith({ user_id: 'u1' });
    expect(bu.eq).toHaveBeenCalledWith('id', 'bu1');
  });

  it('linkBotUser throws on a DB error', async () => {
    mAdmin.mockReturnValue(makeSupabase({ tables: { bot_users: makeChain({ data: null, error: { message: 'boom' } }) } }) as never);
    await expect(linkBotUser('bu1', 'u1')).rejects.toEqual({ message: 'boom' });
  });
});

describe('metering queries (check_usage)', () => {
  it('getCheckUsage reads the monthly counter from check_usage', async () => {
    const sb = makeSupabase({ tables: { check_usage: makeChain({ data: { checks: 7 }, error: null }) } });
    mAdmin.mockReturnValue(sb as never);
    expect(await getCheckUsage('bu1')).toBe(7);
    expect(sb.from).toHaveBeenCalledWith('check_usage');
  });
  it('getCheckUsage defaults to 0', async () => {
    mAdmin.mockReturnValue(makeSupabase({ tables: { check_usage: makeChain({ data: null, error: null }) } }) as never);
    expect(await getCheckUsage('bu1')).toBe(0);
  });
  it('incrementCheckUsage calls the RPC and returns the new total', async () => {
    const sb = makeSupabase({ rpc: { data: 8, error: null } });
    mAdmin.mockReturnValue(sb as never);
    expect(await incrementCheckUsage('bu1')).toBe(8);
    expect(sb.rpc).toHaveBeenCalledWith('increment_check_usage', expect.objectContaining({ p_bot_user_id: 'bu1', p_by: 1 }));
  });
});

describe('getRecentChecksForUser', () => {
  it('returns [] when the user has no linked bot users', async () => {
    mAdmin.mockReturnValue(makeSupabase({ tables: { bot_users: makeChain({ data: [], error: null }) } }) as never);
    expect(await getRecentChecksForUser('u1')).toEqual([]);
  });
  it('returns checks for the user’s linked bot users', async () => {
    mAdmin.mockReturnValue(
      makeSupabase({
        tables: {
          bot_users: makeChain({ data: [{ id: 'bu1' }], error: null }),
          checks: makeChain({ data: [{ id: 'c1', verdict_label: 'false' }], error: null }),
        },
      }) as never,
    );
    const out = await getRecentChecksForUser('u1');
    expect(out).toHaveLength(1);
    expect(out[0].verdict_label).toBe('false');
  });
});
