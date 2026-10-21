import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { verifyQstashSignature } from '@/lib/queue';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPlan, getUsage, getProfile } from '@/lib/db/queries';
import { getCreditBalance } from '@/lib/modules/reels/queries';
import { generationAllowance } from '@/lib/modules/reels/entitlements';
import { transcribe } from '@/lib/modules/reels/ai/transcribe';
import { detectLanguage } from '@/lib/modules/reels/ai/vernacular';
import { downloadMedia, sendText } from '@/lib/whatsapp/client';
import { sendScript } from '@/lib/modules/reels/whatsapp';
import { generateScriptForUser } from '@/lib/modules/reels/services/generate';
import { isLanguageCode } from '@/lib/modules/reels/languages';
import { log, captureException } from '@/lib/observability';
import type { VoiceJob } from '@/lib/jobs';
import type { LanguageCode } from '@/lib/modules/reels/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

// QStash worker for Reels (PRD §3.3 Flow A), enqueued by the shared WhatsApp
// router (lib/whatsapp/dispatch.ts): transcribe → detect language → generate
// script → deliver via WhatsApp. Verifies the Upstash signature first.
export async function POST(req: Request) {
  const rawBody = await req.text();
  const valid = await verifyQstashSignature(req.headers.get('upstash-signature'), rawBody);
  if (!valid) {
    log.warn('reels/jobs/generate: invalid qstash signature');
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let job: VoiceJob;
  try {
    job = JSON.parse(rawBody) as VoiceJob;
  } catch {
    return NextResponse.json({ ok: true });
  }

  try {
    const [plan, used, credits] = await Promise.all([
      getPlan(job.userId),
      getUsage(job.userId, 'pieces'),
      getCreditBalance(job.userId),
    ]);
    const allow = generationAllowance(plan, used, credits);
    if (!allow.allowed) {
      await sendText(
        job.from,
        `You've used your Reel pieces for this month. Get a ₹49 pack or upgrade: ${env.appUrl}/settings/billing`,
      );
      return NextResponse.json({ ok: true });
    }

    let text = job.text ?? '';
    if (job.type === 'audio' && job.mediaId) {
      const media = await downloadMedia(job.mediaId);
      const t = await transcribe({ data: media.data, mimeType: media.mimeType });
      text = t.text;
      await createAdminClient()
        .from('transcriptions')
        .insert({ user_id: job.userId, source: 'whatsapp_voice', provider: t.provider, text });
    }
    if (!text.trim()) {
      await sendText(job.from, 'Sorry, I could not read that. Please try again?');
      return NextResponse.json({ ok: true });
    }

    const profile = await getProfile(job.userId);
    const detected = detectLanguage(text);
    const def = profile?.default_language;
    const lang: LanguageCode = detected ?? (def && isLanguageCode(def) ? def : 'hi');

    const result = await generateScriptForUser({
      userId: job.userId,
      languageCode: lang,
      platform: 'instagram',
      ideaText: text,
      source: 'whatsapp',
      meterVia: allow.via === 'credit' ? 'credit' : 'quota',
    });

    await sendScript(job.from, result.styles.educational, `${env.appUrl}/reels/studio`);
    await createAdminClient()
      .from('whatsapp_messages')
      .update({ processed: true })
      .eq('wa_message_id', job.waMessageId);

    return NextResponse.json({ ok: true });
  } catch (e) {
    captureException(e, { route: 'POST /api/reels/jobs/generate', waMessageId: job.waMessageId });
    log.error('reels worker failed', { error: String(e) });
    try {
      await sendText(job.from, 'Something went wrong on our side. Please try again.');
    } catch {
      /* best-effort */
    }
    // Ack so QStash doesn't retry a poison message indefinitely.
    return NextResponse.json({ ok: true });
  }
}
