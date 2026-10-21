import { sendText } from '@/lib/whatsapp/client';
import type { ScriptOutput } from '@/lib/modules/reels/types';

// Reels-specific WhatsApp message formats, on top of the shared 360Dialog client.

/** Deliver one script (hook/body/cta) + a deep link to the studio for all 3 styles. */
export async function sendScript(to: string, script: ScriptOutput, studioUrl: string): Promise<void> {
  const text = `🎬 ${script.hook}\n\n${script.body}\n\n${script.cta}\n\n✏️ See all 3 styles + caption: ${studioUrl}`;
  await sendText(to, text);
}
