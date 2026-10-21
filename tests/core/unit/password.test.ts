import { describe, it, expect } from 'vitest';
import { AUTH_ONLY_FOR_GUESTS, PASSWORD_MIN, passwordProblem } from '@/lib/auth';

describe('passwordProblem', () => {
  it('accepts 8+ characters with letters and numbers', () => {
    expect(passwordProblem('manch2026')).toBeNull();
    expect(passwordProblem('manch2026', 'manch2026')).toBeNull();
  });
  it('rejects short, letters-only, digits-only and mismatched passwords', () => {
    expect(passwordProblem('ab1')).toMatch(String(PASSWORD_MIN));
    expect(passwordProblem('abcdefghij')).toMatch(/letters and numbers/);
    expect(passwordProblem('1234567890')).toMatch(/letters and numbers/);
    expect(passwordProblem('manch2026', 'manch2027')).toMatch(/match/);
  });
  it('guest-only pages are the auth entry pages', () => {
    expect(AUTH_ONLY_FOR_GUESTS).toEqual(['/login', '/signup', '/forgot-password']);
  });
});
