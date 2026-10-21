import { NextResponse } from 'next/server';
import { getUser } from '@/lib/supabase/server';
import { getPlan } from '@/lib/db/queries';
import { getMonthlyUsage } from '@/lib/modules/deals/queries';
import { mediaKitQuota } from '@/lib/modules/deals/entitlements';
import { rateLimit } from '@/lib/ratelimit';
import { generateMediaKitForUser, NoMetricsError } from '@/lib/modules/deals/services/mediakit';
import { log, captureException } from '@/lib/observability';
import type { ApiError } from '@/lib/types';

// POST /api/deals/media-kit/generate
//  200 { kitId, shareId, data, metrics } | 401 | 402 limit | 409 no_metrics | 429
export async function POST() {
  const user = await getUser();
  if (!user) return NextResponse.json<ApiError>({ error: 'unauthorized' }, { status: 401 });

  const rl = await rateLimit(`kit:${user.id}`, { limit: 10, windowSeconds: 60 });
  if (!rl.success) {
    return NextResponse.json<ApiError>({ error: 'Slow down a moment.', code: 'rate_limited' }, { status: 429 });
  }

  const [plan, usage] = await Promise.all([getPlan(user.id), getMonthlyUsage(user.id)]);
  if (mediaKitQuota(plan, usage.mediaKits).exceeded) {
    return NextResponse.json<ApiError>(
      { error: 'Free includes 1 media kit. Upgrade for unlimited.', code: 'limit_reached' },
      { status: 402 },
    );
  }

  try {
    const result = await generateMediaKitForUser(user.id);
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof NoMetricsError) {
      return NextResponse.json<ApiError>(
        { error: 'Connect Instagram or enter your stats first.', code: 'no_metrics' },
        { status: 409 },
      );
    }
    captureException(e, { route: 'deals/media-kit/generate', userId: user.id });
    log.error('media kit generation failed', { userId: user.id, error: String(e) });
    return NextResponse.json<ApiError>({ error: 'Could not build your media kit.' }, { status: 500 });
  }
}
