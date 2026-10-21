import { describe, it, expect } from 'vitest';
import { heuristicVerdict, analyzeMedia, DEEPFAKE_NOTE, type Signals } from '@/lib/modules/check/media/deepfake';

const sig = (over: Partial<Signals>): Signals => ({ faceCount: 1, blinkConsistency: 0.9, lipSyncMatch: 0.9, boundaryArtifacts: 0.1, lightingConsistency: 0.9, ...over });

describe('heuristicVerdict', () => {
  it('clean signals → no_signals', () => {
    expect(heuristicVerdict(sig({})).verdict).toBe('no_signals');
  });
  it('strong manipulation cues → likely_ai with high confidence', () => {
    const out = heuristicVerdict(sig({ blinkConsistency: 0.2, lipSyncMatch: 0.2, boundaryArtifacts: 0.9, lightingConsistency: 0.3 }));
    expect(out.verdict).toBe('likely_ai');
    expect(out.confidence).toBeGreaterThan(0.6);
  });
  it('borderline cues → possibly_manipulated', () => {
    expect(heuristicVerdict(sig({ blinkConsistency: 0.6, lipSyncMatch: 0.6, boundaryArtifacts: 0.4, lightingConsistency: 0.6 })).verdict).toBe('possibly_manipulated');
  });
});

describe('analyzeMedia', () => {
  it('without a detection key: no_signals, availability=false, and the humility note', async () => {
    const out = await analyzeMedia({ bytes: new Uint8Array([1, 2, 3]), mediaType: 'video' });
    expect(out.verdict).toBe('no_signals');
    expect(out.confidence).toBe(0);
    expect((out.signals as { available: boolean }).available).toBe(false);
    expect(out.note).toBe(DEEPFAKE_NOTE);
  });
});
