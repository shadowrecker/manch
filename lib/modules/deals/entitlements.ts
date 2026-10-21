import { dealsTier, type DealsTier, type Plan } from '@/lib/plans';

// Server-authoritative Deals limits (PRD §21/§12). Two metered actions — media
// kits and pitches — each with its own monthly quota. The 5% commission applies
// on every plan (see lib/modules/deals/types commissionPaise).
//
// Every exported function takes the Manch account `Plan` and maps it to the
// Deals tier with dealsTier(); the limits table stays keyed by the Deals tier
// (free | creator | pro | brand), exactly as CreatorStack shipped it.

export interface PlanLimits {
  mediaKitsPerMonth: number;
  pitchesPerMonth: number;
  brandMatch: boolean;
  rateCalculator: boolean;
  dealTracker: boolean;
  contractReview: boolean; // v1.1
}

export const FAIR_USE_CAP = 1000;

/** Limits by Deals tier. */
export const PLANS: Record<DealsTier, PlanLimits> = {
  free: { mediaKitsPerMonth: 1, pitchesPerMonth: 3, brandMatch: false, rateCalculator: false, dealTracker: false, contractReview: false },
  creator: { mediaKitsPerMonth: FAIR_USE_CAP, pitchesPerMonth: 10, brandMatch: true, rateCalculator: true, dealTracker: true, contractReview: false },
  pro: { mediaKitsPerMonth: FAIR_USE_CAP, pitchesPerMonth: FAIR_USE_CAP, brandMatch: true, rateCalculator: true, dealTracker: true, contractReview: true },
  brand: { mediaKitsPerMonth: 0, pitchesPerMonth: 0, brandMatch: true, rateCalculator: true, dealTracker: false, contractReview: false },
};
/** Alias with a clearer name for the tier-keyed table. */
export const TIER_LIMITS = PLANS;

/** Limits for a Manch plan (unknown → free). */
export function planLimits(plan: Plan): PlanLimits {
  return PLANS[dealsTier(plan)] ?? PLANS.free;
}

export interface QuotaState {
  used: number;
  limit: number;
  remaining: number;
  exceeded: boolean;
  unlimited: boolean;
}

function quota(limit: number, used: number): QuotaState {
  return { used, limit, remaining: Math.max(0, limit - used), exceeded: used >= limit, unlimited: limit >= FAIR_USE_CAP };
}

export function mediaKitQuota(plan: Plan, used: number): QuotaState {
  return quota(planLimits(plan).mediaKitsPerMonth, used);
}
export function pitchQuota(plan: Plan, used: number): QuotaState {
  return quota(planLimits(plan).pitchesPerMonth, used);
}

export function canMatch(plan: Plan): boolean {
  return planLimits(plan).brandMatch;
}
export function canRate(plan: Plan): boolean {
  return planLimits(plan).rateCalculator;
}
export function canTrackDeals(plan: Plan): boolean {
  return planLimits(plan).dealTracker;
}
export function canReviewContracts(plan: Plan): boolean {
  return planLimits(plan).contractReview;
}
