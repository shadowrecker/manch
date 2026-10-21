import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { isoWeekMonday } from '@/lib/utils';
import { log } from '@/lib/observability';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET|POST /api/reels/cron/audio — weekly trending-audio refresh. Vercel Cron
// calls it with GET; POST is kept for manual/QStash triggers. Audio rows need
// real source data, so this pulls from a licensed/official provider when
// configured (PRD §8.3 — no hard-scraping). Without a provider it is a no-op
// that a curator fills manually. Auth: Authorization: Bearer ${CRON_SECRET}.

function authorized(req: Request): boolean {
  if (!env.cronSecret) return false;
  return req.headers.get('authorization') === `Bearer ${env.cronSecret}`;
}

async function handle(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const week = isoWeekMonday();
  if (!env.trendDataProviderKey) {
    // No licensed provider wired yet — curation is manual this week.
    log.info('cron audio: no provider configured, skipping', { week });
    return NextResponse.json({ ok: true, week, fetched: 0, note: 'no provider configured' });
  }

  // When a provider IS configured, fetch + upsert uncurated candidate rows here.
  // Left as the integration point per §8.3 (official/licensed sources only).
  log.info('cron audio: provider configured', { week });
  return NextResponse.json({ ok: true, week, fetched: 0 });
}

export const GET = handle;
export const POST = handle;
