import { describe, it, expect } from 'vitest';
import { translateText } from '@/lib/modules/check/ai/vernacular';

describe('translateText', () => {
  it('returns native passthrough for English (no translation needed)', async () => {
    const out = await translateText('This is false.', 'en');
    expect(out).toEqual({ text: 'This is false.', provider: 'native' });
  });

  it('returns passthrough when no translation provider is configured (graceful)', async () => {
    const out = await translateText('This is false.', 'hi');
    expect(out.provider).toBe('passthrough');
    expect(out.text).toBe('This is false.');
  });

  it('passes through empty text', async () => {
    expect((await translateText('   ', 'ta')).provider).toBe('native');
  });
});
