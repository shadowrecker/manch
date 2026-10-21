import { describe, it, expect } from 'vitest';
import { initials, clip, escapeHtml, monthPeriod, normaliseE164 } from '@/lib/utils';

describe('initials', () => {
  it('takes up to two initials, uppercased', () => {
    expect(initials('Navroop Srivastava')).toBe('NS');
    expect(initials('madonna')).toBe('M');
  });
  it('falls back to Y for empty', () => {
    expect(initials('')).toBe('Y');
    expect(initials(null)).toBe('Y');
  });
});

describe('clip', () => {
  it('truncates with an ellipsis past the limit', () => {
    expect(clip('abcdefghij', 5)).toBe('abcde…');
    expect(clip('abc', 5)).toBe('abc');
  });
  it('defaults to 60 chars in the Manch core (Folio defaulted to 40 — Post passes 40 explicitly)', () => {
    expect(clip('x'.repeat(61))).toBe(`${'x'.repeat(60)}…`);
    expect(clip('x'.repeat(41), 40)).toBe(`${'x'.repeat(40)}…`);
  });
});

describe('escapeHtml', () => {
  it('escapes the three significant characters', () => {
    expect(escapeHtml('<b>a & b</b>')).toBe('&lt;b&gt;a &amp; b&lt;/b&gt;');
  });
});

describe('monthPeriod', () => {
  it('returns the first of the month in UTC', () => {
    expect(monthPeriod(new Date('2026-05-30T18:00:00Z'))).toBe('2026-05-01');
    expect(monthPeriod(new Date('2026-01-01T00:00:00Z'))).toBe('2026-01-01');
  });
});

describe('normaliseE164', () => {
  it('keeps a leading + and strips formatting', () => {
    expect(normaliseE164('+91 98765 43210')).toBe('+919876543210');
    expect(normaliseE164('919876543210')).toBe('+919876543210');
  });
});
