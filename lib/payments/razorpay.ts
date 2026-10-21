import crypto from 'node:crypto';
import Razorpay from 'razorpay';
import { env, requireEnv } from '@/lib/env';
import { CONTENT_PACK_PRICE_PAISE, MAKEOVER_PRICE_PAISE } from '@/lib/pricing';
import { randomId } from '@/lib/utils';
import type { SelfServePlan } from '@/lib/plans';

// Server-only Razorpay integration for every module (one account). Entitlements
// are ALWAYS derived from verified webhooks (app/api/razorpay/webhook), never
// from the client — this module only creates subscriptions/orders and verifies
// webhook signatures. requireEnv() is called at the point of use so the module
// imports/compiles without secrets and fails loudly only when payments run.

export type Billing = 'monthly' | 'yearly';

let _client: Razorpay | null = null;

/** Authenticated Razorpay SDK client. Throws clearly if keys are absent. */
export function razorpay(): Razorpay {
  if (!_client) {
    _client = new Razorpay({
      key_id: requireEnv(env.razorpayKeyId, 'RAZORPAY_KEY_ID'),
      key_secret: requireEnv(env.razorpayKeySecret, 'RAZORPAY_KEY_SECRET'),
    });
  }
  return _client;
}

// Maps (plan, billing) -> the configured Razorpay plan_id env key.
const PLAN_ENV_KEYS: Record<SelfServePlan, Record<Billing, keyof typeof env.razorpayPlans>> = {
  plus: { monthly: 'plusMonthly', yearly: 'plusYearly' },
  pro: { monthly: 'proMonthly', yearly: 'proYearly' },
  team: { monthly: 'teamMonthly', yearly: 'teamYearly' },
  brand: { monthly: 'brandMonthly', yearly: 'brandYearly' },
};

/** Resolve the Razorpay plan_id for a paid plan + billing cycle. */
export function planIdFor(plan: SelfServePlan, billing: Billing): string {
  const key = PLAN_ENV_KEYS[plan][billing];
  return requireEnv(env.razorpayPlans[key], `RZP_PLAN_${plan.toUpperCase()}_${billing.toUpperCase()}`);
}

/**
 * Reverse-lookup a plan from a Razorpay plan_id (webhook side). Returns null if
 * the plan_id is unknown (e.g. a leftover from a deleted plan).
 */
export function planFromPlanId(planId: string): SelfServePlan | null {
  if (!planId) return null;
  for (const plan of Object.keys(PLAN_ENV_KEYS) as SelfServePlan[]) {
    for (const billing of ['monthly', 'yearly'] as const) {
      const candidate = env.razorpayPlans[PLAN_ENV_KEYS[plan][billing]];
      if (candidate && candidate === planId) return plan;
    }
  }
  return null;
}

/**
 * Create a Razorpay subscription. Yearly is billed once (total_count 1); monthly
 * for 12 cycles. customer_notify=1 lets Razorpay handle reminders.
 */
export async function createSubscription(plan: SelfServePlan, billing: Billing, userId?: string) {
  return razorpay().subscriptions.create({
    plan_id: planIdFor(plan, billing),
    total_count: billing === 'yearly' ? 1 : 12,
    customer_notify: 1,
    ...(userId ? { notes: { user_id: userId, plan } } : {}),
  } as Parameters<Razorpay['subscriptions']['create']>[0]);
}

/** One-time ₹199 Profile Makeover order (Post). Receipt is unique per call. */
export async function createMakeoverOrder() {
  return razorpay().orders.create({
    amount: MAKEOVER_PRICE_PAISE,
    currency: 'INR',
    receipt: `makeover_${randomId(8)}`,
  });
}

/** One-time ₹49 content-pack order (Reels, 10 credits). */
export async function createContentPackOrder() {
  return razorpay().orders.create({
    amount: CONTENT_PACK_PRICE_PAISE,
    currency: 'INR',
    receipt: `pack_${randomId(8)}`,
  });
}

/**
 * Verify a Razorpay webhook signature (HMAC-SHA256 of the raw body using the
 * webhook secret), constant-time. Returns false on any missing input or
 * mismatch — callers MUST reject on false.
 */
export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  if (!signature) return false;
  const secret = env.razorpayWebhookSecret;
  if (!secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(signature, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
