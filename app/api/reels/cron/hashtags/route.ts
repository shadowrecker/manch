import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { env } from '@/lib/env';
import { LANGUAGE_CODES } from '@/lib/modules/reels/languages';
import { isoWeekMonday } from '@/lib/utils';
import { log, captureException } from '@/lib/observability';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET|POST /api/reels/cron/hashtags — weekly (Mon 6am IST) refresh of hashtag
// CANDIDATES. Vercel Cron calls it with GET; POST is kept for manual triggers.
// Creates uncurated rows for this week which a human (or an automated quality
// pass) then fills + flips to curated. Only curated rows are ever served (§8.3).
// Auth: Authorization: Bearer ${CRON_SECRET}.
const PLATFORMS = ['instagram', 'moj', 'josh', 'sharechat'] as const;

function authorized(req: Request): boolean {
  if (!env.cronSecret) return false;
  return req.headers.get('authorization') === `Bearer ${env.cronSecret}`;
}

async function handle(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const week = isoWeekMonday();
  const rows = LANGUAGE_CODES.flatMap((lang) =>
    PLATFORMS.map((platform) => ({
      language_code: lang,
      platform,
      week,
      tags: { high: [], mid: [], niche: [] },
      source: 'auto',
      curated: false,
    })),
  );

  try {
    const sb = createAdminClient();
    // ignoreDuplicates so we NEVER clobber an already-curated row for this week.
    const { error } = await sb
      .from('hashtag_sets')
      .upsert(rows, { onConflict: 'language_code,platform,week', ignoreDuplicates: true });
    if (error) throw error;
    log.info('cron hashtags: candidates ensured', { week, count: rows.length });
    return NextResponse.json({ ok: true, week, candidates: rows.length });
  } catch (e) {
    captureException(e, { route: `${req.method} /api/reels/cron/hashtags` });
    return NextResponse.json({ error: 'cron_failed' }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
