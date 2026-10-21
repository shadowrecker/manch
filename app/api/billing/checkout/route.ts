import { NextResponse } from 'next/server';
import { getUser } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  createContentPackOrder,
  createMakeoverOrder,
  createSubscription,
  type Billing,
} from '@/lib/payments/razorpay';
import { CONTENT_PACK_CREDITS, CONTENT_PACK_PRICE_PAISE, MAKEOVER_PRICE_PAISE } from '@/lib/pricing';
import { isSelfServe } from '@/lib/plans';
import { env } from '@/lib/env';
import { EVENTS, captureServer } from '@/lib/analytics';
import { rateLimit } from '@/lib/ratelimit';
import { log, captureException } from '@/lib/observability';
import type { ApiError } from '@/lib/types';

// POST /api/billing/checkout — the ONE checkout for every module.
//   Body { plan: "plus"|"pro"|"team"|"brand", billing?: "monthly"|"yearly" }
//     -> 200 { type:"subscription", subscriptionId, keyId }
//   Body { kind: "makeover" | "content_pack" }
//     -> 200 { type:"order", orderId, amount, keyId }
//   -> 401 unauthorized | 400 invalid input | 429 rate limited | 500 Razorpay error
//
// The client opens Razorpay Checkout with the returned id. Entitlements are NOT
// granted here — only the verified webhook flips the plan / grants credits. We
// persist a "created" row so the webhook can match the payment back to a user.

export async function POST(req: Request) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json<ApiError>({ error: 'unauthorized' }, { status: 401 });
  }

  // Abuse guard: creating Razorpay objects costs API calls.
  const rl = await rateLimit(`checkout:${user.id}`, { limit: 10, windowSeconds: 60 });
  if (!rl.success) {
    return NextResponse.json<ApiError>(
      { error: 'Too many attempts. Please wait a moment.', code: 'rate_limited' },
      { status: 429 },
    );
  }

  let body: { plan?: unknown; billing?: unknown; kind?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json<ApiError>({ error: 'invalid JSON body' }, { status: 400 });
  }

  const billing: Billing = body.billing === 'yearly' ? 'yearly' : 'monthly';
  const kind = body.kind === 'makeover' || body.kind === 'content_pack' ? body.kind : undefined;
  const plan = typeof body.plan === 'string' && isSelfServe(body.plan) ? body.plan : undefined;

  if (!kind && !plan) {
    return NextResponse.json<ApiError>(
      { error: 'Pick a paid plan to subscribe.', code: 'invalid_plan' },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  try {
    // --- One-time orders (Post makeover / Reels content pack) ---------------
    if (kind) {
      const isPack = kind === 'content_pack';
      const order = isPack ? await createContentPackOrder() : await createMakeoverOrder();
      const amount = isPack ? CONTENT_PACK_PRICE_PAISE : MAKEOVER_PRICE_PAISE;

      const { error } = await admin.from('one_time_purchases').insert({
        user_id: user.id,
        kind,
        rzp_order_id: order.id,
        amount_paise: amount,
        credits: isPack ? CONTENT_PACK_CREDITS : 0,
        status: 'created',
      });
      if (error) throw error;

      await captureServer(EVENTS.upgradeClicked, user.id, { kind });
      return NextResponse.json({
        type: 'order' as const,
        orderId: order.id,
        amount,
        keyId: env.razorpayKeyIdPublic,
      });
    }

    // --- Recurring subscription --------------------------------------------
    const subscription = await createSubscription(plan!, billing, user.id);
    const { error } = await admin.from('subscriptions').insert({
      user_id: user.id,
      plan: plan!,
      rzp_subscription_id: subscription.id,
      status: 'created',
    });
    if (error) throw error;

    await captureServer(EVENTS.upgradeClicked, user.id, { plan, billing });
    return NextResponse.json({
      type: 'subscription' as const,
      subscriptionId: subscription.id,
      keyId: env.razorpayKeyIdPublic,
    });
  } catch (e) {
    captureException(e, { route: 'POST /api/billing/checkout', userId: user.id, plan, kind });
    log.error('checkout failed', { userId: user.id, error: String(e) });
    return NextResponse.json<ApiError>(
      { error: 'Could not start checkout. Please try again.' },
      { status: 500 },
    );
  }
}
