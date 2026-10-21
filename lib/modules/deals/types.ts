// Manch Deals — domain + API contract types. No server-only imports (used on
// the client too). The account plan (`Plan`) and `ApiError` are shared core
// types; they are re-exported here so module code has one import site.

export type { Plan } from '@/lib/plans';
export type { ApiError } from '@/lib/types';
export type { DealsTier } from '@/lib/plans';

export type FollowerBand = 'nano' | 'micro' | 'mid' | 'macro';
export type Deliverable = 'reel' | 'story' | 'post' | 'bundle';
export type DealStatus =
  | 'pitched'
  | 'in_conversation'
  | 'contract_review'
  | 'live'
  | 'delivered'
  | 'paid';
export type CommissionStatus = 'none' | 'pending' | 'collected' | 'waived';

export const DEAL_STATUSES: DealStatus[] = [
  'pitched',
  'in_conversation',
  'contract_review',
  'live',
  'delivered',
  'paid',
];
export const DELIVERABLES: Deliverable[] = ['reel', 'story', 'post', 'bundle'];

/** Instagram metric snapshot (never trust client-supplied stats; this is the shape). */
export interface IgMetrics {
  followers: number | null;
  engagementRate: number | null;
  avgLikes: number | null;
  avgComments: number | null;
  topCategories: string[];
  audience: {
    age?: Record<string, number>;
    gender?: Record<string, number>;
    geo?: Record<string, number>;
  } | null;
}

/** The composed media-kit content (Claude output). */
export interface MediaKitData {
  headline: string;
  about: string;
  keyStatsNarrative: string;
  whyBrands: string;
  pricingNote: string;
}

export interface BrandMatch {
  brandId: string;
  name: string;
  fitScore: number; // 1..100
  reasons: string[];
  logoUrl?: string | null;
  website?: string | null;
  niche?: string[];
}

export interface RateBenchmark {
  deliverable: Deliverable;
  p25Paise: number | null;
  p50Paise: number | null;
  p75Paise: number | null;
  sampleSize: number | null;
}

/** Commission is 5% of deal value (PRD §21) — matches COMMISSION_PCT in @/lib/pricing. */
export const COMMISSION_BPS = 500;
export function commissionPaise(valuePaise: number, bps = COMMISSION_BPS): number {
  return Math.round((valuePaise * bps) / 10_000);
}
