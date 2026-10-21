import { NextResponse } from 'next/server';
import { getUser } from '@/lib/supabase/server';
import { manualMetrics, type ManualMetricsInput } from '@/lib/modules/deals/instagram/metrics';
import { captureException } from '@/lib/observability';
import type { ApiError } from '@/lib/types';

// POST /api/deals/instagram/manual — the Meta-review fallback: a creator enters their
// own stats + profile, snapshotted like a real metric pull.
export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json<ApiError>({ error: 'unauthorized' }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json<ApiError>({ error: 'invalid_json' }, { status: 400 });
  }

  const followers = typeof body.followers === 'number' ? body.followers : Number(body.followers);
  if (!Number.isFinite(followers) || followers < 0) {
    return NextResponse.json<ApiError>({ error: 'followers_required' }, { status: 400 });
  }

  const input: ManualMetricsInput = {
    followers,
    engagementRate: typeof body.engagementRate === 'number' ? body.engagementRate : undefined,
    avgLikes: typeof body.avgLikes === 'number' ? body.avgLikes : undefined,
    avgComments: typeof body.avgComments === 'number' ? body.avgComments : undefined,
    topCategories: Array.isArray(body.topCategories) ? (body.topCategories as string[]) : undefined,
    niche: Array.isArray(body.niche) ? (body.niche as string[]) : undefined,
    contentStyle: typeof body.contentStyle === 'string' ? body.contentStyle : undefined,
    city: typeof body.city === 'string' ? body.city : undefined,
    primaryLanguage: typeof body.primaryLanguage === 'string' ? body.primaryLanguage : undefined,
  };

  try {
    await manualMetrics(user.id, input);
    return NextResponse.json({ ok: true });
  } catch (e) {
    captureException(e, { route: 'deals/instagram/manual', userId: user.id });
    return NextResponse.json<ApiError>({ error: 'could_not_save' }, { status: 500 });
  }
}
