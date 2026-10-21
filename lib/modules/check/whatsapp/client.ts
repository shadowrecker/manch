import { env } from '@/lib/env';
import { log } from '@/lib/observability';

// 360Dialog WhatsApp client (the front door). Cloud-API-shaped. Send is a no-op
// without a key so the pipeline never hard-fails in dev/test.

async function call(path: string, init: RequestInit): Promise<Response | null> {
  if (!env.dialog360ApiKey) return null;
  try {
    return await fetch(`${env.dialog360BaseUrl}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', 'D360-API-KEY': env.dialog360ApiKey, ...(init.headers ?? {}) },
    });
  } catch (e) {
    log.warn('whatsapp call failed', { path, error: String(e) });
    return null;
  }
}

/** Send a plain-text WhatsApp message. */
export async function sendText(to: string, body: string): Promise<boolean> {
  const res = await call('/messages', {
    method: 'POST',
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body, preview_url: false } }),
  });
  return !!res?.ok;
}

/** Send interactive reply buttons (used for language onboarding). */
export async function sendButtons(to: string, body: string, buttons: { id: string; title: string }[]): Promise<boolean> {
  const res = await call('/messages', {
    method: 'POST',
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: body },
        action: { buttons: buttons.slice(0, 3).map((b) => ({ type: 'reply', reply: b })) },
      },
    }),
  });
  return !!res?.ok;
}
