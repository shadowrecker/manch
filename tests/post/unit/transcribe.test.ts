import { describe, it, expect } from 'vitest';
import { detectLang } from '@/lib/modules/post/ai/transcribe';

describe('detectLang', () => {
  it('detects Devanagari Hindi', () => {
    expect(detectLang('आज मैंने एक नई चीज़ सीखी')).toBe('hindi');
  });

  it('detects Hinglish from romanised markers', () => {
    expect(
      detectLang('Aaj ek interesting insight mila humara pricing ke baare mein soch badal gaya'),
    ).toBe('hinglish');
  });

  it('defaults to English', () => {
    expect(detectLang('Closed our first enterprise client this week after months of no.')).toBe(
      'english',
    );
  });
});
