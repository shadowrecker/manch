import { NextResponse } from 'next/server';
import { verifyQstashSignature } from '@/lib/queue';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPlan } from '@/lib/db/queries';
import { publishPost, LinkedInNotConnectedError } from '@/lib/modules/post/linkedin/post';
import { captureServer, EVENTS } from '@/lib/analytics';
import { log, captureException } from '@/lib/observability';
import type { PublishJob } from '@/lib/modules/post/jobs';

// QStash worker that fires a previously-scheduled LinkedIn publish (PRD F-05).
// Invoked only by QStash; the Upstash signature is verified before any work.
// Transient (5xx/429/network) failures return 500 so QStash retries with
// backoff; permanent failures are recorded as `failed` and acked with 200.

export const runtime = 'nodejs';
export const maxDuration = 60;


export async function POST(req: Request): Promise<Response> {
  const rawBody = await req.text();
  const signature = req.headers.get('upstash-signature');

  const valid = await verifyQstashSignature(signature, rawBody);
  if (!valid) {
    log.warn('jobs/publish: invalid qstash signature');
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let job: PublishJob;
  try {
    job = JSON.parse(rawBody) as PublishJob;
  } catch {
    log.warn('jobs/publish: malformed job body');
    return NextResponse.json({ ok: true });
  }

  const { publishedPostId } = job;
  if (!publishedPostId) {
    return NextResponse.json({ ok: true });
  }

  const sb = createAdminClient();

  // Load the scheduled row and its draft.
  const { data: pp, error: ppErr } = await sb
    .from('published_posts')
    .select('id, user_id, draft_id, status')
    .eq('id', publishedPostId)
    .maybeSingle();

  if (ppErr) {
    captureException(ppErr, { scope: 'jobs.publish', publishedPostId });
    return NextResponse.json({ error: 'lookup_failed' }, { status: 500 });
  }
  if (!pp) {
    // Row was deleted — nothing to do, ack.
    log.warn('jobs/publish: published_post not found', { publishedPostId });
    return NextResponse.json({ ok: true });
  }
  // Idempotency: if it already succeeded, don't double-post.
  if (pp.status === 'published') {
    return NextResponse.json({ ok: true });
  }

  const { data: draft, error: draftErr } = await sb
    .from('drafts')
    .select('id, body')
    .eq('id', pp.draft_id)
    .maybeSingle();

  if (draftErr) {
    captureException(draftErr, { scope: 'jobs.publish', publishedPostId });
    return NextResponse.json({ error: 'lookup_failed' }, { status: 500 });
  }
  if (!draft) {
    await sb
      .from('published_posts')
      .update({ status: 'failed', error: 'draft_not_found' })
      .eq('id', pp.id);
    log.warn('jobs/publish: draft missing', { publishedPostId, draftId: pp.draft_id });
    return NextResponse.json({ ok: true });
  }

  try {
    const { externalId } = await publishPost(pp.user_id, draft.body);
    const now = new Date().toISOString();

    await sb
      .from('published_posts')
      .update({ status: 'published', external_id: externalId || null, published_at: now })
      .eq('id', pp.id);

    await sb
      .from('drafts')
      .update({ status: 'published', updated_at: now })
      .eq('id', draft.id);

    const plan = await getPlan(pp.user_id);
    await captureServer(EVENTS.postPublished, pp.user_id, { platform: 'linkedin', plan });

    log.info('jobs/publish: published', { publishedPostId, draftId: draft.id, externalId });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);

    await sb
      .from('published_posts')
      .update({ status: 'failed', error: message })
      .eq('id', pp.id);

    // Token missing is permanent — ack so QStash stops retrying.
    if (e instanceof LinkedInNotConnectedError) {
      log.warn('jobs/publish: linkedin not connected', { publishedPostId });
      return NextResponse.json({ ok: true });
    }

    captureException(e, { scope: 'jobs.publish', publishedPostId });

    // Transient failures (5xx/429/network) are worth a QStash retry.
    if (isTransient(message)) {
      return NextResponse.json({ error: 'transient' }, { status: 500 });
    }
    // Permanent failure — ack to avoid an infinite retry loop.
    return NextResponse.json({ ok: true });
  }
}

/** Heuristic: HTTP 5xx / 429 / network errors are transient and retryable. */
function isTransient(message: string): boolean {
  return /\b(429|5\d\d)\b/.test(message) || /timeout|ECONN|network|fetch failed/i.test(message);
}
