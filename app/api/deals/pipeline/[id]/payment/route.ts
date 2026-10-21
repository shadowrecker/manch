import { NextResponse } from 'next/server';
import { getUser } from '@/lib/supabase/server';
import { getPlan } from '@/lib/db/queries';
import { canTrackDeals } from '@/lib/modules/deals/entitlements';
import { rateLimit } from '@/lib/ratelimit';
import { generateDealPayment, NoDealError, NoValueError } from '@/lib/modules/deals/services/deals';
import { log, captureException } from '@/lib/observability';
import type { ApiError } from '@/lib/types';

export const runtime = 'nodejs';

// POST /api/deals/pipeline/[id]/payment — generate a Razorpay payment link (95/5 Route split).
//  200 { url, routed, needsKyc, ... } | 401 | 402 plan | 404 deal | 409 no_value | 429
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const user = await getUser();
  if (!user) return NextResponse.json<ApiError>({ error: 'unauthorized' }, { status: 401 });

  const plan = await getPlan(user.id);
  if (!canTrackDeals(plan)) {
    return NextResponse.json<ApiError>(
      { error: 'Deal tracking is a Plus feature. Upgrade to unlock.', code: 'upgrade_required' },
      { status: 402 },
    );
  }

  const rl = await rateLimit(`dealpay:${user.id}`, { limit: 6, windowSeconds: 60 });
  if (!rl.success) {
    return NextResponse.json<ApiError>({ error: 'Slow down a moment.', code: 'rate_limited' }, { status: 429 });
  }

  try {
    const result = await generateDealPayment(user.id, params.id);
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof NoDealError) {
      return NextResponse.json<ApiError>({ error: 'Deal not found.', code: 'not_found' }, { status: 404 });
    }
    if (e instanceof NoValueError) {
      return NextResponse.json<ApiError>(
        { error: 'Add the deal value before collecting payment.', code: 'no_value' },
        { status: 409 },
      );
    }
    captureException(e, { route: 'deals/pipeline/[id]/payment', userId: user.id });
    log.error('deal payment failed', { userId: user.id, dealId: params.id, error: String(e) });
    return NextResponse.json<ApiError>({ error: 'Could not generate the payment link.' }, { status: 500 });
  }
}
