import { describe, it, expect, vi, beforeEach } from 'vitest';
import { jsonRequest, readJson, fakeUser, makeSupabase, makeChain } from '../helpers/mocks';

// Route handler test — PATCH/DELETE /api/post/drafts/[id].
// The route signature is (req, { params: { id } }); we pass the context object
// explicitly as the second arg.

vi.mock('@/lib/supabase/server', () => ({ getUser: vi.fn(), createClient: vi.fn() }));
vi.mock('@/lib/analytics', () => ({
  captureServer: vi.fn(),
  EVENTS: { draftEdited: 'draft_edited' },
}));

import { PATCH, DELETE } from '@/app/api/post/drafts/[id]/route';
import { getUser, createClient } from '@/lib/supabase/server';
import { captureServer } from '@/lib/analytics';

const mUser = vi.mocked(getUser);
const mCreate = vi.mocked(createClient);
const mCapture = vi.mocked(captureServer);

const ctx = { params: { id: 'draft-9' } };

function patchReq(body: unknown) {
  return jsonRequest('http://test/api/post/drafts/draft-9', body, { method: 'PATCH' }) as never;
}
function delReq() {
  return jsonRequest('http://test/api/post/drafts/draft-9', undefined, { method: 'DELETE' }) as never;
}

let draftsChain: ReturnType<typeof makeChain>;

beforeEach(() => {
  mUser.mockResolvedValue(fakeUser() as never);
  draftsChain = makeChain({ data: null, error: null });
  mCreate.mockReturnValue(makeSupabase({ tables: { drafts: draftsChain } }) as never);
  mCapture.mockResolvedValue(undefined as never);
});

describe('PATCH /api/post/drafts/[id]', () => {
  it('401 when unauthenticated', async () => {
    mUser.mockResolvedValue(null as never);
    const { status, body } = await readJson(await PATCH(patchReq({ body: 'x' }), ctx));
    expect(status).toBe(401);
    expect((body as { error: string }).error).toBe('unauthorized');
    expect(mCreate).not.toHaveBeenCalled();
  });

  it('400 invalid_json on a malformed body', async () => {
    const bad = new Request('http://test/api/post/drafts/draft-9', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: '{not json',
    }) as never;
    const { status, body } = await readJson(await PATCH(bad, ctx));
    expect(status).toBe(400);
    expect((body as { error: string }).error).toBe('invalid_json');
  });

  it('400 body_required when body is an empty string', async () => {
    const { status, body } = await readJson(await PATCH(patchReq({ body: '' }), ctx));
    expect(status).toBe(400);
    expect((body as { error: string }).error).toBe('body_required');
  });

  it('400 invalid_status when status is not editable', async () => {
    const { status, body } = await readJson(await PATCH(patchReq({ status: 'published' }), ctx));
    expect(status).toBe(400);
    expect((body as { error: string }).error).toBe('invalid_status');
  });

  it('400 nothing_to_update when no body or status is provided', async () => {
    const { status, body } = await readJson(await PATCH(patchReq({ foo: 'bar' }), ctx));
    expect(status).toBe(400);
    expect((body as { error: string }).error).toBe('nothing_to_update');
  });

  it('200 updates the body, RLS-scoped, and captures draft_edited', async () => {
    const { status, body } = await readJson(await PATCH(patchReq({ body: 'new content' }), ctx));
    expect(status).toBe(200);
    expect((body as { ok: boolean }).ok).toBe(true);

    expect(mCreate).toHaveBeenCalled();
    expect(draftsChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ body: 'new content', updated_at: expect.any(String) }),
    );
    // Scoped to the row id AND the user (defence-in-depth).
    expect(draftsChain.eq).toHaveBeenCalledWith('id', 'draft-9');
    expect(draftsChain.eq).toHaveBeenCalledWith('user_id', 'user-1');

    // Body edits emit the draft_edited event.
    expect(mCapture).toHaveBeenCalledWith(
      'draft_edited',
      'user-1',
      expect.objectContaining({ draftId: 'draft-9' }),
    );
  });

  it('200 updates the status without capturing draft_edited', async () => {
    const { status } = await readJson(await PATCH(patchReq({ status: 'scheduled' }), ctx));
    expect(status).toBe(200);
    expect(draftsChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'scheduled' }),
    );
    expect(mCapture).not.toHaveBeenCalled();
  });

  it('accepts each editable status (draft / scheduled / discarded)', async () => {
    for (const s of ['draft', 'scheduled', 'discarded']) {
      const { status } = await readJson(await PATCH(patchReq({ status: s }), ctx));
      expect(status).toBe(200);
    }
  });

  it('500 update_failed when the update errors', async () => {
    draftsChain = makeChain({ data: null, error: { message: 'db down' } });
    mCreate.mockReturnValue(makeSupabase({ tables: { drafts: draftsChain } }) as never);
    const { status, body } = await readJson(await PATCH(patchReq({ body: 'x' }), ctx));
    expect(status).toBe(500);
    expect((body as { error: string }).error).toBe('update_failed');
    expect(mCapture).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/post/drafts/[id]', () => {
  it('401 when unauthenticated', async () => {
    mUser.mockResolvedValue(null as never);
    const { status, body } = await readJson(await DELETE(delReq(), ctx));
    expect(status).toBe(401);
    expect((body as { error: string }).error).toBe('unauthorized');
    expect(mCreate).not.toHaveBeenCalled();
  });

  it('200 soft-deletes by setting status discarded, RLS-scoped', async () => {
    const { status, body } = await readJson(await DELETE(delReq(), ctx));
    expect(status).toBe(200);
    expect((body as { ok: boolean }).ok).toBe(true);

    expect(draftsChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'discarded', updated_at: expect.any(String) }),
    );
    expect(draftsChain.eq).toHaveBeenCalledWith('id', 'draft-9');
    expect(draftsChain.eq).toHaveBeenCalledWith('user_id', 'user-1');
  });

  it('500 delete_failed when the update errors', async () => {
    draftsChain = makeChain({ data: null, error: { message: 'db down' } });
    mCreate.mockReturnValue(makeSupabase({ tables: { drafts: draftsChain } }) as never);
    const { status, body } = await readJson(await DELETE(delReq(), ctx));
    expect(status).toBe(500);
    expect((body as { error: string }).error).toBe('delete_failed');
  });
});
