import { NextResponse } from 'next/server';
import { getUser } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { generateApiKey, hashApiKey } from '@/lib/modules/check/api/auth';
import { env } from '@/lib/env';
import { getPlan } from '@/lib/db/queries';
import { canUseApi } from '@/lib/modules/check/entitlements';
import { captureServer, EVENTS } from '@/lib/analytics';
import { log, captureException } from '@/lib/observability';
import type { ApiError } from '@/lib/types';

export const runtime = 'nodejs';

// POST /api/check/keys { orgName } — issue a newsroom API key (raw key shown ONCE).
// Only accounts on an API plan (newsroom / telco / grant) may issue keys.
export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json<ApiError>({ error: 'unauthorized' }, { status: 401 });

  if (!canUseApi(await getPlan(user.id))) {
    return NextResponse.json<ApiError>(
      { error: 'The Newsroom API needs a Newsroom plan.', code: 'plan_required' },
      { status: 403 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as { orgName?: string };
  const orgName = body.orgName?.trim();
  if (!orgName) return NextResponse.json<ApiError>({ error: 'orgName is required', code: 'bad_request' }, { status: 400 });

  try {
    const raw = generateApiKey();
    const sb = createAdminClient();
    const { data, error } = await sb
      .from('api_keys')
      .insert({ owner_id: user.id, org_name: orgName, key_hash: hashApiKey(raw), plan: 'newsroom', monthly_quota: env.newsroomApiDefaultQuota })
      .select('id')
      .single();
    if (error) throw error;
    await captureServer(EVENTS.apiKeyIssued, user.id, { org: orgName });
    // The raw key is returned ONCE and never stored.
    return NextResponse.json({ id: data.id, key: raw, monthly_quota: env.newsroomApiDefaultQuota });
  } catch (e) {
    captureException(e, { route: 'api/check/keys', userId: user.id });
    log.error('issue key failed', { error: String(e) });
    return NextResponse.json<ApiError>({ error: 'could not issue key' }, { status: 500 });
  }
}

// DELETE /api/check/keys?id=… — revoke one of YOUR keys (scoped by owner).
export async function DELETE(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json<ApiError>({ error: 'unauthorized' }, { status: 401 });
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json<ApiError>({ error: 'id is required', code: 'bad_request' }, { status: 400 });
  const sb = createAdminClient();
  const { data } = await sb
    .from('api_keys')
    .update({ active: false })
    .eq('id', id)
    .eq('owner_id', user.id)
    .select('id')
    .maybeSingle();
  if (!data) return NextResponse.json<ApiError>({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
