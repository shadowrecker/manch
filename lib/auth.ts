/**
 * Post-login redirect guard. Only same-origin relative paths are allowed;
 * protocol-relative ("//evil.com") and backslash ("/\evil.com") forms, which
 * browsers resolve to another origin, fall back to `fallback`.
 */
export function safeNext(next: string | null | undefined, fallback = '/home'): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return fallback;
  return next;
}

/** Minimum password rules for sign-up, reset and change (client + server safe). */
export const PASSWORD_MIN = 8;

/** Returns an error message, or null if the password is acceptable. */
export function passwordProblem(password: string, confirm?: string): string | null {
  if (password.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`;
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return 'Use both letters and numbers.';
  if (confirm !== undefined && password !== confirm) return 'Passwords don’t match.';
  return null;
}

/** Pages a signed-in user should never see (sent to /home instead). */
export const AUTH_ONLY_FOR_GUESTS = ['/login', '/signup', '/forgot-password'];
