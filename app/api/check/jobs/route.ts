import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { verifyQstashSignature } from '@/lib/queue';
import { getBotUserByWaId, getCheckUsage, incrementCheckUsage, planForBotUser } from '@/lib/modules/check/queries';
import { checkQuota, canCheckMedia, languageAllowed } from '@/lib/modules/check/entitlements';
import { runTextCheck } from '@/lib/modules/check/pipeline/pipeline';
import { runMediaCheck } from '@/lib/modules/check/media/check';
import { translateVerdict } from '@/lib/modules/check/verdict/translate';
import { sendText } from '@/lib/modules/check/whatsapp/client';
import { formatVerdict, QUOTA_MESSAGE, MEDIA_UPGRADE_MESSAGE } from '@/lib/modules/check/whatsapp/format';
import { captureServer, EVENTS } from '@/lib/analytics';
import { log, captureException } from '@/lib/observability';
import { isLanguageCode } from '@/lib/modules/check/languages';
import type { InputType, LanguageCode } from '@/lib/modules/check/types';

export const runtime = 'nodejs';
export const maxDuration = 120;

interface CheckJob {
  waId: string;
  botUserId?: string;
  type: InputType;
  text?: string;
  mediaId?: string;
}

// POST /api/check/jobs — QStash worker for the slow fact-check pipeline (PRD §3.3).
// The shared WhatsApp webhook acked fast (lib/modules/check/whatsapp/handler.ts);
// this runs claims → retrieve → adjudicate → translate → reply.
export async function POST(req: Request) {
  const raw = await req.text();
  const sig = req.headers.get('upstash-signature');
  if (env.qstashCurrentSigningKey && !(await verifyQstashSignature(sig, raw))) {
    return NextResponse.json({ error: 'bad signature' }, { status: 401 });
  }

  let job: CheckJob;
  try {
    job = JSON.parse(raw) as CheckJob;
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 });
  }

  const botUser = await getBotUserByWaId(job.waId);
  if (!botUser) return NextResponse.json({ error: 'unknown user' }, { status: 200 });

  // The linked Manch account's plan when there is one, else the bot user's own.
  const plan = await planForBotUser(botUser);
  const prefLang = (isLanguageCode(botUser.language_pref) ? botUser.language_pref : 'hi') as LanguageCode;
  const language: LanguageCode = languageAllowed(plan, prefLang) ? prefLang : 'hi';

  try {
    // Media gating (free is text-only).
    const isMedia = job.type === 'image' || job.type === 'video';
    if (isMedia && !canCheckMedia(plan, job.type)) {
      await sendText(job.waId, MEDIA_UPGRADE_MESSAGE);
      return NextResponse.json({ ok: true, skipped: 'media_gated' });
    }

    // Quota (all check types).
    const used = await getCheckUsage(botUser.id);
    if (checkQuota(plan, used).exceeded) {
      await sendText(job.waId, QUOTA_MESSAGE);
      return NextResponse.json({ ok: true, skipped: 'quota' });
    }

    // Run the check — text fact-check or media authenticity.
    const start = Date.now();
    const result = isMedia
      ? await runMediaCheck({ mediaId: job.mediaId ?? '', mediaType: job.type as 'image' | 'video', language, requester: { botUserId: botUser.id } })
      : await runTextCheck({ text: job.text ?? '', language, requester: { botUserId: botUser.id } }, { localize: translateVerdict });

    await sendText(job.waId, formatVerdict(result.verdict));
    await incrementCheckUsage(botUser.id);
    await captureServer(EVENTS.checkCompleted, botUser.id, {
      verdict_label: result.verdict.label,
      trust_score: result.verdict.trustScore,
      from_cache: result.fromCache,
      latency_ms: Date.now() - start,
      input_type: job.type,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    captureException(e, { route: 'check/jobs', waId: job.waId });
    log.error('check job failed', { error: String(e) });
    await sendText(job.waId, 'Sorry — I couldn’t complete the check. Please try again.');
    return NextResponse.json({ error: 'check failed' }, { status: 500 });
  }
}
