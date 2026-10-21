import { checkTier, type CheckTier, type Plan } from '@/lib/plans';
import type { InputType, LanguageCode } from '@/lib/modules/check/types';
import { languageByCode } from '@/lib/modules/check/languages';

// Server-authoritative Check entitlements (PRD §27). Every exported function takes
// the Manch `Plan` and maps it to a Check tier with checkTier() (lib/plans.ts);
// the limits table stays keyed by the Check tier. The free tier is the public
// utility (10 text-only checks, English/Hindi); `personal` (Plus/Pro/Team/Brand)
// unlocks media + all languages; newsroom/telco/grant add API access.

export interface PlanLimits {
  checksPerMonth: number; // bot/web checks; newsroom is metered via api_keys.monthly_quota
  media: boolean; // image/video checks
  allLanguages: boolean; // false → English + Hindi only
  apiAccess: boolean; // the newsroom JSON API
  browserExtension: boolean; // v2
}

export const FAIR_USE_CAP = 2000;

/** Limits per Check tier (not per Manch plan — see checkTier()). */
export const TIER_LIMITS: Record<CheckTier, PlanLimits> = {
  free: { checksPerMonth: 10, media: false, allLanguages: false, apiAccess: false, browserExtension: false },
  personal: { checksPerMonth: FAIR_USE_CAP, media: true, allLanguages: true, apiAccess: false, browserExtension: true },
  newsroom: { checksPerMonth: FAIR_USE_CAP, media: true, allLanguages: true, apiAccess: true, browserExtension: false },
  telco: { checksPerMonth: FAIR_USE_CAP, media: true, allLanguages: true, apiAccess: true, browserExtension: false },
  grant: { checksPerMonth: FAIR_USE_CAP, media: true, allLanguages: true, apiAccess: true, browserExtension: false },
};

/** Limits for a Manch plan (unknown plan → free). */
export function planLimits(plan: Plan): PlanLimits {
  return TIER_LIMITS[checkTier(plan)] ?? TIER_LIMITS.free;
}

export interface QuotaState {
  used: number;
  limit: number;
  remaining: number;
  exceeded: boolean;
  unlimited: boolean;
}

export function checkQuota(plan: Plan, used: number): QuotaState {
  const limit = planLimits(plan).checksPerMonth;
  return {
    used,
    limit,
    remaining: Math.max(0, limit - used),
    exceeded: used >= limit,
    unlimited: limit >= FAIR_USE_CAP,
  };
}

/** Free tier is text-only; everyone else can check media (PRD §27). */
export function canCheckMedia(plan: Plan, type: InputType): boolean {
  if (type === 'text' || type === 'url') return true;
  return planLimits(plan).media;
}

/** Free tier supports English + Hindi only; everyone else gets all languages. */
export function languageAllowed(plan: Plan, lang: LanguageCode): boolean {
  if (planLimits(plan).allLanguages) return true;
  return !!languageByCode(lang)?.freeTier;
}

export function canUseApi(plan: Plan): boolean {
  return planLimits(plan).apiAccess;
}
