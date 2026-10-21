// Post-only queue job-body contracts (Upstash QStash). The WhatsApp → drafts
// worker consumes the shared VoiceJob from @/lib/jobs; only the scheduled
// LinkedIn publish job is Post-specific.

/** Body for POST /api/post/jobs/publish (produced by the scheduler). */
export interface PublishJob {
  publishedPostId: string;
}

/** Worker paths owned by the Post module. */
export const POST_JOB_PATHS = {
  generate: '/api/post/jobs/generate',
  publish: '/api/post/jobs/publish',
} as const;
