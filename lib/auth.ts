/**
 * Post-login redirect guard. Only same-origin relative paths are allowed;
 * protocol-relative ("//evil.com") and backslash ("/\evil.com") forms, which
 * browsers resolve to another origin, fall back to `fallback`.
 */
export function safeNext(next: string | null | undefined, fallback = '/home'): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return fallback;
  return next;
}
