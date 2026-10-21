'use client';

import { useRouter } from 'next/navigation';
import { toast } from '@/components/ui/toast';
import { WATERMARK_TEXT } from '@/lib/modules/post/entitlements';
import type { Angle } from '@/lib/modules/post/types';

// One generated post angle, styled to match the demo's .variant card. The
// generate route already persisted these as drafts, so "Edit" simply deep-links
// to /post/drafts (the editor lives there). "Copy" puts the body on the clipboard.
const ANGLE_LABEL: Record<Angle, string> = {
  story: 'Story',
  insight: 'Insight',
  opinion: 'Opinion',
};

export function VariantCard({ angle, body }: { angle: Angle; body: string }) {
  const router = useRouter();

  // Split the free-tier watermark off so it can render as the dashed footer
  // line from the demo rather than as plain body text.
  const hasWatermark = body.includes(WATERMARK_TEXT);
  const displayBody = hasWatermark
    ? body.slice(0, body.lastIndexOf(WATERMARK_TEXT)).trimEnd()
    : body;

  async function copy() {
    try {
      await navigator.clipboard.writeText(body);
      toast('Copied to clipboard');
    } catch {
      toast('Copy failed — select and copy manually');
    }
  }

  return (
    <div className="variant">
      <span className={`tag ${angle}`}>{ANGLE_LABEL[angle]}</span>
      {/* preserve newlines via .post-body (white-space: pre-wrap) */}
      <div className="post-body">{displayBody}</div>
      {hasWatermark && <div className="watermark">{WATERMARK_TEXT}</div>}
      <div className="row" style={{ marginTop: 'auto' }}>
        <button className="btn sm" onClick={() => router.push('/post/drafts')}>
          ✎ Edit
        </button>
        <button className="btn ghost sm" onClick={copy}>
          Copy
        </button>
      </div>
    </div>
  );
}
