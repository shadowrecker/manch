import { NextResponse } from 'next/server';
import { getUser } from '@/lib/supabase/server';
import { getPlan } from '@/lib/db/queries';
import { canMatch } from '@/lib/modules/deals/entitlements';
import { rateLimit } from '@/lib/ratelimit';
import { runMatch, NoProfileError, EmbeddingsUnavailableError } from '@/lib/modules/deals/match/engine';
import { log, captureException } from '@/lib/observability';
import type { ApiError } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

// POST /api/deals/matches — run the brand-match engine for the current creator.
//  200 { matches } | 401 | 402 plan | 409 no_profile | 429 | 503 embeddings off
export async function POST() {
  const user = await getUser();
  if (!user) return NextResponse.json<ApiError>({ error: 'unauthorized' }, { status: 401 });

  const plan = await getPlan(user.id);
  if (!canMatch(plan)) {
    return NextResponse.json<ApiError>(
      { error: 'Brand matches are a Plus feature. Upgrade to unlock.', code: 'upgrade_required' },
      { status: 402 },
    );
  }

  const rl = await rateLimit(`match:${user.id}`, { limit: 6, windowSeconds: 60 });
  if (!rl.success) {
    return NextResponse.json<ApiError>({ error: 'Slow down a moment.', code: 'rate_limited' }, { status: 429 });
  }

  try {
    const matches = await runMatch(user.id);
    return NextResponse.json({ matches });
  } catch (e) {
    if (e instanceof NoProfileError) {
      return NextResponse.json<ApiError>(
        { error: 'Connect Instagram or enter your stats first.', code: 'no_profile' },
        { status: 409 },
      );
    }
    if (e instanceof EmbeddingsUnavailableError) {
      return NextResponse.json<ApiError>(
        { error: 'Matching is temporarily unavailable.', code: 'embeddings_unavailable' },
        { status: 503 },
      );
    }
    captureException(e, { route: 'deals/matches', userId: user.id });
    log.error('match run failed', { userId: user.id, error: String(e) });
    return NextResponse.json<ApiError>({ error: 'Could not run brand matches.' }, { status: 500 });
  }
}
