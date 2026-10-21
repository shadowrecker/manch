import { env } from '@/lib/env';
import { log } from '@/lib/observability';

// Download forwarded WhatsApp media (Cloud API / 360Dialog). Two hops: resolve the
// media id → a URL, then fetch the bytes. Media is processed transiently and NOT
// retained beyond the hash + verdict (PRD §11 privacy).

export interface DownloadedMedia {
  bytes: Uint8Array;
  mime: string;
}

export async function downloadMedia(mediaId: string): Promise<DownloadedMedia | null> {
  if (!env.dialog360ApiKey || !mediaId) return null;
  try {
    const metaRes = await fetch(`${env.dialog360BaseUrl}/${mediaId}`, {
      headers: { 'D360-API-KEY': env.dialog360ApiKey },
    });
    if (!metaRes.ok) return null;
    const meta = (await metaRes.json()) as { url?: string; mime_type?: string };
    if (!meta.url) return null;

    const fileRes = await fetch(meta.url, { headers: { 'D360-API-KEY': env.dialog360ApiKey } });
    if (!fileRes.ok) return null;
    const buf = new Uint8Array(await fileRes.arrayBuffer());
    return { bytes: buf, mime: meta.mime_type ?? fileRes.headers.get('content-type') ?? 'application/octet-stream' };
  } catch (e) {
    log.warn('media download failed', { mediaId, error: String(e) });
    return null;
  }
}
