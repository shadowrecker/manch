import { describe, it, expect } from 'vitest';
import { initials, clip, escapeHtml, monthPeriod, isoWeekMonday, normaliseE164 } from '@/lib/utils';

describe('monthPeriod', () => {
  it('returns the first of the month in UTC', () => {
    expect(monthPeriod(new Date('2026-06-11T18:00:00Z'))).toBe('2026-06-01');
  });
});

describe('isoWeekMonday', () => {
  it('returns the Monday of the ISO week (UTC)', () => {
    // 2026-06-11 is a Thursday -> Monday is 2026-06-08
    expect(isoWeekMonday(new Date('2026-06-11T00:00:00Z'))).toBe('2026-06-08');
    // A Monday returns itself
    expect(isoWeekMonday(new Date('2026-06-08T00:00:00Z'))).toBe('2026-06-08');
    // A Sunday returns the previous Monday
    expect(isoWeekMonday(new Date('2026-06-14T00:00:00Z'))).toBe('2026-06-08');
  });
});

describe('misc helpers', () => {
  it('initials', () => {
    expect(initials('Anjali Verma')).toBe('AV');
    expect(initials('')).toBe('Y');
  });
  it('clip', () => {
    expect(clip('abcdefghij', 5)).toBe('abcde…');
    expect(clip('abc', 5)).toBe('abc');
  });
  it('escapeHtml', () => {
    expect(escapeHtml('<b>a & b</b>')).toBe('&lt;b&gt;a &amp; b&lt;/b&gt;');
  });
  it('normaliseE164', () => {
    expect(normaliseE164('+91 98765 43210')).toBe('+919876543210');
    expect(normaliseE164('919876543210')).toBe('+919876543210');
  });
});
