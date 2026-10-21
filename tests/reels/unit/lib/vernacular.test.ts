import { describe, it, expect, vi, afterEach } from 'vitest';
import { detectLanguage } from '@/lib/modules/reels/ai/vernacular';

describe('detectLanguage (script-based)', () => {
  it('detects each native script', () => {
    expect(detectLanguage('வணக்கம்')).toBe('ta');
    expect(detectLanguage('తెలుగు')).toBe('te');
    expect(detectLanguage('বাংলা')).toBe('bn');
    expect(detectLanguage('ಕನ್ನಡ')).toBe('kn');
    expect(detectLanguage('ગુજરાતી')).toBe('gu');
    expect(detectLanguage('ਪੰਜਾਬੀ')).toBe('pa');
  });
  it('defaults ambiguous Devanagari to Hindi', () => {
    expect(detectLanguage('नमस्कार मित्रांनो')).toBe('hi'); // Marathi is also Devanagari
    expect(detectLanguage('नमस्ते')).toBe('hi');
  });
  it('returns null for romanised / Latin text', () => {
    expect(detectLanguage('Namaste doston')).toBeNull();
    expect(detectLanguage('hello world')).toBeNull();
  });
});

// Env-dependent transliteration: reset + stub + dynamic import (Folio pattern).
async function load(envOverrides: Record<string, string> = {}) {
  vi.resetModules();
  for (const [k, v] of Object.entries(envOverrides)) vi.stubEnv(k, v);
  return import('@/lib/modules/reels/ai/vernacular');
}
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('normaliseScript', () => {
  it('passes native-script text through unchanged (no API call)', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { normaliseScript } = await load();
    expect(await normaliseScript('வணக்கம் நண்பர்களே', 'ta')).toBe('வணக்கம் நண்பர்களே');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('transliterates romanised text via Sarvam when configured', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ transliterated_text: 'நண்பர்கள்' }), { status: 200 }),
      ),
    );
    const { normaliseScript } = await load({ SARVAM_API_KEY: 'sk_test' });
    expect(await normaliseScript('nanbargal', 'ta')).toBe('நண்பர்கள்');
  });

  it('falls back to passthrough when no provider is configured', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const { transliterate } = await load();
    const out = await transliterate('nanbargal', 'ta');
    expect(out.provider).toBe('passthrough');
    expect(out.text).toBe('nanbargal');
  });
});
