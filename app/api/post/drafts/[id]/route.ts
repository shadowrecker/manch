import { NextRequest, NextResponse } from 'next/server';
import { createClient, getUser } from '@/lib/supabase/server';
import { captureServer, EVENTS } from '@/lib/analytics';
import { captureException, log } from '@/lib/observability';
import type { DraftStatus } from '@/lib/modules/post/types';

// Allowed status transitions a client may request. 'published' is intentionally
// excluded — only the scheduling/LinkedIn pipeline may mark a post published.
const EDITABLE_STATUSES: DraftStatus[] = ['draft', 'scheduled', 'discarded'];

interface DraftPatchBody {
  body?: unknown;
  status?: unknown;
}

/**
 * PATCH /api/post/drafts/[id] — update a draft's body and/or status.
 * Auth + RLS via the request-scoped client guarantee the caller owns the row;
 * the explicit user_id filter is defence-in-depth. Untrusted input is validated
 * and coerced before it ever reaches the DB.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let payload: DraftPatchBody;
  try {
    payload = (await req.json()) as DraftPatchBody;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  // Build a whitelisted update object from untrusted input.
  const update: { body?: string; status?: DraftStatus; updated_at: string } = {
    updated_at: new Date().toISOString(),
  };
  let bodyEdited = false;

  if (typeof payload.body === 'string') {
    const trimmed = payload.body;
    if (trimmed.length === 0) {
      return NextResponse.json({ error: 'body_required' }, { status: 400 });
    }
    update.body = trimmed;
    bodyEdited = true;
  }

  if (typeof payload.status === 'string') {
    if (!EDITABLE_STATUSES.includes(payload.status as DraftStatus)) {
      return NextResponse.json({ error: 'invalid_status' }, { status: 400 });
    }
    update.status = payload.status as DraftStatus;
  }

  if (update.body === undefined && update.status === undefined) {
    return NextResponse.json({ error: 'nothing_to_update' }, { status: 400 });
  }

  const supabase = createClient();
  const { error } = await supabase
    .from('drafts')
    .update(update)
    .eq('id', params.id)
    .eq('user_id', user.id);

  if (error) {
    captureException(error, { route: 'PATCH /api/post/drafts/[id]', userId: user.id, draftId: params.id });
    return NextResponse.json({ error: 'update_failed' }, { status: 500 });
  }

  if (bodyEdited) {
    await captureServer(EVENTS.draftEdited, user.id, { draftId: params.id });
  }

  log.info('draft updated', { userId: user.id, draftId: params.id, fields: Object.keys(update) });
  return NextResponse.json({ ok: true });
}

/**
 * DELETE /api/post/drafts/[id] — soft-delete by marking the draft discarded.
 * We never hard-delete so that usage/audit history stays intact.
 */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const supabase = createClient();
  const { error } = await supabase
    .from('drafts')
    .update({ status: 'discarded', updated_at: new Date().toISOString() })
    .eq('id', params.id)
    .eq('user_id', user.id);

  if (error) {
    captureException(error, { route: 'DELETE /api/post/drafts/[id]', userId: user.id, draftId: params.id });
    return NextResponse.json({ error: 'delete_failed' }, { status: 500 });
  }

  log.info('draft discarded', { userId: user.id, draftId: params.id });
  return NextResponse.json({ ok: true });
}
