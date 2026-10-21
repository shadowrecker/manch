'use client';

import { useEffect, useRef, useState } from 'react';
import { toPng } from 'html-to-image';
import posthog from 'posthog-js';
import { Spinner } from '@/components/ui/spinner';
import { toast } from '@/components/ui/toast';
import { EVENTS } from '@/lib/events';
import type { ApiError, LanguageCode, Platform } from '@/lib/modules/reels/types';

// Generates a native-script caption for the given context and renders it as a
// downloadable card. The browser shapes the native script correctly (HarfBuzz),
// so html-to-image captures conjuncts/reordering faithfully — no server Chromium.
export function CaptionPanel({
  languageCode,
  platform,
  context,
  handle,
  onClose,
}: {
  languageCode: LanguageCode;
  platform: Platform;
  context: string;
  handle: string | null;
  onClose: () => void;
}) {
  const [caption, setCaption] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setCaption(null);
    fetch('/api/reels/caption', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ languageCode, platform, context }),
    })
      .then(async (r) => {
        if (!r.ok) {
          const e = (await r.json().catch(() => ({}))) as ApiError;
          throw new Error(e.error || 'failed');
        }
        return r.json() as Promise<{ caption: string }>;
      })
      .then((d) => {
        if (active) setCaption(d.caption);
      })
      .catch(() => {
        if (active) toast('Could not make caption');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [languageCode, platform, context]);

  async function download() {
    if (!cardRef.current) return;
    try {
      const url = await toPng(cardRef.current, { pixelRatio: 2, backgroundColor: '#140f23' });
      const a = document.createElement('a');
      a.href = url;
      a.download = `caption-${languageCode}.png`;
      a.click();
      const ph = posthog as unknown as { __loaded?: boolean };
      if (ph.__loaded) posthog.capture(EVENTS.captionExported, { language_code: languageCode, format: 'png' });
      toast('Image downloaded');
    } catch {
      toast('Could not export image');
    }
  }

  function copy() {
    if (caption) {
      navigator.clipboard?.writeText(caption);
      toast('Caption copied');
    }
  }

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>Caption</h2>
        <button className="btn ghost sm" onClick={onClose}>
          Close ✕
        </button>
      </div>
      {loading ? (
        <p className="muted">
          <Spinner /> Writing your caption…
        </p>
      ) : (
        <>
          <div ref={cardRef} className="caption-card" style={{ marginTop: 12 }}>
            {handle && <div className="handle">@{handle}</div>}
            {/* The caption text already carries the free-tier watermark from the server. */}
            <div className="text native">{caption}</div>
          </div>
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn sm" onClick={download}>
              ⬇️ Download image
            </button>
            <button className="btn ghost sm" onClick={copy}>
              Copy caption
            </button>
          </div>
        </>
      )}
    </div>
  );
}
