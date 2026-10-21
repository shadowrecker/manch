import { reelsTier, type Plan, type ReelsTier } from '@/lib/plans';

// Server-authoritative Reels limits + the credit-aware generation gate (PRD §12).
// Every exported function takes the Manch `Plan` and resolves it to the Reels
// tier with reelsTier(); the limits table itself stays keyed by tier
// (free | bharat | creator | agency). Pure — safe to import on the client.

export interface PlanLimits {
  piecesPerMonth: number; // FAIR_USE_CAP for "unlimited"
  watermark: boolean;
  repurpose: boolean; // v1.1
  calendar: boolean; // v1.1
  agencyTools: boolean; // bulk + white-label + brand presets
  teamSeats: number;
}

/** Fair-use ceiling protecting the thin entry-tier AI economics (PRD §17). */
export const FAIR_USE_CAP = 1000;

/** Limits per Reels tier (plus → bharat, pro → creator, team → agency). */
export const TIER_LIMITS: Record<ReelsTier, PlanLimits> = {
  free: { piecesPerMonth: 5, watermark: true, repurpose: false, calendar: false, agencyTools: false, teamSeats: 0 },
  bharat: { piecesPerMonth: 30, watermark: false, repurpose: false, calendar: false, agencyTools: false, teamSeats: 0 },
  creator: { piecesPerMonth: FAIR_USE_CAP, watermark: false, repurpose: true, calendar: true, agencyTools: false, teamSeats: 0 },
  agency: { piecesPerMonth: FAIR_USE_CAP, watermark: false, repurpose: true, calendar: true, agencyTools: true, teamSeats: 10 },
};

/** The Reels limits for a Manch plan (unknown → free). */
export function planLimits(plan: Plan): PlanLimits {
  return TIER_LIMITS[reelsTier(plan)] ?? TIER_LIMITS.free;
}

export interface QuotaState {
  used: number;
  limit: number;
  remaining: number;
  exceeded: boolean;
  unlimited: boolean;
}

export function quotaState(plan: Plan, used: number): QuotaState {
  const limit = planLimits(plan).piecesPerMonth;
  const unlimited = limit >= FAIR_USE_CAP;
  return { used, limit, remaining: Math.max(0, limit - used), exceeded: used >= limit, unlimited };
}

export function needsWatermark(plan: Plan): boolean {
  return planLimits(plan).watermark;
}
export function canAgency(plan: Plan): boolean {
  return planLimits(plan).agencyTools;
}
export function canRepurpose(plan: Plan): boolean {
  return planLimits(plan).repurpose;
}

export const WATERMARK_TEXT = 'Made with Manch';

/** Append the free-tier watermark unless the plan is paid (idempotent). */
export function applyWatermark(body: string, plan: Plan): string {
  if (!needsWatermark(plan)) return body;
  if (body.includes(WATERMARK_TEXT)) return body;
  return `${body}\n\n${WATERMARK_TEXT}`;
}

// The §12 mechanic: a generation consumes the monthly quota FIRST, then a wallet
// credit, then is blocked (paywall). One source of truth for web + WhatsApp.
export interface GenerationAllowance {
  allowed: boolean;
  via: 'quota' | 'credit' | 'none';
  quota: QuotaState;
  credits: number;
}

export function generationAllowance(plan: Plan, used: number, credits: number): GenerationAllowance {
  const quota = quotaState(plan, used);
  if (!quota.exceeded) return { allowed: true, via: 'quota', quota, credits };
  if (credits > 0) return { allowed: true, via: 'credit', quota, credits };
  return { allowed: false, via: 'none', quota, credits };
}
