import { NextResponse } from 'next/server';
import { extractApiKey, verifyApiKey } from '@/lib/modules/check/api/auth';
import { apiQuota } from '@/lib/modules/check/api/quota';
import { canUseApi } from '@/lib/modules/check/entitlements';
import { runTextCheck } from '@/lib/modules/check/pipeline/pipeline';
import { translateVerdict } from '@/lib/modules/check/verdict/translate';
import { rateLimit } from '@/lib/ratelimit';
import { captureServer, EVENTS } from '@/lib/analytics';
import { isLanguageCode } from '@/lib/modules/check/languages';
import { log, captureException } from '@/lib/observability';
import { normalisePlan } from '@/lib/plans';
import type { ApiError } from '@/lib/types';
import type { LanguageCode } from '@/lib/modules/check/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

// POST /api/check — Newsroom API-lite (PRD §7.5). Key-authed, synchronous, returns
// the same structured verdict the bot computes. The full async batch API is v2.
//  200 { trust_score, verdict, claims[], source_links[], language, check_timestamp }
//  | 400 | 401 | 403 | 429
export async function POST(req: Request) {
  const raw = extractApiKey(req);
  const key = raw ? await verifyApiKey(raw) : null;
  if (!key) return NextResponse.json<ApiError>({ error: 'invalid API key', code: 'unauthorized' }, { status: 401 });
  if (!canUseApi(normalisePlan(key.plan))) {
    return NextResponse.json<ApiError>({ error: 'this key has no API access', code: 'forbidden' }, { status: 403 });
  }

  const rl = await rateLimit(`api:${key.id}`, { limit: 60, windowSeconds: 60 });
  if (!rl.success) return NextResponse.json<ApiError>({ error: 'rate limited', code: 'rate_limited' }, { status: 429 });

  const body = (await req.json().catch(() => ({}))) as { type?: string; content?: string; language?: string };
  const content = (body.content ?? '').trim();
  if (!content || (body.type && !['text', 'url'].includes(body.type))) {
    return NextResponse.json<ApiError>({ error: 'provide { type: "text"|"url", content }', code: 'bad_request' }, { status: 400 });
  }

  const quota = await apiQuota(key.id, key.monthly_quota);
  if (quota.exceeded) {
    return NextResponse.json<ApiError>({ error: 'monthly quota exceeded', code: 'quota_exceeded' }, { status: 429 });
  }

  const language: LanguageCode = body.language && isLanguageCode(body.language) ? body.language : 'en';

  try {
    const { verdict } = await runTextCheck(
      { text: content, language, requester: { apiKeyId: key.id } },
      { localize: translateVerdict },
    );
    await captureServer(EVENTS.apiCall, key.id, { org: key.org_name, label: verdict.label });
    return NextResponse.json({
      trust_score: verdict.trustScore,
      verdict: verdict.label,
      explanation: verdict.explanation,
      claims: verdict.claims.map((c) => ({ claim: c.text, verdict: c.verdict, sources: c.sources })),
      source_links: verdict.sources,
      language: verdict.language,
      check_timestamp: new Date().toISOString(),
    });
  } catch (e) {
    captureException(e, { route: 'api/check', apiKeyId: key.id });
    log.error('api check failed', { error: String(e) });
    return NextResponse.json<ApiError>({ error: 'check failed' }, { status: 500 });
  }
}
