import type { FollowerBand } from '@/lib/modules/deals/types';

// Deals-only helpers. Generic helpers (formatINR, monthPeriod, randomId, clip)
// live in the shared core '@/lib/utils'.

/** Derive a follower band from a follower count (matches the rate/match logic). */
export function followerBand(followers: number | null | undefined): FollowerBand {
  const f = followers ?? 0;
  if (f < 10_000) return 'nano';
  if (f < 100_000) return 'micro';
  if (f < 1_000_000) return 'mid';
  return 'macro';
}
