import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readJson, fakeUser, makeSupabase, makeChain } from '../helpers/mocks';

// Route handler test — GET /api/post/drafts (RLS via the request-scoped client).

vi.mock('@/lib/supabase/server', () => ({ getUser: vi.fn(), createClient: vi.fn() }));

import { GET } from '@/app/api/post/drafts/route';
import { getUser, createClient } from '@/lib/supabase/server';

const mUser = vi.mocked(getUser);
const mCreate = vi.mocked(createClient);

const DRAFTS = [
  { id: 'd1', body: 'first', status: 'draft', user_id: 'user-1' },
  { id: 'd2', body: 'second', status: 'scheduled', user_id: 'user-1' },
];

let draftsChain: ReturnType<typeof makeChain>;

beforeEach(() => {
  mUser.mockResolvedValue(fakeUser() as never);
  // The query is awaited at `.order(...)`, so the chain's thenable result is the list.
  draftsChain = makeChain({ data: DRAFTS, error: null });
  mCreate.mockReturnValue(makeSupabase({ tables: { drafts: draftsChain } }) as never);
});

describe('GET /api/post/drafts', () => {
  it('401 when unauthenticated', async () => {
    mUser.mockResolvedValue(null as never);
    const { status, body } = await readJson(await GET());
    expect(status).toBe(401);
    expect((body as { error: string }).error).toBe('unauthorized');
    expect(mCreate).not.toHaveBeenCalled();
  });

  it('200 returns { drafts } for the signed-in user, RLS-scoped', async () => {
    const { status, body } = await readJson(await GET());
    expect(status).toBe(200);
    expect((body as { drafts: unknown }).drafts).toEqual(DRAFTS);

    // It queried the drafts table filtered to the user and excluded discarded rows.
    expect(draftsChain.select).toHaveBeenCalled();
    expect(draftsChain.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(draftsChain.neq).toHaveBeenCalledWith('status', 'discarded');
    expect(draftsChain.order).toHaveBeenCalledWith('created_at', { ascending: false });
  });

  it('200 returns an empty array when the query yields null data', async () => {
    draftsChain = makeChain({ data: null, error: null });
    mCreate.mockReturnValue(makeSupabase({ tables: { drafts: draftsChain } }) as never);
    const { status, body } = await readJson(await GET());
    expect(status).toBe(200);
    expect((body as { drafts: unknown }).drafts).toEqual([]);
  });

  it('500 failed_to_load_drafts when the query errors', async () => {
    draftsChain = makeChain({ data: null, error: { message: 'db down' } });
    mCreate.mockReturnValue(makeSupabase({ tables: { drafts: draftsChain } }) as never);
    const { status, body } = await readJson(await GET());
    expect(status).toBe(500);
    expect((body as { error: string }).error).toBe('failed_to_load_drafts');
  });
});
