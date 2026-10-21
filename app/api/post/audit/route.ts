import { NextResponse } from 'next/server';
import { getUser } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { rateLimit } from '@/lib/ratelimit';
import { runAudit } from '@/lib/modules/post/ai/prompts/audit';
import { EVENTS, captureServer } from '@/lib/analytics';
import { log, captureException } from '@/lib/observability';
import { randomId } from '@/lib/utils';
import type { AuditResult } from '@/lib/modules/post/types';
import type { Json } from '@/lib/db/types';

// POST /api/post/audit
// Body: { linkedinUrl: string, profileText: string }
// Response: { auditId, shareId, scores, overall, fixes }
//
// Compliance: MVP scores USER-PASTED profile text (data_source: "pasted"); we do
// not scrape. The LinkedIn URL is stored for reference + the public share page.

export const runtime = 'nodejs';

interface AuditRequestBody {
  linkedinUrl?: unknown;
  profileText?: unknown;
}

const MAX_TEXT = 12_000; // generous cap; profile text is pasted, keep it bounded

export async function POST(req: Request) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // Per-user rate limit: 10 audits / minute.
  const rl = await rateLimit(`audit:${user.id}`, { limit: 10, windowSeconds: 60 });
  if (!rl.success) {
    return NextResponse.json(
      { error: 'rate_limited', code: 'rate_limited' },
      { status: 429 },
    );
  }

  // Parse + validate untrusted input.
  let body: AuditRequestBody;
  try {
    body = (await req.json()) as AuditRequestBody;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const linkedinUrl = typeof body.linkedinUrl === 'string' ? body.linkedinUrl.trim() : '';
  const profileText = typeof body.profileText === 'string' ? body.profileText.trim() : '';

  if (!profileText) {
    return NextResponse.json(
      { error: 'profileText is required', code: 'missing_profile_text' },
      { status: 400 },
    );
  }

  const boundedText = profileText.slice(0, MAX_TEXT);

  let result: AuditResult;
  try {
    result = await runAudit(boundedText);
  } catch (err) {
    captureException(err, { scope: 'audit', userId: user.id });
    return NextResponse.json(
      { error: 'audit_failed', code: 'audit_failed' },
      { status: 502 },
    );
  }

  const shareId = randomId(8);

  // Privileged write (RLS-bypassing) — store the audit + share id.
  const admin = createAdminClient();
  const { data: inserted, error: insertError } = await admin
    .from('audits')
    .insert({
      user_id: user.id,
      linkedin_url: linkedinUrl,
      data_source: 'pasted',
      scores: result.scores as unknown as Json,
      overall: result.overall,
      fixes: result.fixes as unknown as Json,
      share_id: shareId,
    })
    .select('id')
    .single();

  if (insertError || !inserted) {
    captureException(insertError ?? new Error('audit insert returned no row'), {
      scope: 'audit_insert',
      userId: user.id,
    });
    return NextResponse.json({ error: 'persist_failed' }, { status: 500 });
  }

  // Fire-and-shape analytics (don't fail the request if telemetry hiccups).
  try {
    await captureServer(EVENTS.auditRun, user.id, {
      overall: result.overall,
      data_source: 'pasted',
    });
  } catch (err) {
    log.warn('audit analytics capture failed', { error: String(err) });
  }

  return NextResponse.json({
    auditId: inserted.id,
    shareId,
    scores: result.scores,
    overall: result.overall,
    fixes: result.fixes,
  });
}
