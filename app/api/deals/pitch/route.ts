import { NextResponse } from 'next/server';
import { getUser } from '@/lib/supabase/server';
import { getPlan } from '@/lib/db/queries';
import { getMonthlyUsage } from '@/lib/modules/deals/queries';
import { pitchQuota } from '@/lib/modules/deals/entitlements';
import { rateLimit } from '@/lib/ratelimit';
import { generatePitchForBrand, normalizeDeliverables, NoBrandError, NoProfileError } from '@/lib/modules/deals/services/pitch';
import { log, captureException } from '@/lib/observability';
import type { ApiError } from '@/lib/types';

export const runtime = 'nodejs';

// POST /api/deals/pitch  { brandId, deliverables? }
//  200 { pitchId, subject, body, ... } | 400 | 401 | 402 limit | 404 brand | 409 no_profile | 429
export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json<ApiError>({ error: 'unauthorized' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { brandId?: string; deliverables?: unknown };
  if (!body.brandId || typeof body.brandId !== 'string') {
    return NextResponse.json<ApiError>({ error: 'brandId is required', code: 'bad_request' }, { status: 400 });
  }

  const rl = await rateLimit(`pitch:${user.id}`, { limit: 12, windowSeconds: 60 });
  if (!rl.success) {
    return NextResponse.json<ApiError>({ error: 'Slow down a moment.', code: 'rate_limited' }, { status: 429 });
  }

  const [plan, usage] = await Promise.all([getPlan(user.id), getMonthlyUsage(user.id)]);
  if (pitchQuota(plan, usage.pitches).exceeded) {
    return NextResponse.json<ApiError>(
      { error: 'You’ve used your pitches for this month. Upgrade for more.', code: 'limit_reached' },
      { status: 402 },
    );
  }

  try {
    const result = await generatePitchForBrand(user.id, body.brandId, normalizeDeliverables(body.deliverables));
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof NoBrandError) {
      return NextResponse.json<ApiError>({ error: 'That brand could not be found.', code: 'not_found' }, { status: 404 });
    }
    if (e instanceof NoProfileError) {
      return NextResponse.json<ApiError>(
        { error: 'Connect Instagram or enter your stats first.', code: 'no_profile' },
        { status: 409 },
      );
    }
    captureException(e, { route: 'deals/pitch', userId: user.id });
    log.error('pitch generation failed', { userId: user.id, error: String(e) });
    return NextResponse.json<ApiError>({ error: 'Could not write your pitch.' }, { status: 500 });
  }
}
