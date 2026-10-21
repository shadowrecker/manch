import { createAdminClient } from '@/lib/supabase/admin';
import { getProfileByWhatsapp } from '@/lib/db/queries';
import { normalisePlan } from '@/lib/plans';
import { getOrCreateBotUser, linkBotUser } from '@/lib/modules/check/queries';
import { sendText } from '@/lib/modules/check/whatsapp/client';
import { isOnboarded, parseLanguageChoice, LANGUAGE_PROMPT } from '@/lib/modules/check/whatsapp/state';
import { CHECKING_MESSAGE } from '@/lib/modules/check/whatsapp/format';
import { enqueue } from '@/lib/queue';
import { captureServer, EVENTS } from '@/lib/analytics';
import { languageByCode } from '@/lib/modules/check/languages';
import { log } from '@/lib/observability';
import type { Json } from '@/lib/db/types';

// Check's per-message handler. The shared webhook (app/api/whatsapp/webhook →
// lib/whatsapp/dispatch.ts) has already verified, parsed, DEDUPED and routed the
// message here, so this does no dedupe of its own. Fast path: onboard or enqueue a
// check + ack. The slow work runs in the /api/check/jobs worker.

/** Worker route for the slow fact-check pipeline. */
export const CHECK_JOB_PATH = '/api/check/jobs';

export interface CheckInboundMessage {
  /** Sender, digits only (bot_users.wa_id format). */
  waId: string;
  messageId: string;
  type: 'text' | 'image' | 'video' | 'url' | 'interactive' | 'unsupported';
  /** Text body OR interactive reply id. */
  text?: string;
  /** Image/video media id. */
  mediaId?: string;
}

export async function handleInboundMessage(msg: CheckInboundMessage): Promise<void> {
  if (msg.type === 'unsupported') {
    await sendText(msg.waId, 'I can check text messages, images and videos. Forward me something to verify.');
    return;
  }

  const botUser = await getOrCreateBotUser(msg.waId);

  // ── Manch account? Link the bot user so the account's plan + history apply ──
  const profile = await getProfileByWhatsapp(`+${msg.waId}`);
  if (profile && botUser.user_id !== profile.id) {
    try {
      await linkBotUser(botUser.id, profile.id);
      botUser.user_id = profile.id;
    } catch (e) {
      log.warn('link bot user failed', { botUserId: botUser.id, error: String(e) });
    }
  }
  const plan = profile ? normalisePlan(profile.plan) : normalisePlan(botUser.plan);

  // ── Onboarding: pick a reply language on first contact ──
  if (!isOnboarded(botUser.state)) {
    const choice = msg.text ? parseLanguageChoice(msg.text) : null;
    if (choice) {
      const sb = createAdminClient();
      await sb
        .from('bot_users')
        .update({ language_pref: choice, state: { onboarded: true } as unknown as Json })
        .eq('id', botUser.id);
      await captureServer(EVENTS.languageOnboarded, botUser.id, { language: choice });
      const name = languageByCode(choice)?.nativeName ?? choice;
      await sendText(msg.waId, `✅ ${name}. Forward me any suspicious message, photo or video and I’ll check it.`);
    } else {
      await sendText(msg.waId, LANGUAGE_PROMPT);
    }
    return;
  }

  // ── Onboarded → enqueue a check + ack fast ──
  const text = msg.type === 'text' || msg.type === 'interactive' ? msg.text ?? '' : undefined;
  if ((msg.type === 'text' || msg.type === 'interactive') && (!text || text.trim().length < 2)) {
    await sendText(msg.waId, 'Forward me a message, photo or video to check.');
    return;
  }

  try {
    await enqueue(
      CHECK_JOB_PATH,
      { waId: msg.waId, botUserId: botUser.id, type: msg.type === 'interactive' ? 'text' : msg.type, text, mediaId: msg.mediaId },
      { deduplicationId: msg.messageId },
    );
    await captureServer(EVENTS.checkRequested, botUser.id, { input_type: msg.type, plan, linked: !!botUser.user_id });
    await sendText(msg.waId, CHECKING_MESSAGE);
  } catch (e) {
    log.error('enqueue check failed', { waId: msg.waId, error: String(e) });
    await sendText(msg.waId, 'Sorry — the checker is briefly unavailable. Please try again in a moment.');
  }
}
