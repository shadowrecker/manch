import { NextResponse } from 'next/server';
import { getUser } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPlan } from '@/lib/db/queries';
import { canAgency } from '@/lib/modules/reels/entitlements';
import { ensureTeam, getUserTeamId } from '@/lib/modules/reels/agency';
import { isLanguageCode } from '@/lib/modules/reels/languages';
import { EVENTS, captureServer } from '@/lib/analytics';
import { captureException } from '@/lib/observability';
import type { ApiError } from '@/lib/types';

// /api/reels/agency/brands — Agency-lite brand presets (PRD §12). Team plan only
// (the Reels "agency" tier).
export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json<ApiError>({ error: 'unauthorized' }, { status: 401 });
  const teamId = await getUserTeamId(user.id);
  if (!teamId) return NextResponse.json({ presets: [] });
  const sb = createAdminClient();
  const { data } = await sb
    .from('brand_presets')
    .select('*')
    .eq('team_id', teamId)
    .order('created_at', { ascending: false });
  return NextResponse.json({ presets: data ?? [] });
}

export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json<ApiError>({ error: 'unauthorized' }, { status: 401 });

  const plan = await getPlan(user.id);
  if (!canAgency(plan)) {
    return NextResponse.json<ApiError>({ error: 'Team plan required', code: 'upgrade' }, { status: 403 });
  }

  let body: { name?: unknown; brief?: unknown; languages?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json<ApiError>({ error: 'invalid_json' }, { status: 400 });
  }
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return NextResponse.json<ApiError>({ error: 'name_required' }, { status: 400 });
  const brief = typeof body.brief === 'string' ? body.brief : null;
  const languages = Array.isArray(body.languages)
    ? body.languages.filter((l): l is string => typeof l === 'string' && isLanguageCode(l))
    : [];

  try {
    const teamId = await ensureTeam(user.id);
    const sb = createAdminClient();
    const { data: preset, error } = await sb
      .from('brand_presets')
      .insert({ team_id: teamId, name, brief, default_languages: languages })
      .select('*')
      .single();
    if (error || !preset) throw error ?? new Error('insert failed');
    await captureServer(EVENTS.agencyBrandPresetCreated, user.id, { team_id: teamId });
    return NextResponse.json({ ok: true, preset });
  } catch (e) {
    captureException(e, { route: 'POST /api/reels/agency/brands', userId: user.id });
    return NextResponse.json<ApiError>({ error: 'could_not_create' }, { status: 500 });
  }
}
