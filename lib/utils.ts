import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Generic, client-safe helpers shared by every module. Module-specific helpers
// (follower bands, content-hash normalisation, …) live under lib/modules/<m>/.

/** Tailwind-aware className combiner. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Two-letter initials for an avatar; falls back to "Y" (You). */
export function initials(name?: string | null): string {
  return (name || 'You')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] ?? '')
    .join('')
    .toUpperCase();
}

/** Truncate with an ellipsis. */
export function clip(s: string, n = 60): string {
  return s.length > n ? `${s.slice(0, n).trim()}…` : s;
}

/** Escape the three HTML-significant characters for safe text rendering. */
export function escapeHtml(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] as string);
}

/** First day of the current month (UTC) as YYYY-MM-DD — matches usage_counters.period. */
export function monthPeriod(d = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

/** Monday (UTC) of the ISO week containing `d` — matches hashtag_sets.week / trending_audio.week. */
export function isoWeekMonday(d = new Date()): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay(); // 0=Sun..6=Sat
  const diff = (day === 0 ? -6 : 1) - day; // shift back to Monday
  date.setUTCDate(date.getUTCDate() + diff);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

/** URL-safe random hex slug. Works in node and edge runtimes. */
export function randomId(bytes = 16): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Normalise a phone number to E.164-ish digits with a leading +. */
export function normaliseE164(raw: string): string {
  const digits = raw.replace(/[^\d]/g, '');
  return `+${digits}`;
}

/** Indian-format money from paise: 250000 → "₹2,500". */
export function formatINR(paise: number | null | undefined): string {
  const rupees = Math.round((paise ?? 0) / 100);
  return `₹${rupees.toLocaleString('en-IN')}`;
}
