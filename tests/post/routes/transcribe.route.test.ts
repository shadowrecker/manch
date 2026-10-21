import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readJson, fakeUser, makeSupabase, makeChain } from '../helpers/mocks';

// Route handler test — POST /api/post/transcribe.
// Mock every spine dependency. vi.mock factories are hoisted, so declare them
// before importing the route under test.

vi.mock('@/lib/supabase/server', () => ({ getUser: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/modules/post/ai/transcribe', () => ({ transcribe: vi.fn() }));
vi.mock('@/lib/ratelimit', () => ({ rateLimit: vi.fn() }));
vi.mock('@/lib/analytics', () => ({
  captureServer: vi.fn(),
  EVENTS: { voiceNoteSubmitted: 'voice_note_submitted' },
}));

import { POST } from '@/app/api/post/transcribe/route';
import { getUser } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { transcribe } from '@/lib/modules/post/ai/transcribe';
import { rateLimit } from '@/lib/ratelimit';
import { captureServer } from '@/lib/analytics';

const mUser = vi.mocked(getUser);
const mAdmin = vi.mocked(createAdminClient);
const mTranscribe = vi.mocked(transcribe);
const mRL = vi.mocked(rateLimit);
const mCapture = vi.mocked(captureServer);

// Build a multipart/form-data Request carrying a "file" field (or not).
function formRequest(opts: { file?: File | null; omit?: boolean } = {}) {
  const fd = new FormData();
  if (!opts.omit) {
    const file =
      opts.file === undefined
        ? new File([new Uint8Array([1, 2, 3, 4])], 'voice.webm', { type: 'audio/webm' })
        : opts.file;
    if (file) fd.append('file', file);
  }
  return new Request('http://test/api/post/transcribe', { method: 'POST', body: fd });
}

let transcriptionsChain: ReturnType<typeof makeChain>;

beforeEach(() => {
  mUser.mockResolvedValue(fakeUser() as never);
  mRL.mockResolvedValue({ success: true, remaining: 9 });
  mTranscribe.mockResolvedValue({
    text: 'hello world',
    detectedLang: 'english',
    provider: 'whisper',
  } as never);
  transcriptionsChain = makeChain({ data: null, error: null });
  mAdmin.mockReturnValue(makeSupabase({ tables: { transcriptions: transcriptionsChain } }) as never);
  mCapture.mockResolvedValue(undefined as never);
});

describe('POST /api/post/transcribe', () => {
  it('401 when unauthenticated', async () => {
    mUser.mockResolvedValue(null as never);
    const { status, body } = await readJson(await POST(formRequest()));
    expect(status).toBe(401);
    expect((body as { error: string }).error).toBe('unauthorized');
    expect(mTranscribe).not.toHaveBeenCalled();
  });

  it('429 when rate limited', async () => {
    mRL.mockResolvedValue({ success: false, remaining: 0 });
    const { status, body } = await readJson(await POST(formRequest()));
    expect(status).toBe(429);
    expect((body as { code: string }).code).toBe('rate_limited');
    expect(mTranscribe).not.toHaveBeenCalled();
  });

  it('rate limits per-user with the documented 10/min budget', async () => {
    await POST(formRequest());
    expect(mRL).toHaveBeenCalledWith('transcribe:user-1', { limit: 10, windowSeconds: 60 });
  });

  it('400 when no file field is present in the form', async () => {
    const { status } = await readJson(await POST(formRequest({ omit: true })));
    expect(status).toBe(400);
    expect(mTranscribe).not.toHaveBeenCalled();
  });

  it('400 when the uploaded file is empty (size 0)', async () => {
    const empty = new File([], 'empty.webm', { type: 'audio/webm' });
    const { status, body } = await readJson(await POST(formRequest({ file: empty })));
    expect(status).toBe(400);
    expect((body as { error: string }).error).toMatch(/no audio/i);
    expect(mTranscribe).not.toHaveBeenCalled();
  });

  it('400 when the body is not parseable as form data', async () => {
    // JSON body with a form content-type makes req.formData() throw.
    const bad = new Request('http://test/api/post/transcribe', {
      method: 'POST',
      headers: { 'content-type': 'multipart/form-data; boundary=----nope' },
      body: '{"not":"a form"}',
    });
    const { status } = await readJson(await POST(bad));
    expect(status).toBe(400);
  });

  it('200 returns { text, detectedLang } and persists a transcriptions row (admin)', async () => {
    const { status, body } = await readJson(await POST(formRequest()));
    expect(status).toBe(200);
    expect(body).toEqual({ text: 'hello world', detectedLang: 'english' });

    // It transcribed the uploaded file.
    expect(mTranscribe).toHaveBeenCalledTimes(1);

    // It persisted via the privileged admin client into the transcriptions table.
    expect(mAdmin).toHaveBeenCalled();
    expect(transcriptionsChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-1',
        source: 'web_voice',
        provider: 'whisper',
        detected_lang: 'english',
        text: 'hello world',
      }),
    );
  });

  it('captures the voice_note_submitted analytics event', async () => {
    await POST(formRequest());
    expect(mCapture).toHaveBeenCalledWith(
      'voice_note_submitted',
      'user-1',
      expect.objectContaining({ source: 'web', lang: 'english' }),
    );
  });

  it('still returns 200 with the transcript when the persist write errors (non-fatal)', async () => {
    const failing = makeChain({ data: null, error: { message: 'db down' } });
    mAdmin.mockReturnValue(makeSupabase({ tables: { transcriptions: failing } }) as never);
    const { status, body } = await readJson(await POST(formRequest()));
    expect(status).toBe(200);
    expect((body as { text: string }).text).toBe('hello world');
  });

  it('502 when transcription throws', async () => {
    mTranscribe.mockRejectedValue(new Error('whisper down'));
    const { status, body } = await readJson(await POST(formRequest()));
    expect(status).toBe(502);
    expect((body as { error: string }).error).toMatch(/transcribe/i);
  });
});
