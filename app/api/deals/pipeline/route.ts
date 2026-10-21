import { NextResponse } from 'next/server';
import { getUser } from '@/lib/supabase/server';
import { getPlan } from '@/lib/db/queries';
import { canTrackDeals } from '@/lib/modules/deals/entitlements';
import { createDeal, listDeals } from '@/lib/modules/deals/services/deals';
import { normalizeDeliverables } from '@/lib/modules/deals/services/pitch';
import { log, captureException } from '@/lib/observability';
import type { ApiError } from '@/lib/types';

export const runtime = 'nodejs';

// GET /api/deals/pipeline — list the creator's deals.
export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json<ApiError>({ error: 'unauthorized' }, { status: 401 });
  const deals = await listDeals(user.id);
  return NextResponse.json({ deals });
}

// POST /api/deals/pipeline — create a Deal-lite record. { brandId?, brandName, title?, valueRupees?, deliverables? }
export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json<ApiError>({ error: 'unauthorized' }, { status: 401 });

  const plan = await getPlan(user.id);
  if (!canTrackDeals(plan)) {
    return NextResponse.json<ApiError>(
      { error: 'Deal tracking is a Plus feature. Upgrade to unlock.', code: 'upgrade_required' },
      { status: 402 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    brandId?: string;
    brandName?: string;
    title?: string;
    valueRupees?: number;
    deliverables?: unknown;
  };

  const valuePaise =
    typeof body.valueRupees === 'number' && Number.isFinite(body.valueRupees) && body.valueRupees > 0
      ? Math.round(body.valueRupees * 100)
      : null;

  try {
    const deal = await createDeal(user.id, {
      brandId: body.brandId ?? null,
      brandName: body.brandName?.trim() || null,
      title: body.title?.trim() || null,
      valuePaise,
      deliverables: normalizeDeliverables(body.deliverables),
    });
    return NextResponse.json({ deal });
  } catch (e) {
    captureException(e, { route: 'deals/pipeline', userId: user.id });
    log.error('deal create failed', { userId: user.id, error: String(e) });
    return NextResponse.json<ApiError>({ error: 'Could not create the deal.' }, { status: 500 });
  }
}
