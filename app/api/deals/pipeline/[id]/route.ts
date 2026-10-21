import { NextResponse } from 'next/server';
import { getUser } from '@/lib/supabase/server';
import { updateDeal } from '@/lib/modules/deals/services/deals';
import { DEAL_STATUSES, type DealStatus } from '@/lib/modules/deals/types';
import { log, captureException } from '@/lib/observability';
import type { ApiError } from '@/lib/types';

export const runtime = 'nodejs';

// PATCH /api/deals/pipeline/[id] — update status / value / title (owner-scoped).
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await getUser();
  if (!user) return NextResponse.json<ApiError>({ error: 'unauthorized' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { status?: string; valueRupees?: number; title?: string };

  const patch: { status?: DealStatus; valuePaise?: number | null; title?: string | null } = {};
  if (body.status !== undefined) {
    if (!DEAL_STATUSES.includes(body.status as DealStatus)) {
      return NextResponse.json<ApiError>({ error: 'Invalid status', code: 'bad_request' }, { status: 400 });
    }
    patch.status = body.status as DealStatus;
  }
  if (body.valueRupees !== undefined) {
    patch.valuePaise =
      Number.isFinite(body.valueRupees) && body.valueRupees > 0 ? Math.round(body.valueRupees * 100) : null;
  }
  if (body.title !== undefined) patch.title = body.title.trim() || null;

  try {
    const deal = await updateDeal(user.id, params.id, patch);
    return NextResponse.json({ deal });
  } catch (e) {
    captureException(e, { route: 'deals/pipeline/[id]', userId: user.id });
    log.error('deal update failed', { userId: user.id, dealId: params.id, error: String(e) });
    return NextResponse.json<ApiError>({ error: 'Could not update the deal.' }, { status: 500 });
  }
}
