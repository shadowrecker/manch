import crypto from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { downloadMedia } from '@/lib/modules/check/whatsapp/media';
import { analyzeMedia } from '@/lib/modules/check/media/deepfake';
import { getCachedVerdict, putCachedVerdict } from '@/lib/modules/check/pipeline/cache';
import { translateVerdict } from '@/lib/modules/check/verdict/translate';
import { log } from '@/lib/observability';
import type { LanguageCode, MediaAnalysis, Verdict } from '@/lib/modules/check/types';
import type { Json } from '@/lib/db/types';

// Media authenticity check (PRD §3.3 Flow B): download → (perceptual) hash cache →
// analyse → map to a hedged verdict → translate → cache + persist. ABSENCE of
// signals is NOT proof of authenticity — the verdict always communicates that.

export interface MediaCheckInput {
  mediaId: string;
  mediaType: 'image' | 'video';
  language: LanguageCode;
  requester?: { botUserId?: string | null; apiKeyId?: string | null };
}

export interface MediaCheckResult {
  checkId: string | null;
  verdict: Verdict;
  fromCache: boolean;
  analysis: MediaAnalysis | null;
}

/** Content hash for media (sha256 of bytes — exact-dup cache; perceptual hash is a follow-up). */
export function mediaHash(bytes: Uint8Array): string {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

/** Map a probabilistic media analysis to a hedged English verdict. */
export function analysisToVerdict(a: MediaAnalysis): Verdict {
  const available = (a.signals as { available?: boolean }).available !== false;
  const base = { claims: [], sources: [], language: 'en' as const };
  if (!available) {
    return { ...base, trustScore: 5, label: 'unverified', explanation: `We couldn't run manipulation detection on this ${a.mediaType}. ${a.note}` };
  }
  if (a.verdict === 'likely_ai') {
    return { ...base, trustScore: 2, label: 'manipulated', explanation: `This ${a.mediaType} shows strong signs of being AI-generated or manipulated. ${a.note}` };
  }
  if (a.verdict === 'possibly_manipulated') {
    return { ...base, trustScore: 4, label: 'manipulated', explanation: `This ${a.mediaType} shows some signs of possible manipulation. ${a.note}` };
  }
  // no_signals, but detection ran — NOT a clean bill of health.
  return { ...base, trustScore: 6, label: 'unverified', explanation: `We found no clear manipulation signals in this ${a.mediaType}, but that does not prove it is genuine. ${a.note}` };
}

export async function runMediaCheck(input: MediaCheckInput): Promise<MediaCheckResult> {
  const media = await downloadMedia(input.mediaId);
  if (!media) {
    return {
      checkId: null,
      analysis: null,
      fromCache: false,
      verdict: { trustScore: 5, label: 'unverified', explanation: "I couldn't download that media to check it. Please resend it.", claims: [], sources: [], language: input.language },
    };
  }

  const hash = mediaHash(media.bytes);
  const cached = await getCachedVerdict(hash, input.language);
  if (cached) {
    const checkId = await persist(input, hash, cached, true, null);
    return { checkId, verdict: cached, fromCache: true, analysis: null };
  }

  const analysis = await analyzeMedia({ bytes: media.bytes, mediaType: input.mediaType });
  const verdict = await translateVerdict(analysisToVerdict(analysis), input.language);
  await putCachedVerdict(hash, input.language, verdict);
  const checkId = await persist(input, hash, verdict, false, analysis);
  return { checkId, verdict, fromCache: false, analysis };
}

async function persist(input: MediaCheckInput, hash: string, verdict: Verdict, fromCache: boolean, analysis: MediaAnalysis | null): Promise<string | null> {
  try {
    const sb = createAdminClient();
    const { data, error } = await sb
      .from('checks')
      .insert({
        bot_user_id: input.requester?.botUserId ?? null,
        api_key_id: input.requester?.apiKeyId ?? null,
        input_type: input.mediaType,
        content_hash: hash,
        language: input.language,
        trust_score: verdict.trustScore,
        verdict_label: verdict.label,
        verdict_text: verdict.explanation,
        sources: [] as unknown as Json,
        status: 'done',
        from_cache: fromCache,
      })
      .select('id')
      .single();
    if (error) throw error;
    if (analysis) {
      await sb.from('media_analyses').insert({
        check_id: data.id,
        media_type: analysis.mediaType,
        signals: analysis.signals as unknown as Json,
        verdict: analysis.verdict,
        confidence: analysis.confidence,
      });
    }
    return data.id;
  } catch (e) {
    log.warn('persist media check failed', { error: String(e) });
    return null;
  }
}
