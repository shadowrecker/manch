import { NextResponse } from 'next/server';
import { getUser } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { MODEL } from '@/lib/ai/claude';
import { buildStyleGuide } from '@/lib/modules/post/ai/prompts/voiceProfile';
import { EVENTS, captureServer } from '@/lib/analytics';
import { log, captureException } from '@/lib/observability';

// POST /api/post/voice-profile — create/replace the user's active voice profile.
// Contract: accepts { industry, seniority, topics: string[], tone, writingSample? }
// and returns { ok: true } or { error }. Enforced server-side; auth required.

interface Body {
  industry?: unknown;
  seniority?: unknown;
  topics?: unknown;
  tone?: unknown;
  writingSample?: unknown;
}

function asString(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

export async function POST(req: Request): Promise<Response> {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let raw: Body;
  try {
    raw = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const industry = asString(raw.industry);
  const seniority = asString(raw.seniority);
  const tone = asString(raw.tone);
  const writingSample = asString(raw.writingSample);
  // Up to 3 topics; ignore anything past 3 and drop blanks/dupes.
  const topics = Array.isArray(raw.topics)
    ? Array.from(
        new Set(
          raw.topics.filter((t): t is string => typeof t === 'string').map((t) => t.trim()).filter(Boolean),
        ),
      ).slice(0, 3)
    : [];

  if (!industry) return NextResponse.json({ error: 'industry is required' }, { status: 400 });
  if (!seniority) return NextResponse.json({ error: 'seniority is required' }, { status: 400 });
  if (!tone) return NextResponse.json({ error: 'tone is required' }, { status: 400 });

  // Build the persistent style guide. If the ANTHROPIC key is missing (requireEnv
  // throws) or the call fails, save the profile with style_guide=null so that
  // onboarding never hard-fails — it can be regenerated later.
  let styleGuide: string | null = null;
  try {
    styleGuide = await buildStyleGuide({ industry, seniority, topics, tone, writingSample });
  } catch (err) {
    captureException(err, { where: 'buildStyleGuide', userId: user.id });
    log.warn('style guide unavailable; saving profile without it', { userId: user.id });
  }

  const sb = createAdminClient();

  // Deactivate any existing active profile, then insert the new active one. The
  // unique partial index (one active per user) makes the order matter.
  const { error: deactivateError } = await sb
    .from('voice_profiles')
    .update({ is_active: false })
    .eq('user_id', user.id)
    .eq('is_active', true);
  if (deactivateError) {
    captureException(deactivateError, { where: 'deactivateVoiceProfiles', userId: user.id });
    return NextResponse.json({ error: 'could not save voice profile' }, { status: 500 });
  }

  const { error: insertError } = await sb.from('voice_profiles').insert({
    user_id: user.id,
    industry,
    seniority,
    topics,
    tone,
    writing_sample: writingSample || null,
    style_guide: styleGuide,
    style_guide_model: styleGuide ? MODEL : null,
    is_active: true,
  });
  if (insertError) {
    captureException(insertError, { where: 'insertVoiceProfile', userId: user.id });
    return NextResponse.json({ error: 'could not save voice profile' }, { status: 500 });
  }

  await captureServer(EVENTS.voiceProfileCompleted, user.id, { seniority, industry });

  return NextResponse.json({ ok: true });
}
