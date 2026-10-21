import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeSupabase, makeChain } from '../../helpers/mocks';

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/modules/check/ai/prompts/claims', () => ({ extractClaims: vi.fn() }));
vi.mock('@/lib/modules/check/ai/prompts/verdict', () => ({ synthesizeVerdict: vi.fn() }));
vi.mock('@/lib/modules/check/corpus/search', () => ({ searchCorpus: vi.fn() }));
vi.mock('@/lib/modules/check/pipeline/cache', () => ({
  contentHashFor: vi.fn(() => 'hash123'),
  getCachedVerdict: vi.fn(),
  putCachedVerdict: vi.fn(),
}));

import { runTextCheck } from '@/lib/modules/check/pipeline/pipeline';
import { createAdminClient } from '@/lib/supabase/admin';
import { extractClaims } from '@/lib/modules/check/ai/prompts/claims';
import { synthesizeVerdict } from '@/lib/modules/check/ai/prompts/verdict';
import { searchCorpus } from '@/lib/modules/check/corpus/search';
import { getCachedVerdict, putCachedVerdict } from '@/lib/modules/check/pipeline/cache';
import type { Verdict } from '@/lib/modules/check/types';
import type { Evidence } from '@/lib/modules/check/corpus/search';

const mClaims = vi.mocked(extractClaims);
const mSynth = vi.mocked(synthesizeVerdict);
const mSearch = vi.mocked(searchCorpus);
const mGetCache = vi.mocked(getCachedVerdict);

const SYNTH_VERDICT: Verdict = { trustScore: 2, label: 'false', explanation: 'Refuted by PIB.', claims: [{ text: 'tax claim', verdict: 'refuted', confidence: 0.85, sources: [] }], sources: [], language: 'en' };
const EVID: Evidence[] = [{ id: 'c1', source: 'pib', title: 'PIB', url: 'https://pib.gov.in/x', chunk: 'No such tax.', distance: 0.1 }];

beforeEach(() => {
  vi.mocked(createAdminClient).mockReturnValue(makeSupabase({ tables: { checks: makeChain({ data: { id: 'chk1' }, error: null }), claims: makeChain() } }) as never);
  mGetCache.mockResolvedValue(null);
  vi.mocked(putCachedVerdict).mockResolvedValue();
});

describe('runTextCheck', () => {
  it('serves a cache hit instantly (no claims/synthesis)', async () => {
    const cached: Verdict = { ...SYNTH_VERDICT, language: 'hi' };
    mGetCache.mockResolvedValue(cached);
    const out = await runTextCheck({ text: 'viral forward', language: 'hi' });
    expect(out.fromCache).toBe(true);
    expect(out.verdict).toEqual(cached);
    expect(mClaims).not.toHaveBeenCalled();
    expect(mSynth).not.toHaveBeenCalled();
  });

  it('no checkable claims → unverified (humility)', async () => {
    mClaims.mockResolvedValue([]);
    const out = await runTextCheck({ text: 'good morning', language: 'en' });
    expect(out.verdict.label).toBe('unverified');
    expect(mSynth).not.toHaveBeenCalled();
  });

  it('THE HUMILITY INVARIANT: claims but NO evidence → unverified, never a confident verdict', async () => {
    mClaims.mockResolvedValue(['some claim', 'another claim']);
    mSearch.mockResolvedValue([]); // corpus has nothing
    const out = await runTextCheck({ text: 'unknown claim', language: 'en' });
    expect(out.verdict.label).toBe('unverified');
    expect(out.verdict.trustScore).toBeLessThanOrEqual(4);
    expect(mSynth).not.toHaveBeenCalled(); // we never ask the model to rule without evidence
    expect(out.verdict.claims.every((c) => c.verdict === 'unverified')).toBe(true);
  });

  it('claims WITH evidence → synthesise a verdict and persist', async () => {
    mClaims.mockResolvedValue(['New UPI tax announced']);
    mSearch.mockResolvedValue(EVID);
    mSynth.mockResolvedValue(SYNTH_VERDICT);
    const out = await runTextCheck({ text: 'forward', language: 'en', requester: { botUserId: 'bu1' } });
    expect(mSynth).toHaveBeenCalled();
    expect(out.verdict.label).toBe('false');
    expect(out.checkId).toBe('chk1');
    expect(putCachedVerdict).toHaveBeenCalledWith('hash123', 'en', expect.objectContaining({ label: 'false' }));
  });

  it('applies an injected localizer (Section D seam)', async () => {
    mClaims.mockResolvedValue(['claim']);
    mSearch.mockResolvedValue(EVID);
    mSynth.mockResolvedValue(SYNTH_VERDICT);
    const localize = vi.fn(async (v: Verdict, language) => ({ ...v, explanation: 'अनुवादित', language }));
    const out = await runTextCheck({ text: 'forward', language: 'hi' }, { localize });
    expect(localize).toHaveBeenCalled();
    expect(out.verdict.explanation).toBe('अनुवादित');
    expect(out.verdict.language).toBe('hi');
  });
});
