import { createAdminClient } from '@/lib/supabase/admin';
import { planFromPlanId } from '@/lib/payments/razorpay';
import { normalisePlan } from '@/lib/plans';
import { EVENTS, captureServer } from '@/lib/analytics';
import { grantCredits } from '@/lib/modules/reels/payments/credits';
import { log } from '@/lib/observability';

// Server-only billing lifecycle, driven ONLY by the verified Razorpay webhook.
// Every function is idempotent: Razorpay retries deliveries, and the webhook
// returns 500 on failure precisely so that a retry can finish the job.

type Admin = ReturnType<typeof createAdminClient>;

const now = () => new Date().toISOString();

export function isoFromUnix(seconds?: number | null): string | null {
  return seconds ? new Date(seconds * 1000).toISOString() : null;
}

/**
 * subscription.activated / subscription.charged — mark active, set the period
 * end and flip the owner's plan. The plan comes from the verified plan_id,
 * falling back to what we recorded at checkout.
 */
export async function activateSubscription(
  rzpSubscriptionId: string,
  rzpPlanId: string | null | undefined,
  currentPeriodEnd: string | null,
  admin: Admin = createAdminClient(),
): Promise<void> {
  const { data: row } = await admin
    .from('subscriptions')
    .select('id, user_id, plan')
    .eq('rzp_subscription_id', rzpSubscriptionId)
    .maybeSingle();
  if (!row) {
    log.warn('billing: no subscription row for activation', { rzpSubscriptionId });
    return;
  }

  const plan = (rzpPlanId ? planFromPlanId(rzpPlanId) : null) ?? row.plan;
  await admin
    .from('subscriptions')
    .update({ status: 'active', plan, current_period_end: currentPeriodEnd, updated_at: now() })
    .eq('id', row.id);

  if (row.user_id) {
    await admin.from('profiles').update({ plan: normalisePlan(plan), updated_at: now() }).eq('id', row.user_id);
    await captureServer(EVENTS.subscriptionActivated, row.user_id, { plan });
  }
}

/** subscription.halted — failed payments. Do NOT downgrade yet (Razorpay may recover). */
export async function haltSubscription(rzpSubscriptionId: string, admin: Admin = createAdminClient()) {
  await admin
    .from('subscriptions')
    .update({ status: 'halted', updated_at: now() })
    .eq('rzp_subscription_id', rzpSubscriptionId);
}

/**
 * subscription.cancelled / subscription.completed — keep access until the paid
 * period ends; downgrade to free immediately only if it already has.
 */
export async function endSubscription(
  rzpSubscriptionId: string,
  status: 'cancelled' | 'completed',
  currentPeriodEnd: string | null,
  admin: Admin = createAdminClient(),
): Promise<void> {
  const { data: row } = await admin
    .from('subscriptions')
    .select('id, user_id')
    .eq('rzp_subscription_id', rzpSubscriptionId)
    .maybeSingle();
  if (!row) {
    log.warn('billing: no subscription row for cancellation', { rzpSubscriptionId });
    return;
  }

  const stillActive = currentPeriodEnd ? new Date(currentPeriodEnd).getTime() > Date.now() : false;
  await admin
    .from('subscriptions')
    .update({ status, cancel_at_period_end: stillActive, current_period_end: currentPeriodEnd, updated_at: now() })
    .eq('id', row.id);

  if (!stillActive && row.user_id) {
    await admin.from('profiles').update({ plan: 'free', updated_at: now() }).eq('id', row.user_id);
  }
}

export type PurchaseResult = 'unknown_order' | 'already_paid' | 'paid';

/**
 * payment.captured for a one-time order. Claims the purchase with a conditional
 * update (status != 'paid') so a retried delivery can never grant credits twice;
 * if granting fails, the claim is released so the retry can try again.
 */
export async function completeOneTimePurchase(
  rzpOrderId: string,
  rzpPaymentId: string | null,
  admin: Admin = createAdminClient(),
): Promise<PurchaseResult> {
  const { data: claimed } = await admin
    .from('one_time_purchases')
    .update({ status: 'paid', rzp_payment_id: rzpPaymentId })
    .eq('rzp_order_id', rzpOrderId)
    .neq('status', 'paid')
    .select('id, user_id, kind, credits')
    .maybeSingle();

  if (!claimed) {
    const { data: existing } = await admin
      .from('one_time_purchases')
      .select('id')
      .eq('rzp_order_id', rzpOrderId)
      .maybeSingle();
    return existing ? 'already_paid' : 'unknown_order';
  }

  if (claimed.kind === 'content_pack' && claimed.credits > 0) {
    try {
      await grantCredits(claimed.user_id, claimed.credits, 'pack_purchase', rzpOrderId);
    } catch (e) {
      await admin.from('one_time_purchases').update({ status: 'created' }).eq('id', claimed.id);
      throw e;
    }
    await captureServer(EVENTS.contentPackPurchased, claimed.user_id, { credits: claimed.credits });
  }
  return 'paid';
}
