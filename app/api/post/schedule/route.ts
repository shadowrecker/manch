import { NextRequest, NextResponse } from 'next/server';
import { createClient, getUser } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPlan } from '@/lib/db/queries';
import { canSchedule } from '@/lib/modules/post/entitlements';
import { enqueue } from '@/lib/queue';
import { publishPost, LinkedInNotConnectedError } from '@/lib/modules/post/linkedin/post';
import { captureServer, EVENTS } from '@/lib/analytics';
import { log, captureException } from '@/lib/observability';

// POST /api/post/schedule — schedule or immediately publish a draft to LinkedIn.
//
// Cross-slice contract (consumed by the drafts/editor slice):
//   body  : { draftId: string, scheduledFor?: ISO-8601 }
//   200   : { ok: true, publishedPostId }
//   402   : { error, code: "upgrade" }          (scheduling is paid-only)
//   409   : { ok: false, code: "linkedin_not_connected" }
//
// Entitlements are enforced here on the server — never trust the client.

export const runtime = 'nodejs';

interface ScheduleBody {
  draftId?: unknown;
  scheduledFor?: unknown;
}

export async function POST(req: NextRequest): Promise<Response> {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let payload: ScheduleBody;
  try {
    payload = (await req.json()) as ScheduleBody;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const draftId = typeof payload.draftId === 'string' ? payload.draftId : '';
  if (!draftId) {
    return NextResponse.json({ error: 'draftId_required' }, { status: 400 });
  }

  // Parse an optional future schedule time.
  let scheduledFor: Date | null = null;
  if (typeof payload.scheduledFor === 'string' && payload.scheduledFor) {
    const d = new Date(payload.scheduledFor);
    if (Number.isNaN(d.getTime())) {
      return NextResponse.json({ error: 'invalid_scheduledFor' }, { status: 400 });
    }
    scheduledFor = d;
  }

  const plan = await getPlan(user.id);

  // Scheduling (a future time) is a paid feature. Immediate "publish now"
  // requests with no scheduledFor are allowed on every plan.
  const isFuture = !!scheduledFor && scheduledFor.getTime() > Date.now();
  if (isFuture && !canSchedule(plan)) {
    return NextResponse.json(
      { error: 'Scheduling is a paid feature', code: 'upgrade' },
      { status: 402 },
    );
  }

  // Load the draft via RLS so we only ever act on the caller's own row.
  const supabase = createClient();
  const { data: draft, error: draftErr } = await supabase
    .from('drafts')
    .select('id, body, status')
    .eq('id', draftId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (draftErr) {
    captureException(draftErr, { route: 'POST /api/post/schedule', userId: user.id, draftId });
    return NextResponse.json({ error: 'lookup_failed' }, { status: 500 });
  }
  if (!draft) {
    return NextResponse.json({ error: 'draft_not_found' }, { status: 404 });
  }

  const admin = createAdminClient();

  if (isFuture && scheduledFor) {
    // --- Future schedule: record + enqueue a delayed publish job ----------
    const { data: pp, error: ppErr } = await admin
      .from('published_posts')
      .insert({
        draft_id: draft.id,
        user_id: user.id,
        platform: 'linkedin',
        scheduled_for: scheduledFor.toISOString(),
        status: 'scheduled',
      })
      .select('id')
      .single();

    if (ppErr || !pp) {
      captureException(ppErr ?? new Error('insert returned no row'), {
        route: 'POST /api/post/schedule',
        userId: user.id,
        draftId,
      });
      return NextResponse.json({ error: 'schedule_failed' }, { status: 500 });
    }

    const delaySeconds = Math.max(0, Math.round((scheduledFor.getTime() - Date.now()) / 1000));
    try {
      await enqueue(
        '/api/post/jobs/publish',
        { publishedPostId: pp.id },
        { delaySeconds, deduplicationId: `publish:${pp.id}` },
      );
    } catch (e) {
      // Roll back the scheduled row so we don't leave an orphan that never fires.
      await admin.from('published_posts').delete().eq('id', pp.id);
      captureException(e, { route: 'POST /api/post/schedule', userId: user.id, draftId });
      return NextResponse.json({ error: 'enqueue_failed' }, { status: 500 });
    }

    // Reflect the scheduled state on the draft.
    await admin
      .from('drafts')
      .update({ status: 'scheduled', updated_at: new Date().toISOString() })
      .eq('id', draft.id);

    log.info('post scheduled', { userId: user.id, draftId, publishedPostId: pp.id });
    return NextResponse.json({ ok: true, publishedPostId: pp.id });
  }

  // --- Immediate publish ---------------------------------------------------
  // Record first so we always have a row to update with the outcome.
  const { data: pp, error: ppErr } = await admin
    .from('published_posts')
    .insert({
      draft_id: draft.id,
      user_id: user.id,
      platform: 'linkedin',
      status: 'scheduled',
    })
    .select('id')
    .single();

  if (ppErr || !pp) {
    captureException(ppErr ?? new Error('insert returned no row'), {
      route: 'POST /api/post/schedule',
      userId: user.id,
      draftId,
    });
    return NextResponse.json({ error: 'schedule_failed' }, { status: 500 });
  }

  try {
    const { externalId } = await publishPost(user.id, draft.body);
    const now = new Date().toISOString();

    await admin
      .from('published_posts')
      .update({ status: 'published', external_id: externalId || null, published_at: now })
      .eq('id', pp.id);

    await admin
      .from('drafts')
      .update({ status: 'published', updated_at: now })
      .eq('id', draft.id);

    await captureServer(EVENTS.postPublished, user.id, { platform: 'linkedin', plan });
    log.info('post published', { userId: user.id, draftId, publishedPostId: pp.id, externalId });
    return NextResponse.json({ ok: true, publishedPostId: pp.id });
  } catch (e) {
    // Mark the attempt failed regardless of cause.
    await admin
      .from('published_posts')
      .update({ status: 'failed', error: e instanceof Error ? e.message : String(e) })
      .eq('id', pp.id);

    if (e instanceof LinkedInNotConnectedError) {
      return NextResponse.json(
        { ok: false, code: 'linkedin_not_connected' },
        { status: 409 },
      );
    }

    captureException(e, { route: 'POST /api/post/schedule', userId: user.id, draftId });
    return NextResponse.json({ error: 'publish_failed' }, { status: 500 });
  }
}
