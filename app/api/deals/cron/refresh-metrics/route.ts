import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { refreshConnectedMetrics } from '@/lib/modules/deals/services/metrics-refresh';
import { log, captureException } from '@/lib/observability';

export const runtime = 'nodejs';
export const maxDuration = 300;

// /api/deals/cron/refresh-metrics — periodic IG refresh. Cron-secret protected.
// Vercel Cron sends a GET with `Authorization: Bearer <CRON_SECRET>`; POST is
// also accepted for manual/queue triggering.
async function handle(req: Request): Promise<Response> {
  if (!env.cronSecret) {
    return NextResponse.json({ error: 'cron not configured' }, { status: 503 });
  }
  const auth = req.headers.get('authorization');
  const headerSecret = req.headers.get('x-cron-secret');
  const ok = auth === `Bearer ${env.cronSecret}` || headerSecret === env.cronSecret;
  if (!ok) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const summary = await refreshConnectedMetrics();
    return NextResponse.json({ ok: true, ...summary });
  } catch (e) {
    captureException(e, { route: 'deals/cron/refresh-metrics' });
    log.error('metrics refresh cron failed', { error: String(e) });
    return NextResponse.json({ error: 'refresh failed' }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
