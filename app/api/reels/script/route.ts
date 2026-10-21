import { NextResponse } from 'next/server';
import { getUser } from '@/lib/supabase/server';
import { getPlan, getUsage } from '@/lib/db/queries';
import { getCreditBalance } from '@/lib/modules/reels/queries';
import { generationAllowance } from '@/lib/modules/reels/entitlements';
import { rateLimit } from '@/lib/ratelimit';
import { generateScriptForUser } from '@/lib/modules/reels/services/generate';
import { isLanguageCode } from '@/lib/modules/reels/languages';
import { PLATFORMS } from '@/lib/modules/reels/types';
import { log, captureException } from '@/lib/observability';
import type { ApiError } from '@/lib/types';
import type { Platform } from '@/lib/modules/reels/types';

// POST /api/reels/script { languageCode, platform?, ideaText }
//  200 GenerateScriptResult | 400 | 401 | 402 {code:"limit_reached"} | 429
export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json<ApiError>({ error: 'unauthorized' }, { status: 401 });

  let body: { languageCode?: unknown; platform?: unknown; ideaText?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json<ApiError>({ error: 'invalid_json' }, { status: 400 });
  }

  const languageCode = typeof body.languageCode === 'string' ? body.languageCode : '';
  if (!isLanguageCode(languageCode)) {
    return NextResponse.json<ApiError>({ error: 'Pick a supported language.', code: 'invalid_language' }, { status: 400 });
  }
  const platform: Platform = PLATFORMS.includes(body.platform as Platform)
    ? (body.platform as Platform)
    : 'instagram';
  const ideaText = typeof body.ideaText === 'string' ? body.ideaText.trim() : '';
  if (!ideaText) {
    return NextResponse.json<ApiError>({ error: 'Tell us your idea.' }, { status: 400 });
  }

  const rl = await rateLimit(`script:${user.id}`, { limit: 30, windowSeconds: 60 });
  if (!rl.success) {
    return NextResponse.json<ApiError>({ error: 'Slow down a moment.', code: 'rate_limited' }, { status: 429 });
  }

  // §12: monthly quota first, then a wallet credit, then paywall.
  const [plan, used, credits] = await Promise.all([
    getPlan(user.id),
    getUsage(user.id, 'pieces'),
    getCreditBalance(user.id),
  ]);
  const allow = generationAllowance(plan, used, credits);
  if (!allow.allowed) {
    return NextResponse.json<ApiError>(
      { error: 'You have used your pieces for this month. Buy a ₹49 pack or upgrade.', code: 'limit_reached' },
      { status: 402 },
    );
  }

  try {
    const result = await generateScriptForUser({
      userId: user.id,
      languageCode,
      platform,
      ideaText,
      source: 'web',
      meterVia: allow.via === 'credit' ? 'credit' : 'quota',
    });
    return NextResponse.json(result);
  } catch (e) {
    captureException(e, { route: 'POST /api/reels/script', userId: user.id });
    log.error('script generation failed', { userId: user.id, error: String(e) });
    return NextResponse.json<ApiError>({ error: 'Could not generate. Please try again.' }, { status: 500 });
  }
}
