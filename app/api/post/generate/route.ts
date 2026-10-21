import { NextResponse } from 'next/server';
import { getUser } from '@/lib/supabase/server';
import { getPlan, getUsage } from '@/lib/db/queries';
import { PLAN_LABEL } from '@/lib/plans';
import { quotaState } from '@/lib/modules/post/entitlements';
import { rateLimit } from '@/lib/ratelimit';
import { generatePostsForUser, NoVoiceProfileError } from '@/lib/modules/post/services/generate';
import { log, captureException } from '@/lib/observability';
import type { ApiError } from '@/lib/types';

// POST /api/post/generate { inputText: string }
//  200 GenerateResult
//  402 { error, code:"quota_exceeded" }
//  409 { error, code:"no_voice_profile" }
//  429 rate-limited
//
// The hero loop on web. Quota is enforced HERE (server-authoritative); the
// client only reacts to the response. generatePostsForUser() persists the 3
// drafts, applies the watermark, increments usage and emits analytics — we do
// not duplicate any of that here.
export async function POST(req: Request) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json<ApiError>({ error: 'unauthorized' }, { status: 401 });
  }

  // Parse + validate the (untrusted) body.
  let inputText = '';
  try {
    const body = (await req.json()) as { inputText?: unknown };
    inputText = typeof body.inputText === 'string' ? body.inputText.trim() : '';
  } catch {
    return NextResponse.json<ApiError>({ error: 'invalid JSON body' }, { status: 400 });
  }
  if (!inputText) {
    return NextResponse.json<ApiError>(
      { error: 'Tell me what happened this week.' },
      { status: 400 },
    );
  }

  // Per-user rate limit (abuse / cost guard), separate from the monthly quota.
  const rl = await rateLimit(`gen:${user.id}`, { limit: 20, windowSeconds: 60 });
  if (!rl.success) {
    return NextResponse.json<ApiError>(
      { error: 'Too many requests. Please wait a moment and try again.', code: 'rate_limited' },
      { status: 429 },
    );
  }

  // Monthly quota check (per plan). Free=4, Plus=20, Pro/Team=fair-use cap.
  const [plan, used] = await Promise.all([getPlan(user.id), getUsage(user.id, 'posts')]);
  const q = quotaState(plan, used);
  if (q.exceeded) {
    return NextResponse.json<ApiError>(
      {
        error: `You have hit your ${PLAN_LABEL[plan]} plan limit of ${q.limit} posts this month.`,
        code: 'quota_exceeded',
      },
      { status: 402 },
    );
  }

  try {
    const result = await generatePostsForUser({
      userId: user.id,
      inputText,
      source: 'web',
    });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof NoVoiceProfileError) {
      return NextResponse.json<ApiError>(
        {
          error: 'Set up your voice profile first so posts sound like you.',
          code: 'no_voice_profile',
        },
        { status: 409 },
      );
    }
    captureException(e, { route: 'POST /api/post/generate', userId: user.id });
    log.error('generate failed', { userId: user.id, error: String(e) });
    return NextResponse.json<ApiError>(
      { error: 'Could not generate posts. Please try again.' },
      { status: 500 },
    );
  }
}
