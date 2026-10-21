import { sendText } from '@/lib/whatsapp/client';
import { clip } from '@/lib/utils';
import type { Angle } from '@/lib/modules/post/types';

// Post-specific WhatsApp message formats, built on the shared 360Dialog client
// (@/lib/whatsapp/client — one number for all of Manch).

const ANGLE_LABEL: Record<Angle, string> = {
  story: 'Story',
  insight: 'Insight',
  opinion: 'Opinion',
};

/**
 * Send a concise summary of the 3 generated angles plus a deep link to the
 * editor. Each draft is trimmed so the whole message stays comfortably within
 * WhatsApp's 4096-char text limit even for long posts.
 */
export async function sendDrafts(
  toE164: string,
  posts: { angle: Angle; body: string }[],
  editorUrl: string,
): Promise<void> {
  const blocks = posts.map((p, i) => {
    const label = ANGLE_LABEL[p.angle] ?? p.angle;
    // Collapse whitespace for the preview, then trim.
    const preview = clip(p.body.trim().replace(/\s+/g, ' '), 280);
    return `${i + 1}. *${label}*\n${preview}`;
  });

  const message = [
    '✅ Your 3 drafts are ready, in your voice:',
    '',
    blocks.join('\n\n'),
    '',
    `Open & edit: ${editorUrl}`,
  ].join('\n');

  await sendText(toE164, message);
}
