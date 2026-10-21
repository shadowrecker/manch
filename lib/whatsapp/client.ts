import { env, requireEnv } from '@/lib/env';
import { normaliseE164 } from '@/lib/utils';

// 360Dialog Business Cloud API client — shared by every module (one number).
// Module-specific message formats (Post drafts, Reels scripts, Check verdicts)
// live in lib/modules/<m>/whatsapp. All requests target
// env.dialog360BaseUrl and authenticate with the "D360-API-KEY" header. The key
// is resolved via requireEnv at the point of use so the module imports cleanly
// without secrets but fails loudly the moment we actually try to send.

function apiKey(): string {
  return requireEnv(env.dialog360ApiKey, 'DIALOG360_API_KEY');
}

function baseUrl(): string {
  return env.dialog360BaseUrl.replace(/\/$/, '');
}

function headers(): Record<string, string> {
  return {
    'D360-API-KEY': apiKey(),
    'Content-Type': 'application/json',
  };
}

/**
 * Send a plain text WhatsApp message to a number in E.164 form. The Cloud API
 * caps body text at 4096 chars; callers should keep messages well under that.
 */
export async function sendText(toE164: string, text: string): Promise<void> {
  const to = normaliseE164(toE164).replace(/^\+/, ''); // Cloud API wants digits only
  const res = await fetch(`${baseUrl()}/messages`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { preview_url: true, body: text.slice(0, 4096) },
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`360Dialog sendText failed: ${res.status} ${detail}`);
  }
}

/**
 * Resolve a Cloud API media id to its bytes. Two hops: (1) GET /{id} returns a
 * short-lived signed URL + mime_type, (2) fetch that URL with the same API key.
 */
export async function downloadMedia(
  mediaId: string,
): Promise<{ data: Blob; mimeType: string }> {
  const metaRes = await fetch(`${baseUrl()}/${encodeURIComponent(mediaId)}`, {
    method: 'GET',
    headers: { 'D360-API-KEY': apiKey() },
  });
  if (!metaRes.ok) {
    const detail = await metaRes.text().catch(() => '');
    throw new Error(`360Dialog media lookup failed: ${metaRes.status} ${detail}`);
  }
  const meta = (await metaRes.json()) as { url?: string; mime_type?: string };
  if (!meta.url) throw new Error('360Dialog media response missing url');

  const fileRes = await fetch(meta.url, {
    method: 'GET',
    headers: { 'D360-API-KEY': apiKey() },
  });
  if (!fileRes.ok) {
    const detail = await fileRes.text().catch(() => '');
    throw new Error(`360Dialog media download failed: ${fileRes.status} ${detail}`);
  }
  const data = await fileRes.blob();
  const mimeType =
    meta.mime_type || fileRes.headers.get('content-type') || 'application/octet-stream';
  return { data, mimeType };
}
