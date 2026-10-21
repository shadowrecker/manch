import { postTier, type Plan, type PostTier } from '@/lib/plans';

// Server-authoritative Post limits. Every exported function takes the Manch
// account Plan (@/lib/plans) and maps it to the Post tier internally with
// postTier(); the limits table itself stays keyed by the Post tier
// (free | solo | pro | team). Mirrors the original Folio PRD §6/§12.

export interface PlanLimits {
  postsPerMonth: number;
  watermark: boolean;
  schedule: boolean; // LinkedIn scheduler
  thread: boolean; // X/Twitter thread (v1.1)
  meetingNotes: boolean; // v1.1
  trendRadar: boolean; // v1.1
  audit: boolean;
  teamSeats: number;
}

/** Fair-use ceiling that protects AI cost on "unlimited" tiers (PRD §12/§17). */
export const FAIR_USE_CAP = 300;

/** Post limits keyed by the Post tier (NOT the Manch plan). */
export const PLANS: Record<PostTier, PlanLimits> = {
  free: {
    postsPerMonth: 4,
    watermark: true,
    schedule: false,
    thread: false,
    meetingNotes: false,
    trendRadar: false,
    audit: true,
    teamSeats: 0,
  },
  solo: {
    postsPerMonth: 20,
    watermark: false,
    schedule: true,
    thread: false,
    meetingNotes: false,
    trendRadar: true,
    audit: true,
    teamSeats: 0,
  },
  pro: {
    postsPerMonth: FAIR_USE_CAP,
    watermark: false,
    schedule: true,
    thread: true,
    meetingNotes: true,
    trendRadar: true,
    audit: true,
    teamSeats: 1,
  },
  team: {
    postsPerMonth: FAIR_USE_CAP,
    watermark: false,
    schedule: true,
    thread: true,
    meetingNotes: true,
    trendRadar: true,
    audit: true,
    teamSeats: 10,
  },
};

/** Limits for a Manch plan (unknown plans fall back to free). */
export function planLimits(plan: Plan): PlanLimits {
  return PLANS[postTier(plan)] ?? PLANS.free;
}

export interface QuotaState {
  used: number;
  limit: number;
  remaining: number;
  exceeded: boolean;
  unlimited: boolean;
}

export function quotaState(plan: Plan, used: number): QuotaState {
  const limit = planLimits(plan).postsPerMonth;
  const unlimited = limit >= FAIR_USE_CAP;
  return {
    used,
    limit,
    remaining: Math.max(0, limit - used),
    exceeded: used >= limit,
    unlimited,
  };
}

export function canSchedule(plan: Plan): boolean {
  return planLimits(plan).schedule;
}
export function canThread(plan: Plan): boolean {
  return planLimits(plan).thread;
}
export function needsWatermark(plan: Plan): boolean {
  return planLimits(plan).watermark;
}

export const WATERMARK_TEXT = 'Written with Manch';

/** Append the free-tier watermark unless the plan is paid (idempotent). */
export function applyWatermark(body: string, plan: Plan): string {
  if (!needsWatermark(plan)) return body;
  if (body.includes(WATERMARK_TEXT)) return body;
  return `${body}\n\n${WATERMARK_TEXT}`;
}
