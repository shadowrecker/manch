// Manch plans — ONE subscription unlocks every module.
//
// Each module (Post, Reels, Deals, Check) keeps its own, already-tested limits
// table keyed by a module-local "tier". This file is the single bridge: a Manch
// plan resolves to exactly one tier per module. Changing what a plan includes
// is a one-line edit to MODULE_TIERS. Client-safe (no server imports).

/** The account-level plan stored on profiles.plan / subscriptions.plan. */
export type Plan = 'free' | 'plus' | 'pro' | 'team' | 'brand' | 'newsroom' | 'telco' | 'grant';

export const PLANS: Plan[] = ['free', 'plus', 'pro', 'team', 'brand', 'newsroom', 'telco', 'grant'];

/** Self-serve consumer plans (Razorpay checkout from the billing page). */
export const SELF_SERVE_PLANS = ['plus', 'pro', 'team', 'brand'] as const;
export type SelfServePlan = (typeof SELF_SERVE_PLANS)[number];

/** Sales-led B2B/B2G plans — provisioned by hand, never via self-serve checkout. */
export const SALES_LED_PLANS = ['newsroom', 'telco', 'grant'] as const;

export type ModuleKey = 'post' | 'reels' | 'deals' | 'check';
export const MODULES: ModuleKey[] = ['post', 'reels', 'deals', 'check'];

// Module-local tiers (formerly each app's own `Plan` type).
export type PostTier = 'free' | 'solo' | 'pro' | 'team';
export type ReelsTier = 'free' | 'bharat' | 'creator' | 'agency';
export type DealsTier = 'free' | 'creator' | 'pro' | 'brand';
export type CheckTier = 'free' | 'personal' | 'newsroom' | 'telco' | 'grant';

export interface ModuleTiers {
  post: PostTier;
  reels: ReelsTier;
  deals: DealsTier;
  check: CheckTier;
}

export const MODULE_TIERS: Record<Plan, ModuleTiers> = {
  free: { post: 'free', reels: 'free', deals: 'free', check: 'free' },
  plus: { post: 'solo', reels: 'bharat', deals: 'creator', check: 'personal' },
  pro: { post: 'pro', reels: 'creator', deals: 'pro', check: 'personal' },
  team: { post: 'team', reels: 'agency', deals: 'pro', check: 'personal' },
  // B2B: a brand account gets the Brand Dashboard; a newsroom/telco/grant
  // account gets the fact-check API. Consumer modules stay on free for them.
  brand: { post: 'free', reels: 'free', deals: 'brand', check: 'personal' },
  newsroom: { post: 'free', reels: 'free', deals: 'free', check: 'newsroom' },
  telco: { post: 'free', reels: 'free', deals: 'free', check: 'telco' },
  grant: { post: 'free', reels: 'free', deals: 'free', check: 'grant' },
};

/** Coerce any stored/untrusted value to a known Plan (unknown → free). */
export function normalisePlan(raw: string | null | undefined): Plan {
  return (PLANS as string[]).includes(raw ?? '') ? (raw as Plan) : 'free';
}

export function moduleTiers(plan: Plan | string | null | undefined): ModuleTiers {
  return MODULE_TIERS[normalisePlan(plan)];
}

export const postTier = (plan: Plan | string | null | undefined): PostTier => moduleTiers(plan).post;
export const reelsTier = (plan: Plan | string | null | undefined): ReelsTier => moduleTiers(plan).reels;
export const dealsTier = (plan: Plan | string | null | undefined): DealsTier => moduleTiers(plan).deals;
export const checkTier = (plan: Plan | string | null | undefined): CheckTier => moduleTiers(plan).check;

export function isPaid(plan: Plan | string | null | undefined): boolean {
  return normalisePlan(plan) !== 'free';
}

export function isSelfServe(plan: string): plan is SelfServePlan {
  return (SELF_SERVE_PLANS as readonly string[]).includes(plan);
}

/** Display label for a plan (badges, nav, billing). */
export const PLAN_LABEL: Record<Plan, string> = {
  free: 'Free',
  plus: 'Plus',
  pro: 'Pro',
  team: 'Team',
  brand: 'Brand',
  newsroom: 'Newsroom',
  telco: 'Telco',
  grant: 'Grant',
};
