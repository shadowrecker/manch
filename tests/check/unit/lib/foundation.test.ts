import { describe, it, expect } from 'vitest';
import { isInNativeScript, detectScriptLanguage, languageByCode, LANGUAGE_CODES, isLanguageCode } from '@/lib/modules/check/languages';
import { clampTrustScore, VERDICT_LABELS } from '@/lib/modules/check/types';
import { normalizeForHash } from '@/lib/modules/check/utils';
import { formatINR, clip } from '@/lib/utils';
import { TIERS, tierForPlan } from '@/lib/pricing';
import { EVENTS } from '@/lib/events';

describe('languages catalog (8 MVP, +Malayalam +English)', () => {
  it('has the 8 MVP language codes', () => {
    expect(LANGUAGE_CODES).toEqual(['hi', 'ta', 'te', 'bn', 'mr', 'kn', 'ml', 'en']);
  });

  it('native-script gate: detects each Indic block, rejects romanised', () => {
    expect(isInNativeScript('नमस्ते दुनिया', 'hi')).toBe(true);
    expect(isInNativeScript('வணக்கம்', 'ta')).toBe(true);
    expect(isInNativeScript('നമസ്കാരം', 'ml')).toBe(true); // Malayalam (new vs Bhasha)
    expect(isInNativeScript('namaste', 'hi')).toBe(false); // romanised fails
    expect(isInNativeScript('Hello', 'en')).toBe(true); // English = Latin
  });

  it('detects the script language from native text', () => {
    expect(detectScriptLanguage('வணக்கம்')).toBe('ta');
    expect(detectScriptLanguage('മലയാളം')).toBe('ml');
    expect(detectScriptLanguage('hello')).toBeNull();
  });

  it('only the free-tier languages are flagged free', () => {
    expect(languageByCode('hi')?.freeTier).toBe(true);
    expect(languageByCode('en')?.freeTier).toBe(true);
    expect(languageByCode('ta')?.freeTier).toBe(false);
    expect(isLanguageCode('xx')).toBe(false);
  });
});

describe('trust score + verdict labels', () => {
  it('clamps the trust score into 1..10', () => {
    expect(clampTrustScore(0)).toBe(1);
    expect(clampTrustScore(99)).toBe(10);
    expect(clampTrustScore(6.6)).toBe(7);
  });
  it('has the five verdict labels', () => {
    expect(VERDICT_LABELS).toContain('verified');
    expect(VERDICT_LABELS).toContain('false');
    expect(VERDICT_LABELS).toContain('manipulated');
    expect(VERDICT_LABELS).toHaveLength(5);
  });
});

describe('utils', () => {
  it('normalizeForHash makes near-identical forwards hash-equal', () => {
    const a = normalizeForHash('BREAKING!! Modi said XYZ — share now!!!');
    const b = normalizeForHash('breaking  modi said xyz   share now');
    expect(a).toBe(b);
  });
  it('normalizeForHash strips URLs (links vary, the claim is what matters)', () => {
    expect(normalizeForHash('check this https://x.com/abc story')).toBe('check this story');
  });
  it('formatINR renders paise as rupees', () => {
    expect(formatINR(4900)).toBe('₹49');
    expect(formatINR(2000000)).toBe('₹20,000');
  });
  it('clip truncates long text', () => {
    expect(clip('a'.repeat(100), 10)).toHaveLength(11); // 10 + ellipsis
  });
});

describe('pricing (core Manch tiers that unlock Check)', () => {
  it('lists the consumer Plus tier and the Check B2B tiers', () => {
    const plans = TIERS.map((t) => t.plan);
    expect(plans).toContain('free');
    expect(plans).toContain('plus');
    expect(plans).toContain('newsroom');
    expect(plans).toContain('telco');
    expect(tierForPlan('plus').plan).toBe('plus');
  });
});

describe('events taxonomy', () => {
  it('covers the PRD §28 metrics', () => {
    expect(EVENTS.checkRequested).toBe('check_requested');
    expect(EVENTS.verdictReviewed).toBe('verdict_reviewed');
    expect(EVENTS.apiCall).toBe('api_call');
  });
});
