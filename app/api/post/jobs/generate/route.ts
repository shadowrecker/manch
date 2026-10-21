import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { verifyQstashSignature } from '@/lib/queue';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPlan, getUsage } from '@/lib/db/queries';
import { quotaState } from '@/lib/modules/post/entitlements';
import { transcribe } from '@/lib/modules/post/ai/transcribe';
import { downloadMedia, sendText } from '@/lib/whatsapp/client';
import { sendDrafts } from '@/lib/modules/post/whatsapp';
import { generatePostsForUser, NoVoiceProfileError } from '@/lib/modules/post/services/generate';
import { log, captureException } from '@/lib/observability';
import type { DetectedLang } from '@/lib/modules/post/types';
import type { VoiceJob } from '@/lib/jobs';

// QStash worker for the WhatsApp → LinkedIn drafts pipeline (PRD §3.2 Flow A / §3.3).
// Consumes the shared VoiceJob that the one Manch WhatsApp webhook enqueues at
// exactly /api/post/jobs/generate when a message is routed to Post
// (lib/whatsapp/dispatch.ts).
//
// Decoupled from the webhook: this is where the slow work happens — media
// download, transcription, Claude generation, persistence and the reply. It is
// invoked only by QStash and verifies the Upstash signature before doing
// anything. On a permanent (poison) failure it acks with 200 so QStash stops
// retrying; transient failures return 500 so QStash retries with backoff.

export const runtime = 'nodejs';
// Generation + transcription can take a while; allow headroom.
export const maxDuration = 120;

export async function POST(req: Request): Promise<Response> {
  const rawBody = await req.text();
  const signature = req.headers.get('upstash-signature');

  const valid = await verifyQstashSignature(signature, rawBody);
  if (!valid) {
    log.warn('jobs/generate: invalid qstash signature');
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let job: VoiceJob;
  try {
    job = JSON.parse(rawBody) as VoiceJob;
  } catch {
    // Unparseable but signed body — ack so QStash drops it.
    log.warn('jobs/generate: malformed job body');
    return NextResponse.json({ ok: true });
  }

  const { waMessageId, from, type, userId } = job;

  try {
    // --- Quota gate (server-authoritative) -------------------------------
    const [plan, used] = await Promise.all([getPlan(userId), getUsage(userId, 'posts')]);
    if (quotaState(plan, used).exceeded) {
      await sendText(
        from,
        `You've used all your posts for this month. Upgrade to keep generating: ${env.appUrl}/settings/billing`,
      );
      await markProcessed(waMessageId);
      log.info('jobs/generate: quota exceeded, sent upgrade prompt', { userId });
      return NextResponse.json({ ok: true });
    }

    // --- Resolve input text ---------------------------------------------
    let inputText = '';
    let transcriptionId: string | null = null;
    let detectedLang: DetectedLang | undefined;

    if (type === 'audio') {
      if (!job.mediaId) {
        // Nothing to transcribe — treat as poison, ack.
        log.warn('jobs/generate: audio job missing mediaId', { waMessageId });
        await markProcessed(waMessageId);
        return NextResponse.json({ ok: true });
      }
      const media = await downloadMedia(job.mediaId);
      const result = await transcribe({
        data: media.data,
        mimeType: media.mimeType,
        filename: `wa-${waMessageId}.ogg`,
      });
      inputText = result.text.trim();
      detectedLang = result.detectedLang;

      // Persist the transcription so the draft can reference its source.
      const sb = createAdminClient();
      const { data: tr, error: trErr } = await sb
        .from('transcriptions')
        .insert({
          user_id: userId,
          source: 'whatsapp',
          provider: result.provider,
          detected_lang: result.detectedLang,
          text: result.text,
        })
        .select('id')
        .single();
      if (trErr) throw trErr;
      transcriptionId = tr?.id ?? null;
    } else {
      inputText = (job.text ?? '').trim();
    }

    if (!inputText) {
      await sendText(
        from,
        "I couldn't read anything from that message. Send a voice note or a few lines about your week and I'll draft posts in your voice.",
      );
      await markProcessed(waMessageId);
      return NextResponse.json({ ok: true });
    }

    // --- Generate + reply ------------------------------------------------
    const generated = await generatePostsForUser({
      userId,
      inputText,
      source: 'whatsapp',
      transcriptionId,
      detectedLang,
    });

    await sendDrafts(from, generated.posts, `${env.appUrl}/post/drafts`);
    await markProcessed(waMessageId);
    log.info('jobs/generate: drafts delivered', { userId, waMessageId });
    return NextResponse.json({ ok: true });
  } catch (e) {
    // Permanent / user-facing errors -> friendly reply + ack (no retry).
    if (e instanceof NoVoiceProfileError) {
      await safeSend(
        from,
        `Let's set up your voice first so I can write like you: ${env.appUrl}/post/onboarding`,
      );
      await markProcessed(waMessageId);
      log.info('jobs/generate: no voice profile, onboarding prompt sent', { userId });
      return NextResponse.json({ ok: true });
    }

    captureException(e, { scope: 'jobs.generate', userId, waMessageId });

    // Best-effort apology to the user.
    await safeSend(
      from,
      "Something went wrong creating your drafts. Please try again in a minute, or open the app to generate there.",
    );

    // Distinguish transient (retryable) failures from poison messages. A
    // transcription/provider/network blip is worth a QStash retry (500);
    // anything else we treat as poison and ack (200) to avoid infinite loops.
    if (isTransient(e)) {
      return NextResponse.json({ error: 'transient' }, { status: 500 });
    }
    await markProcessed(waMessageId);
    return NextResponse.json({ ok: true });
  }
}

/** Flag the inbound message as fully processed (best-effort). */
async function markProcessed(waMessageId: string): Promise<void> {
  try {
    const sb = createAdminClient();
    await sb
      .from('whatsapp_messages')
      .update({ processed: true })
      .eq('wa_message_id', waMessageId);
  } catch (e) {
    log.warn('jobs/generate: failed to mark processed', {
      waMessageId,
      error: String(e),
    });
  }
}

/** Send without throwing — used in error paths where we must still return. */
async function safeSend(to: string, text: string): Promise<void> {
  try {
    await sendText(to, text);
  } catch (e) {
    log.warn('jobs/generate: failed to send failure notice', { error: String(e) });
  }
}

/** Heuristic: HTTP 5xx / 429 / network errors are transient and retryable. */
function isTransient(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /\b(429|5\d\d)\b/.test(msg) || /timeout|ECONN|network|fetch failed/i.test(msg);
}
