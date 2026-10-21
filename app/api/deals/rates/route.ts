import { NextResponse } from 'next/server';
import { getUser } from '@/lib/supabase/server';
import { getPlan } from '@/lib/db/queries';
import { canRate } from '@/lib/modules/deals/entitlements';
import { rateLimit } from '@/lib/ratelimit';
import { getRateCardWithRationale } from '@/lib/modules/deals/services/rates';
import { captureServer, EVENTS } from '@/lib/analytics';
import { log, captureException } from '@/lib/observability';
import type { ApiError } from '@/lib/types';

export const runtime = 'nodejs';

// POST /api/deals/rates — the creator's data-backed rate card + AI negotiation rationale.
//  200 { rates, rationale, suggestedRatePaise } | 401 | 402 plan | 409 no_profile | 429
export async function POST() {
  const user = await getUser();
  if (!user) return NextResponse.json<ApiError>({ error: 'unauthorized' }, { status: 401 });

  const plan = await getPlan(user.id);
  if (!canRate(plan)) {
    return NextResponse.json<ApiError>(
      { error: 'The Rate Calculator is a Plus feature. Upgrade to unlock.', code: 'upgrade_required' },
      { status: 402 },
    );
  }

  const rl = await rateLimit(`rates:${user.id}`, { limit: 10, windowSeconds: 60 });
  if (!rl.success) {
    return NextResponse.json<ApiError>({ error: 'Slow down a moment.', code: 'rate_limited' }, { status: 429 });
  }

  try {
    const card = await getRateCardWithRationale(user.id);
    if (!card) {
      return NextResponse.json<ApiError>(
        { error: 'Connect Instagram or enter your stats first.', code: 'no_profile' },
        { status: 409 },
      );
    }
    await captureServer(EVENTS.rateViewed, user.id, { niche: card.niche, band: card.band, count: card.rates.length });
    return NextResponse.json(card);
  } catch (e) {
    captureException(e, { route: 'deals/rates', userId: user.id });
    log.error('rate card failed', { userId: user.id, error: String(e) });
    return NextResponse.json<ApiError>({ error: 'Could not load your rate card.' }, { status: 500 });
  }
}
