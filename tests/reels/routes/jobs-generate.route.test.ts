import { describe, it, expect, vi, beforeEach } from 'vitest';
import { rawRequest, readJson, makeSupabase } from '../helpers/mocks';

// QStash worker POST /api/reels/jobs/generate (formerly /api/jobs/bhasha). The
// inbound WhatsApp webhook is now the shared core router (tests/core).
vi.mock('@/lib/db/queries', () => ({
  getPlan: vi.fn(),
  getUsage: vi.fn(),
  getProfile: vi.fn(),
}));
vi.mock('@/lib/modules/reels/queries', () => ({ getCreditBalance: vi.fn() }));
vi.mock('@/lib/queue', () => ({ enqueue: vi.fn(), verifyQstashSignature: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/modules/reels/services/generate', () => ({ generateScriptForUser: vi.fn() }));
vi.mock('@/lib/whatsapp/client', () => ({ sendText: vi.fn(), downloadMedia: vi.fn() }));
vi.mock('@/lib/modules/reels/whatsapp', () => ({ sendScript: vi.fn() }));
vi.mock('@/lib/modules/reels/ai/transcribe', () => ({ transcribe: vi.fn() }));
vi.mock('@/lib/modules/reels/ai/vernacular', () => ({ detectLanguage: vi.fn() }));

import { POST as worker } from '@/app/api/reels/jobs/generate/route';
import { getPlan, getUsage, getProfile } from '@/lib/db/queries';
import { getCreditBalance } from '@/lib/modules/reels/queries';
import { verifyQstashSignature } from '@/lib/queue';
import { createAdminClient } from '@/lib/supabase/admin';
import { generateScriptForUser } from '@/lib/modules/reels/services/generate';
import { sendText, downloadMedia } from '@/lib/whatsapp/client';
import { sendScript } from '@/lib/modules/reels/whatsapp';
import { transcribe } from '@/lib/modules/reels/ai/transcribe';
import { detectLanguage } from '@/lib/modules/reels/ai/vernacular';

describe('reels/jobs/generate worker', () => {
  const job = (over: Record<string, unknown> = {}) =>
    rawRequest('http://test/api/reels/jobs/generate', JSON.stringify({ waMessageId: 'wamid.1', from: '+919876543210', type: 'text', userId: 'u1', text: 'idea', ...over }), { 'upstash-signature': 'sig' });

  beforeEach(() => {
    vi.mocked(verifyQstashSignature).mockResolvedValue(true);
    vi.mocked(getPlan).mockResolvedValue('free');
    vi.mocked(getUsage).mockResolvedValue(0);
    vi.mocked(getCreditBalance).mockResolvedValue(0);
    vi.mocked(getProfile).mockResolvedValue({ default_language: 'hi' } as never);
    vi.mocked(detectLanguage).mockReturnValue('hi');
    vi.mocked(createAdminClient).mockReturnValue(makeSupabase() as never);
    vi.mocked(generateScriptForUser).mockResolvedValue({
      pieceId: 'p1', languageCode: 'hi', platform: 'instagram',
      styles: { educational: { hook: 'h', body: 'b', cta: 'c' }, entertainment: { hook: 'h', body: 'b', cta: 'c' }, emotional: { hook: 'h', body: 'b', cta: 'c' } },
      model: 'claude',
    } as never);
  });

  it('401 on invalid QStash signature', async () => {
    vi.mocked(verifyQstashSignature).mockResolvedValue(false);
    expect((await readJson(await worker(job()))).status).toBe(401);
    expect(generateScriptForUser).not.toHaveBeenCalled();
  });

  it('quota + credits exhausted → sends an upgrade message, does NOT generate', async () => {
    vi.mocked(getUsage).mockResolvedValue(5);
    await readJson(await worker(job()));
    expect(getUsage).toHaveBeenCalledWith('u1', 'pieces');
    expect(sendText).toHaveBeenCalledWith('+919876543210', expect.stringMatching(/\/settings\/billing/));
    expect(generateScriptForUser).not.toHaveBeenCalled();
  });

  it('text → generates a script (source whatsapp) and delivers it with a /reels/studio link', async () => {
    const { status } = await readJson(await worker(job()));
    expect(status).toBe(200);
    expect(generateScriptForUser).toHaveBeenCalledWith(expect.objectContaining({ source: 'whatsapp', languageCode: 'hi' }));
    expect(sendScript).toHaveBeenCalledWith('+919876543210', expect.anything(), expect.stringMatching(/\/reels\/studio$/));
  });

  it('audio → downloads + transcribes before generating', async () => {
    vi.mocked(downloadMedia).mockResolvedValue({ data: new Blob(['x']), mimeType: 'audio/ogg' } as never);
    vi.mocked(transcribe).mockResolvedValue({ text: 'मेरा आइडिया', provider: 'whisper' } as never);
    await readJson(await worker(job({ type: 'audio', mediaId: 'media-1', text: undefined })));
    expect(downloadMedia).toHaveBeenCalledWith('media-1');
    expect(transcribe).toHaveBeenCalled();
    expect(generateScriptForUser).toHaveBeenCalledWith(expect.objectContaining({ ideaText: 'मेरा आइडिया' }));
  });
});
