import { normaliseE164 } from '@/lib/utils';

// Parse the 360Dialog / WhatsApp Cloud API webhook payload into one flat shape
// that the router (lib/whatsapp/router.ts) can decide on. Status callbacks,
// reactions etc. carry no `messages` and are ignored.

export type InboundType = 'text' | 'audio' | 'image' | 'video' | 'interactive' | 'unsupported';

export interface InboundMessage {
  messageId: string;
  /** Sender as E.164 with a leading "+" (profiles.whatsapp_e164 format). */
  from: string;
  /** Sender exactly as WhatsApp sent it — digits only (bot_users.wa_id format). */
  waId: string;
  type: InboundType;
  /** Text body, or the id of the tapped button / list row for `interactive`. */
  text?: string;
  /** Media id for audio / image / video. */
  mediaId?: string;
  /** WhatsApp marked it "Forwarded" — a strong signal the user wants a fact-check. */
  forwarded: boolean;
}

type Nested = Record<string, unknown>;
const arr = (v: unknown): Nested[] => (Array.isArray(v) ? (v as Nested[]) : []);
const obj = (v: unknown): Nested => (v && typeof v === 'object' ? (v as Nested) : {});
const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);

export function parseInbound(payload: unknown): InboundMessage[] {
  const out: InboundMessage[] = [];
  for (const entry of arr(obj(payload).entry)) {
    for (const change of arr(entry.changes)) {
      for (const m of arr(obj(change.value).messages)) {
        const messageId = str(m.id);
        const waId = str(m.from);
        const rawType = str(m.type);
        if (!messageId || !waId || !rawType) continue;

        const ctx = obj(m.context);
        const base = {
          messageId,
          waId: waId.replace(/[^\d]/g, ''),
          from: normaliseE164(waId),
          forwarded: ctx.forwarded === true || ctx.frequently_forwarded === true,
        };

        switch (rawType) {
          case 'text':
            out.push({ ...base, type: 'text', text: str(obj(m.text).body)?.trim() });
            break;
          case 'interactive': {
            const inter = obj(m.interactive);
            const reply = obj(inter.button_reply ?? inter.list_reply);
            out.push({ ...base, type: 'interactive', text: str(reply.id) });
            break;
          }
          case 'audio':
          case 'voice':
            out.push({ ...base, type: 'audio', mediaId: str(obj(m.audio).id) ?? str(obj(m.voice).id) });
            break;
          case 'image':
            out.push({ ...base, type: 'image', mediaId: str(obj(m.image).id) });
            break;
          case 'video':
            out.push({ ...base, type: 'video', mediaId: str(obj(m.video).id) });
            break;
          default:
            out.push({ ...base, type: 'unsupported' });
        }
      }
    }
  }
  return out;
}
