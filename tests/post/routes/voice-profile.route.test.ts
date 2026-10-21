import { describe, it, expect, vi, beforeEach } from 'vitest';
import { jsonRequest, readJson, fakeUser, makeChain, makeSupabase } from '../helpers/mocks';

// Route handler test — POST /api/post/voice-profile.
// Drives: getUser, createAdminClient (deactivate then insert voice_profiles),
// buildStyleGuide (mocked — and its graceful-failure path), MODEL, captureServer.

vi.mock('@/lib/supabase/server', () => ({ getUser: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/ai/claude', () => ({ MODEL: 'claude-test-model' }));
vi.mock('@/lib/modules/post/ai/prompts/voiceProfile', () => ({ buildStyleGuide: vi.fn() }));

vi.mock('@/lib/analytics', () => ({
  captureServer: vi.fn(),
  EVENTS: { voiceProfileCompleted: 'voice_profile_completed' },
}));

vi.mock('@/lib/observability', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  captureException: vi.fn(),
}));

import { POST } from '@/app/api/post/voice-profile/route';
import { getUser } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { buildStyleGuide } from '@/lib/modules/post/ai/prompts/voiceProfile';
import { captureServer } from '@/lib/analytics';

const mUser = vi.mocked(getUser);
const mAdmin = vi.mocked(createAdminClient);
const mBuild = vi.mocked(buildStyleGuide);
const mCapture = vi.mocked(captureServer);

function req(body: unknown) {
  return jsonRequest('http://test/api/post/voice-profile', body);
}

// One shared chain for voice_profiles so both update() and insert() are observable.
function adminWith(updateError: unknown = null, insertError: unknown = null) {
  // The route calls .update(...).eq().eq() (awaited) and .insert(...) (awaited)
  // on the SAME from('voice_profiles'). makeChain resolves whatever result it
  // holds; we use two separate chains by table is not possible here since both
  // are voice_profiles. Use distinct chains via a counter-driven from().
  const updateChain = makeChain({ data: null, error: updateError });
  const insertChain = makeChain({ data: null, error: insertError });
  let call = 0;
  const client = {
    from: vi.fn(() => (call++ === 0 ? updateChain : insertChain)),
    rpc: vi.fn(),
    auth: { getUser: vi.fn() },
    storage: { from: vi.fn() },
  };
  return { client, updateChain, insertChain };
}

beforeEach(() => {
  mUser.mockResolvedValue(fakeUser() as never);
  mBuild.mockResolvedValue('STYLE GUIDE TEXT' as never);
  const { client } = adminWith();
  mAdmin.mockReturnValue(client as never);
});

const validBody = {
  industry: 'SaaS',
  seniority: 'Founder',
  tone: 'punchy',
  topics: ['growth', 'hiring'],
  writingSample: 'I build in public.',
};

describe('POST /api/post/voice-profile', () => {
  it('401 when unauthenticated', async () => {
    mUser.mockResolvedValue(null as never);
    const { status, body } = await readJson(await POST(req(validBody)));
    expect(status).toBe(401);
    expect((body as { error: string }).error).toBe('unauthorized');
  });

  it('400 on invalid JSON', async () => {
    const bad = new Request('http://test/api/post/voice-profile', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not json',
    });
    const { status } = await readJson(await POST(bad));
    expect(status).toBe(400);
  });

  it('400 when industry is missing', async () => {
    const { status, body } = await readJson(
      await POST(req({ ...validBody, industry: '   ' })),
    );
    expect(status).toBe(400);
    expect((body as { error: string }).error).toMatch(/industry/i);
  });

  it('400 when seniority is missing', async () => {
    const { status, body } = await readJson(
      await POST(req({ ...validBody, seniority: undefined })),
    );
    expect(status).toBe(400);
    expect((body as { error: string }).error).toMatch(/seniority/i);
  });

  it('400 when tone is missing', async () => {
    const { status, body } = await readJson(await POST(req({ ...validBody, tone: '' })));
    expect(status).toBe(400);
    expect((body as { error: string }).error).toMatch(/tone/i);
  });

  it('success: deactivates existing profiles, inserts a new active one, captures completion', async () => {
    const { client, updateChain, insertChain } = adminWith();
    mAdmin.mockReturnValue(client as never);

    const { status, body } = await readJson(await POST(req(validBody)));
    expect(status).toBe(200);
    expect((body as { ok: boolean }).ok).toBe(true);

    // Deactivation of the current active row(s).
    expect(updateChain.update).toHaveBeenCalledWith({ is_active: false });
    expect(updateChain.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(updateChain.eq).toHaveBeenCalledWith('is_active', true);

    // New active profile insert with the built style guide + model.
    expect(insertChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-1',
        industry: 'SaaS',
        seniority: 'Founder',
        tone: 'punchy',
        topics: ['growth', 'hiring'],
        writing_sample: 'I build in public.',
        style_guide: 'STYLE GUIDE TEXT',
        style_guide_model: 'claude-test-model',
        is_active: true,
      }),
    );

    expect(mBuild).toHaveBeenCalledWith(
      expect.objectContaining({ industry: 'SaaS', seniority: 'Founder', tone: 'punchy' }),
    );
    expect(mCapture).toHaveBeenCalledWith(
      'voice_profile_completed',
      'user-1',
      expect.objectContaining({ seniority: 'Founder', industry: 'SaaS' }),
    );
  });

  it('caps topics at 3 and drops blanks/dupes', async () => {
    const { client, insertChain } = adminWith();
    mAdmin.mockReturnValue(client as never);

    await POST(
      req({
        ...validBody,
        topics: ['a', 'a', '  b  ', '', 'c', 'd', 5 as unknown as string],
      }),
    );
    const [row] = insertChain.insert.mock.calls[0];
    expect((row as { topics: string[] }).topics).toEqual(['a', 'b', 'c']);
  });

  it('graceful path: buildStyleGuide throws -> saves with style_guide null and returns ok', async () => {
    mBuild.mockRejectedValue(new Error('missing ANTHROPIC_API_KEY'));
    const { client, insertChain } = adminWith();
    mAdmin.mockReturnValue(client as never);

    const { status, body } = await readJson(await POST(req(validBody)));
    expect(status).toBe(200);
    expect((body as { ok: boolean }).ok).toBe(true);

    const [row] = insertChain.insert.mock.calls[0];
    expect((row as { style_guide: unknown }).style_guide).toBeNull();
    // style_guide_model is null when there is no style guide.
    expect((row as { style_guide_model: unknown }).style_guide_model).toBeNull();
  });

  it('writingSample omitted is stored as null', async () => {
    const { client, insertChain } = adminWith();
    mAdmin.mockReturnValue(client as never);

    const { writingSample, ...noSample } = validBody;
    void writingSample;
    await POST(req(noSample));
    const [row] = insertChain.insert.mock.calls[0];
    expect((row as { writing_sample: unknown }).writing_sample).toBeNull();
  });

  it('500 when the deactivate update errors (and does not insert)', async () => {
    const { client, insertChain } = adminWith({ message: 'deactivate fail' });
    mAdmin.mockReturnValue(client as never);

    const { status, body } = await readJson(await POST(req(validBody)));
    expect(status).toBe(500);
    expect((body as { error: string }).error).toMatch(/voice profile/i);
    expect(insertChain.insert).not.toHaveBeenCalled();
    expect(mCapture).not.toHaveBeenCalled();
  });

  it('500 when the insert errors', async () => {
    const { client } = adminWith(null, { message: 'insert fail' });
    mAdmin.mockReturnValue(client as never);

    const { status, body } = await readJson(await POST(req(validBody)));
    expect(status).toBe(500);
    expect((body as { error: string }).error).toMatch(/voice profile/i);
    expect(mCapture).not.toHaveBeenCalled();
  });
});
