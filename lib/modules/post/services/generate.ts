import { createAdminClient } from '@/lib/supabase/admin';
import { getProfile, incrementUsage } from '@/lib/db/queries';
import { getActiveVoiceProfile } from '@/lib/modules/post/queries';
import { applyWatermark, needsWatermark } from '@/lib/modules/post/entitlements';
import { generateThreeAngles } from '@/lib/modules/post/ai/prompts/generate';
import { detectLang } from '@/lib/modules/post/ai/transcribe';
import { MODEL } from '@/lib/ai/claude';
import { captureServer, EVENTS } from '@/lib/analytics';
import { normalisePlan } from '@/lib/plans';
import type {
  Angle,
  DetectedLang,
  DraftSource,
  GeneratedPost,
  GenerateResult,
} from '@/lib/modules/post/types';

// Shared generation orchestration used by BOTH the web route (/api/post/generate)
// and the WhatsApp worker (/api/post/jobs/generate). Loads the voice profile, calls
// Claude, persists the 3 drafts (watermarked per plan), meters usage, and emits
// the analytics event. Callers are responsible for the quota *check* before
// calling (web shows a paywall; WhatsApp sends an upgrade link).

export class NoVoiceProfileError extends Error {
  constructor() {
    super('No active voice profile');
    this.name = 'NoVoiceProfileError';
  }
}

export interface GenerateParams {
  userId: string;
  inputText: string;
  source: DraftSource;
  transcriptionId?: string | null;
  detectedLang?: DetectedLang;
}

const ANGLE_ORDER: Angle[] = ['story', 'insight', 'opinion'];

export async function generatePostsForUser(params: GenerateParams): Promise<GenerateResult> {
  const [profile, voice] = await Promise.all([
    getProfile(params.userId),
    getActiveVoiceProfile(params.userId),
  ]);
  if (!voice) throw new NoVoiceProfileError();

  const plan = normalisePlan(profile?.plan);
  const hindiOutput = profile?.hindi_output ?? false;
  const detectedLang = params.detectedLang ?? detectLang(params.inputText);

  const angles = await generateThreeAngles({
    styleGuide: voice.style_guide ?? '',
    seniority: voice.seniority,
    industry: voice.industry,
    topics: voice.topics,
    tone: voice.tone,
    hindiOutput,
    weekSummary: params.inputText,
  });

  const genRequestId = crypto.randomUUID();
  const watermark = needsWatermark(plan);
  const posts: GeneratedPost[] = ANGLE_ORDER.map((angle) => ({
    angle,
    body: applyWatermark(angles[angle], plan),
  }));

  const sb = createAdminClient();
  const { error } = await sb.from('drafts').insert(
    posts.map((p) => ({
      user_id: params.userId,
      source: params.source,
      input_text: params.inputText,
      transcription_id: params.transcriptionId ?? null,
      angle: p.angle,
      body: p.body,
      watermarked: watermark,
      ai_labelled: true,
      gen_request_id: genRequestId,
      model: MODEL,
    })),
  );
  if (error) throw error;

  await incrementUsage(params.userId, 'posts', 1);
  await captureServer(EVENTS.draftGenerated, params.userId, {
    source: params.source,
    gen_request_id: genRequestId,
    lang: detectedLang,
  });

  return { genRequestId, posts, detectedLang, model: MODEL };
}
