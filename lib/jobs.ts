// Shared queue job-body contracts (Upstash QStash). Defined in lib/ (not in a
// route file) because Next.js route modules may only export request handlers.
// Module-only job shapes live in lib/modules/<m>/jobs.ts.

/**
 * Body for the voice/text → content workers, produced by the shared WhatsApp
 * webhook: POST /api/post/jobs/generate and POST /api/reels/jobs/generate.
 */
export interface VoiceJob {
  waMessageId: string;
  from: string; // E.164, e.g. +9198...
  type: 'text' | 'audio';
  userId: string;
  mediaId?: string;
  text?: string;
}
