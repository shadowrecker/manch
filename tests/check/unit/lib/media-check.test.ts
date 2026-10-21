import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeSupabase, makeChain } from '../../helpers/mocks';

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/modules/check/whatsapp/media', () => ({ downloadMedia: vi.fn() }));
vi.mock('@/lib/modules/check/media/deepfake', async () => {
  const actual = await vi.importActual<typeof import('@/lib/modules/check/media/deepfake')>('@/lib/modules/check/media/deepfake');
  return { ...actual, analyzeMedia: vi.fn() };
});
vi.mock('@/lib/modules/check/pipeline/cache', () => ({ getCachedVerdict: vi.fn(), putCachedVerdict: vi.fn() }));
vi.mock('@/lib/modules/check/verdict/translate', () => ({ translateVerdict: vi.fn() }));

import { mediaHash, analysisToVerdict, runMediaCheck } from '@/lib/modules/check/media/check';
import { createAdminClient } from '@/lib/supabase/admin';
import { downloadMedia } from '@/lib/modules/check/whatsapp/media';
import { analyzeMedia } from '@/lib/modules/check/media/deepfake';
import { getCachedVerdict, putCachedVerdict } from '@/lib/modules/check/pipeline/cache';
import { translateVerdict } from '@/lib/modules/check/verdict/translate';
import type { MediaAnalysis } from '@/lib/modules/check/types';

const mDownload = vi.mocked(downloadMedia);
const mAnalyze = vi.mocked(analyzeMedia);
const mGetCache = vi.mocked(getCachedVerdict);
const mTranslate = vi.mocked(translateVerdict);

describe('mediaHash', () => {
  it('is a stable sha256 of the bytes', () => {
    const h = mediaHash(new Uint8Array([1, 2, 3]));
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(mediaHash(new Uint8Array([1, 2, 3]))).toBe(h);
  });
});

describe('analysisToVerdict (hedged mapping)', () => {
  const a = (over: Partial<MediaAnalysis>): MediaAnalysis => ({ mediaType: 'video', verdict: 'no_signals', confidence: 0.6, signals: { available: true }, note: 'note', ...over });

  it('detection unavailable → unverified ("couldn\'t run")', () => {
    expect(analysisToVerdict(a({ signals: { available: false } })).label).toBe('unverified');
  });
  it('likely_ai → manipulated, low trust', () => {
    const v = analysisToVerdict(a({ verdict: 'likely_ai' }));
    expect(v.label).toBe('manipulated');
    expect(v.trustScore).toBeLessThanOrEqual(3);
  });
  it('no_signals (but ran) → unverified, NOT a clean bill of health', () => {
    const v = analysisToVerdict(a({ verdict: 'no_signals' }));
    expect(v.label).toBe('unverified');
    expect(v.explanation).toMatch(/does not prove it is genuine/i);
  });
});

describe('runMediaCheck', () => {
  beforeEach(() => {
    vi.mocked(createAdminClient).mockReturnValue(makeSupabase({ tables: { checks: makeChain({ data: { id: 'chk1' }, error: null }), media_analyses: makeChain() } }) as never);
    mGetCache.mockResolvedValue(null);
    vi.mocked(putCachedVerdict).mockResolvedValue();
    mTranslate.mockImplementation(async (v, language) => ({ ...v, language }));
  });

  it('graceful when the media cannot be downloaded', async () => {
    mDownload.mockResolvedValue(null);
    const out = await runMediaCheck({ mediaId: 'x', mediaType: 'image', language: 'hi' });
    expect(out.verdict.label).toBe('unverified');
    expect(out.analysis).toBeNull();
    expect(mAnalyze).not.toHaveBeenCalled();
  });

  it('analyses, persists the check + media_analyses, and caches', async () => {
    mDownload.mockResolvedValue({ bytes: new Uint8Array([9, 9]), mime: 'video/mp4' });
    mAnalyze.mockResolvedValue({ mediaType: 'video', verdict: 'likely_ai', confidence: 0.8, signals: { available: true }, note: 'n' });
    const out = await runMediaCheck({ mediaId: 'x', mediaType: 'video', language: 'hi', requester: { botUserId: 'bu1' } });
    expect(out.verdict.label).toBe('manipulated');
    expect(out.checkId).toBe('chk1');
    expect(putCachedVerdict).toHaveBeenCalled();
  });

  it('serves a media cache hit', async () => {
    mDownload.mockResolvedValue({ bytes: new Uint8Array([1]), mime: 'image/jpeg' });
    mGetCache.mockResolvedValue({ trustScore: 2, label: 'manipulated', explanation: 'cached', claims: [], sources: [], language: 'hi' });
    const out = await runMediaCheck({ mediaId: 'x', mediaType: 'image', language: 'hi' });
    expect(out.fromCache).toBe(true);
    expect(mAnalyze).not.toHaveBeenCalled();
  });
});
