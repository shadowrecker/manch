import { createAdminClient } from '@/lib/supabase/admin';
import { getProfileByWhatsapp } from '@/lib/db/queries';
import { enqueue } from '@/lib/queue';
import { sendText } from '@/lib/whatsapp/client';
import { env } from '@/lib/env';
import { EVENTS, captureServer } from '@/lib/analytics';
import { log } from '@/lib/observability';
import {
  MENU_TEXT,
  MODE_CONFIRM,
  asSession,
  decideRoute,
  needsAccountText,
  type SessionState,
} from '@/lib/whatsapp/router';
import { handleInboundMessage as handleCheckMessage } from '@/lib/modules/check/whatsapp/handler';
import type { InboundMessage } from '@/lib/whatsapp/inbound';
import type { Json, WhatsappModule } from '@/lib/db/types';
import type { VoiceJob } from '@/lib/jobs';

// Per-message handling for the shared WhatsApp webhook: resolve the sender,
// dedupe, decide the module (lib/whatsapp/router.ts) and hand off. Fast path
// only — the slow AI work runs in each module's QStash worker.

/** Worker routes for the voice/text → content modules. */
export const JOB_PATHS: Record<'post' | 'reels', string> = {
  post: '/api/post/jobs/generate',
  reels: '/api/reels/jobs/generate',
};

async function reply(to: string, text: string): Promise<void> {
  try {
    await sendText(to, text);
  } catch (e) {
    log.warn('whatsapp reply failed', { error: String(e) });
  }
}

async function saveSession(from: string, userId: string | null, state: SessionState): Promise<void> {
  const sb = createAdminClient();
  await sb.from('whatsapp_sessions').upsert({
    from_e164: from,
    user_id: userId,
    state: state as unknown as Json,
    updated_at: new Date().toISOString(),
  });
}

/** Returns false if this message id was already accepted (duplicate delivery). */
async function recordMessage(msg: InboundMessage, userId: string | null, module: WhatsappModule | null) {
  const sb = createAdminClient();
  const { error } = await sb.from('whatsapp_messages').insert({
    wa_message_id: msg.messageId,
    user_id: userId,
    from_e164: msg.from,
    type: msg.type,
    module,
    processed: false,
  });
  if (!error) return true;
  // 23505 = unique_violation → duplicate delivery, safe to ignore.
  if ((error as { code?: string }).code === '23505') return false;
  throw error;
}

export async function dispatchMessage(msg: InboundMessage): Promise<void> {
  const sb = createAdminClient();
  const profile = await getProfileByWhatsapp(msg.from);
  const { data: sessionRow } = await sb
    .from('whatsapp_sessions')
    .select('state')
    .eq('from_e164', msg.from)
    .maybeSingle();
  const session = asSession(sessionRow?.state);

  const decision = decideRoute({ msg, hasAccount: !!profile, session });
  const routedModule = decision.action === 'route' ? decision.module : null;

  if (!(await recordMessage(msg, profile?.id ?? null, routedModule))) {
    log.info('whatsapp: duplicate message ignored', { waMessageId: msg.messageId });
    return;
  }

  const userId = profile?.id ?? null;
  switch (decision.action) {
    case 'menu':
      await saveSession(msg.from, userId, { ...session, awaitingMenu: true });
      await reply(msg.waId, MENU_TEXT);
      return;

    case 'set_mode':
      await saveSession(msg.from, userId, { mode: decision.module, awaitingMenu: false });
      await reply(msg.waId, MODE_CONFIRM[decision.module]);
      return;

    case 'link':
      await linkNumber(msg, decision.code);
      return;

    case 'needs_account':
      await reply(msg.waId, needsAccountText(decision.module, env.appUrl));
      return;

    case 'route':
      if (session.awaitingMenu) await saveSession(msg.from, userId, { ...session, awaitingMenu: false });
      await captureServer(EVENTS.whatsappRouted, userId ?? msg.waId, { module: decision.module, type: msg.type });
      if (decision.module === 'check') {
        await handleCheckMessage({
          waId: msg.waId,
          messageId: msg.messageId,
          type: msg.type === 'audio' ? 'unsupported' : msg.type,
          text: msg.text,
          mediaId: msg.mediaId,
        });
        return;
      }
      await routeVoiceOrText(msg, decision.module, profile!.id);
  }
}

async function routeVoiceOrText(msg: InboundMessage, module: 'post' | 'reels', userId: string) {
  const isAudio = msg.type === 'audio';
  const isText = msg.type === 'text' || msg.type === 'interactive';
  if ((isAudio && !msg.mediaId) || (isText && !msg.text) || (!isAudio && !isText)) {
    await reply(msg.waId, 'Send a voice note or a text message — or type *menu* to switch.');
    return;
  }

  const job: VoiceJob = {
    waMessageId: msg.messageId,
    from: msg.from,
    type: isAudio ? 'audio' : 'text',
    userId,
    mediaId: isAudio ? msg.mediaId : undefined,
    text: isText ? msg.text : undefined,
  };
  // Dedupe the queue job too, keyed on the wa_message_id.
  await enqueue(JOB_PATHS[module], job, { deduplicationId: msg.messageId });
  log.info('whatsapp: enqueued job', { module, waMessageId: msg.messageId, type: job.type });
}

/**
 * Complete a number link: the sender proved they own `msg.from` by sending the
 * one-time code the app showed to a signed-in user. Codes are single-use and
 * expire; a number already linked to a different account is never moved.
 */
async function linkNumber(msg: InboundMessage, code: string): Promise<void> {
  const sb = createAdminClient();
  const { data: row } = await sb
    .from('whatsapp_link_codes')
    .delete()
    .eq('code', code)
    .gt('expires_at', new Date().toISOString())
    .select('user_id')
    .maybeSingle();
  if (!row) {
    await reply(msg.waId, 'That code is invalid or has expired. Get a new one in the Manch app.');
    return;
  }

  const { error } = await sb.from('profiles').update({ whatsapp_e164: msg.from }).eq('id', row.user_id);
  if (error) {
    if ((error as { code?: string }).code === '23505') {
      await reply(msg.waId, 'This number is already linked to another Manch account. Unlink it there first.');
      return;
    }
    throw error;
  }
  await saveSession(msg.from, row.user_id, { awaitingMenu: true });
  await reply(msg.waId, `✅ This number is now linked to your Manch account.\n\n${MENU_TEXT}`);
}
