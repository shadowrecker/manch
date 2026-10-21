import { createAdminClient } from '@/lib/supabase/admin';
import { getProfile, incrementUsage } from '@/lib/db/queries';
import { normalisePlan } from '@/lib/plans';
import { consumeCredit } from '@/lib/modules/reels/payments/credits';
import { needsWatermark, applyWatermark } from '@/lib/modules/reels/entitlements';
import { generateThreeStyleScript } from '@/lib/modules/reels/ai/prompts/script';
import { generateCaption } from '@/lib/modules/reels/ai/prompts/caption';
import { normaliseScript } from '@/lib/modules/reels/ai/vernacular';
import { MODEL } from '@/lib/ai/claude';
import { captureServer, EVENTS } from '@/lib/analytics';
import { log } from '@/lib/observability';
import type { GenerateScriptResult, LanguageCode, Platform, PieceSource } from '@/lib/modules/reels/types';
import type { Json } from '@/lib/db/types';

// Shared metering: 'quota' increments this month's `pieces` counter, 'credit'
// consumes a wallet credit. Used by both generators. Metering runs after a
// successful generation + persist; a metering hiccup never fails the response.
async function meter(userId: string, via: 'quota' | 'credit', ref: string): Promise<void> {
  try {
    if (via === 'credit') await consumeCredit(userId, ref, 1);
    else await incrementUsage(userId, 'pieces', 1);
  } catch (e) {
    log.warn('metering failed (piece already created)', { ref, error: String(e) });
  }
}

// Shared script-generation orchestration used by the web route AND the WhatsApp
// worker. Normalises the idea to native script, generates the 3 styles, persists
// the piece, and meters via the plan quota OR a wallet credit (PRD §12). The
// caller is responsible for the allowance CHECK (it decides meterVia).

export interface GenerateScriptParams {
  userId: string;
  languageCode: LanguageCode;
  platform: Platform;
  ideaText: string;
  source: PieceSource;
  /** 'quota' increments the monthly counter; 'credit' consumes a wallet credit. */
  meterVia: 'quota' | 'credit';
}

export async function generateScriptForUser(
  params: GenerateScriptParams,
): Promise<GenerateScriptResult> {
  const profile = await getProfile(params.userId);
  const plan = normalisePlan(profile?.plan);

  // Turn romanised / voice input into proper native script before generating.
  const idea = await normaliseScript(params.ideaText, params.languageCode);

  const styles = await generateThreeStyleScript({
    languageCode: params.languageCode,
    platform: params.platform,
    ideaText: idea,
  });

  const pieceId = crypto.randomUUID();
  const sb = createAdminClient();
  const { error } = await sb.from('bhasha_pieces').insert({
    id: pieceId,
    user_id: params.userId,
    kind: 'script',
    language_code: params.languageCode,
    platform: params.platform,
    input_text: idea,
    output: styles as unknown as Json,
    watermarked: needsWatermark(plan),
    ai_labelled: true,
    source: params.source,
    model: MODEL,
  });
  if (error) throw error;

  await meter(params.userId, params.meterVia, pieceId);

  await captureServer(EVENTS.pieceGenerated, params.userId, {
    kind: 'script',
    language_code: params.languageCode,
    platform: params.platform,
    source: params.source,
    via: params.meterVia,
  });

  return { pieceId, languageCode: params.languageCode, platform: params.platform, styles, model: MODEL };
}

export interface GenerateCaptionParams {
  userId: string;
  languageCode: LanguageCode;
  platform: Platform;
  context: string;
  source: PieceSource;
  meterVia: 'quota' | 'credit';
}

export interface GenerateCaptionResult {
  pieceId: string;
  caption: string;
}

/** Generate a native-script caption, watermark it for free tier, persist + meter. */
export async function generateCaptionForUser(
  params: GenerateCaptionParams,
): Promise<GenerateCaptionResult> {
  const profile = await getProfile(params.userId);
  const plan = normalisePlan(profile?.plan);

  const raw = await generateCaption({
    languageCode: params.languageCode,
    platform: params.platform,
    context: params.context,
  });
  // The caption is the PUBLISHED text → carry the free-tier watermark so every
  // shared caption is an ad (PRD §14).
  const caption = applyWatermark(raw, plan);

  const pieceId = crypto.randomUUID();
  const sb = createAdminClient();
  const { error } = await sb.from('bhasha_pieces').insert({
    id: pieceId,
    user_id: params.userId,
    kind: 'caption',
    language_code: params.languageCode,
    platform: params.platform,
    input_text: params.context,
    output: { caption } as unknown as Json,
    watermarked: needsWatermark(plan),
    ai_labelled: true,
    source: params.source,
    model: MODEL,
  });
  if (error) throw error;

  await meter(params.userId, params.meterVia, pieceId);
  await captureServer(EVENTS.pieceGenerated, params.userId, {
    kind: 'caption',
    language_code: params.languageCode,
    platform: params.platform,
    source: params.source,
    via: params.meterVia,
  });

  return { pieceId, caption };
}
