import { describe, it, expect, vi, beforeEach } from 'vitest';
import { rawRequest, readJson, makeSupabase, makeChain } from '../helpers/mocks';

// Route handler test — QStash worker POST /api/post/jobs/generate.
// Mock every dependency the route imports. Define NoVoiceProfileError INSIDE
// the @/lib/modules/post/services/generate factory so `instanceof` works across the mock,
// then import it back for the error-path test (the generate.route exemplar).

vi.mock('@/lib/env', () => ({
  env: { appUrl: 'https://app.test' },
  requireEnv: (v: string) => v,
}));
vi.mock('@/lib/queue', () => ({ verifyQstashSignature: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/db/queries', () => ({ getPlan: vi.fn(), getUsage: vi.fn() }));
vi.mock('@/lib/modules/post/ai/transcribe', () => ({ transcribe: vi.fn() }));
vi.mock('@/lib/whatsapp/client', () => ({
  downloadMedia: vi.fn(),
  sendText: vi.fn(),
}));
vi.mock('@/lib/modules/post/whatsapp', () => ({ sendDrafts: vi.fn() }));
vi.mock('@/lib/modules/post/services/generate', () => {
  class NoVoiceProfileError extends Error {
    constructor() {
      super('No active voice profile');
      this.name = 'NoVoiceProfileError';
    }
  }
  return { generatePostsForUser: vi.fn(), NoVoiceProfileError };
});
vi.mock('@/lib/observability', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  captureException: vi.fn(),
}));

import { POST } from '@/app/api/post/jobs/generate/route';
import { verifyQstashSignature } from '@/lib/queue';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPlan, getUsage } from '@/lib/db/queries';
import { transcribe } from '@/lib/modules/post/ai/transcribe';
import { downloadMedia, sendText } from '@/lib/whatsapp/client';
import { sendDrafts } from '@/lib/modules/post/whatsapp';
import { generatePostsForUser, NoVoiceProfileError } from '@/lib/modules/post/services/generate';

const mVerify = vi.mocked(verifyQstashSignature);
const mAdmin = vi.mocked(createAdminClient);
const mPlan = vi.mocked(getPlan);
const mUsed = vi.mocked(getUsage);
const mTranscribe = vi.mocked(transcribe);
const mDownload = vi.mocked(downloadMedia);
const mSendText = vi.mocked(sendText);
const mSendDrafts = vi.mocked(sendDrafts);
const mGen = vi.mocked(generatePostsForUser);

const FROM = '+919812345678';

function job(over: Record<string, unknown> = {}) {
  return { waMessageId: 'wamid.1', from: FROM, type: 'text', userId: 'user-1', text: 'Closed a deal', ...over };
}

function signed(bodyObj: Record<string, unknown>) {
  return rawRequest('http://test/api/post/jobs/generate', JSON.stringify(bodyObj), {
    'upstash-signature': 'sig-ok',
  });
}

/** Admin client whose transcriptions.insert(...).select().single() resolves to { id }. */
function adminWithTranscription(id = 'tr-1') {
  const tr = makeChain({ data: { id }, error: null });
  const sb = makeSupabase({ tables: { transcriptions: tr } });
  mAdmin.mockReturnValue(sb as never);
  return { sb, tr };
}

beforeEach(() => {
  mVerify.mockResolvedValue(true);
  mPlan.mockResolvedValue('plus');
  mUsed.mockResolvedValue(0);
  mGen.mockResolvedValue({
    genRequestId: 'g1',
    posts: [{ angle: 'story', body: 'b' }],
    detectedLang: 'english',
    model: 'claude',
  } as never);
  mSendText.mockResolvedValue(undefined as never);
  mSendDrafts.mockResolvedValue(undefined as never);
  mDownload.mockResolvedValue({ data: new Blob(['x']), mimeType: 'audio/ogg' } as never);
  mTranscribe.mockResolvedValue({ text: 'transcribed words', detectedLang: 'hinglish', provider: 'whisper' } as never);
  adminWithTranscription();
});

describe('POST /api/post/jobs/generate — auth', () => {
  it('401 when the QStash signature is invalid and does no work', async () => {
    mVerify.mockResolvedValue(false);
    const { status, body } = await readJson(await POST(signed(job())));
    expect(status).toBe(401);
    expect((body as { error: string }).error).toBe('unauthorized');
    expect(mGen).not.toHaveBeenCalled();
  });

  it('verifies the signature against the header and raw body', async () => {
    const raw = JSON.stringify(job());
    await POST(rawRequest('http://test/api/post/jobs/generate', raw, { 'upstash-signature': 'sig-ok' }));
    expect(mVerify).toHaveBeenCalledWith('sig-ok', raw);
  });

  it('acks 200 on a malformed (but signed) body without generating', async () => {
    const { status, body } = await readJson(
      await POST(rawRequest('http://test/api/post/jobs/generate', '{bad', { 'upstash-signature': 'sig-ok' })),
    );
    expect(status).toBe(200);
    expect((body as { ok: boolean }).ok).toBe(true);
    expect(mGen).not.toHaveBeenCalled();
  });
});

describe('POST /api/post/jobs/generate — quota gate', () => {
  it('quota exceeded: sends an upgrade prompt, marks processed, does NOT generate', async () => {
    mPlan.mockResolvedValue('free');
    mUsed.mockResolvedValue(4); // free cap is 4 -> exceeded
    const { status, body } = await readJson(await POST(signed(job())));

    expect(status).toBe(200);
    expect((body as { ok: boolean }).ok).toBe(true);
    expect(mGen).not.toHaveBeenCalled();
    expect(mSendDrafts).not.toHaveBeenCalled();
    expect(mSendText).toHaveBeenCalledTimes(1);
    const [to, text] = mSendText.mock.calls[0];
    expect(to).toBe(FROM);
    expect(text).toContain('https://app.test/settings/billing');
    expect(mUsed).toHaveBeenCalledWith(expect.any(String), 'posts');
  });
});

describe('POST /api/post/jobs/generate — text branch', () => {
  it('generates from the job text and delivers drafts, then acks 200', async () => {
    const { status, body } = await readJson(await POST(signed(job({ text: '  Hello world  ' }))));

    expect(status).toBe(200);
    expect((body as { ok: boolean }).ok).toBe(true);
    expect(mGen).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        inputText: 'Hello world', // trimmed
        source: 'whatsapp',
        transcriptionId: null,
      }),
    );
    expect(mSendDrafts).toHaveBeenCalledWith(
      FROM,
      [{ angle: 'story', body: 'b' }],
      'https://app.test/post/drafts',
    );
    expect(mDownload).not.toHaveBeenCalled();
    expect(mTranscribe).not.toHaveBeenCalled();
  });

  it('empty text after trim: sends a prompt and skips generation', async () => {
    const { status } = await readJson(await POST(signed(job({ text: '   ' }))));
    expect(status).toBe(200);
    expect(mGen).not.toHaveBeenCalled();
    expect(mSendDrafts).not.toHaveBeenCalled();
    expect(mSendText).toHaveBeenCalledTimes(1);
  });
});

describe('POST /api/post/jobs/generate — audio branch', () => {
  it('downloads media, transcribes, persists the transcription, then generates', async () => {
    const { tr } = adminWithTranscription('tr-99');
    const { status } = await readJson(
      await POST(signed(job({ type: 'audio', mediaId: 'media-7', text: undefined }))),
    );

    expect(status).toBe(200);
    expect(mDownload).toHaveBeenCalledWith('media-7');
    expect(mTranscribe).toHaveBeenCalledWith(
      expect.objectContaining({ mimeType: 'audio/ogg', filename: 'wa-wamid.1.ogg' }),
    );
    expect(tr.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-1',
        source: 'whatsapp',
        provider: 'whisper',
        detected_lang: 'hinglish',
        text: 'transcribed words',
      }),
    );
    expect(mGen).toHaveBeenCalledWith(
      expect.objectContaining({
        inputText: 'transcribed words',
        source: 'whatsapp',
        transcriptionId: 'tr-99',
        detectedLang: 'hinglish',
      }),
    );
    expect(mSendDrafts).toHaveBeenCalled();
  });

  it('audio job with no mediaId is treated as poison: acks 200, no transcription/generation', async () => {
    const { status, body } = await readJson(
      await POST(signed(job({ type: 'audio', mediaId: undefined, text: undefined }))),
    );
    expect(status).toBe(200);
    expect((body as { ok: boolean }).ok).toBe(true);
    expect(mDownload).not.toHaveBeenCalled();
    expect(mTranscribe).not.toHaveBeenCalled();
    expect(mGen).not.toHaveBeenCalled();
  });

  it('empty transcription: prompts the user and does not generate', async () => {
    mTranscribe.mockResolvedValue({ text: '   ', detectedLang: 'english', provider: 'whisper' } as never);
    const { status } = await readJson(
      await POST(signed(job({ type: 'audio', mediaId: 'media-7', text: undefined }))),
    );
    expect(status).toBe(200);
    expect(mGen).not.toHaveBeenCalled();
    expect(mSendText).toHaveBeenCalledTimes(1);
  });

  it('throws when persisting the transcription fails (trErr) -> error path', async () => {
    const tr = makeChain({ data: null, error: { message: 'insert failed' } });
    mAdmin.mockReturnValue(makeSupabase({ tables: { transcriptions: tr } }) as never);
    const { status, body } = await readJson(
      await POST(signed(job({ type: 'audio', mediaId: 'media-7', text: undefined }))),
    );
    // Permanent failure: friendly apology + ack 200 (not transient).
    expect(status).toBe(200);
    expect((body as { ok: boolean }).ok).toBe(true);
    expect(mGen).not.toHaveBeenCalled();
  });
});

describe('POST /api/post/jobs/generate — error handling', () => {
  it('NoVoiceProfileError: sends an onboarding prompt and acks 200', async () => {
    mGen.mockRejectedValue(new NoVoiceProfileError());
    const { status, body } = await readJson(await POST(signed(job())));
    expect(status).toBe(200);
    expect((body as { ok: boolean }).ok).toBe(true);
    const [to, text] = mSendText.mock.calls[0];
    expect(to).toBe(FROM);
    expect(text).toContain('https://app.test/post/onboarding');
  });

  it('transient failure (5xx message): apologises and returns 500 so QStash retries', async () => {
    mGen.mockRejectedValue(new Error('upstream 503 Service Unavailable'));
    const { status, body } = await readJson(await POST(signed(job())));
    expect(status).toBe(500);
    expect((body as { error: string }).error).toBe('transient');
    expect(mSendText).toHaveBeenCalled(); // best-effort apology
  });

  it('transient failure (network/timeout message): returns 500', async () => {
    mGen.mockRejectedValue(new Error('fetch failed: ECONNRESET'));
    const { status } = await readJson(await POST(signed(job())));
    expect(status).toBe(500);
  });

  it('permanent (poison) failure: apologises and acks 200 to stop retries', async () => {
    mGen.mockRejectedValue(new Error('bad input shape'));
    const { status, body } = await readJson(await POST(signed(job())));
    expect(status).toBe(200);
    expect((body as { ok: boolean }).ok).toBe(true);
    expect(mSendText).toHaveBeenCalled();
  });

  it('apology send failure does not crash the handler (safeSend swallows)', async () => {
    mGen.mockRejectedValue(new Error('bad input shape'));
    mSendText.mockRejectedValue(new Error('whatsapp down'));
    const { status } = await readJson(await POST(signed(job())));
    expect(status).toBe(200);
  });
});
