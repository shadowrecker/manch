import { createAdminClient } from '@/lib/supabase/admin';
import { extractClaims } from '@/lib/modules/check/ai/prompts/claims';
import { synthesizeVerdict, type ClaimEvidence } from '@/lib/modules/check/ai/prompts/verdict';
import { searchCorpus } from '@/lib/modules/check/corpus/search';
import { contentHashFor, getCachedVerdict, putCachedVerdict } from '@/lib/modules/check/pipeline/cache';
import { unverifiedVerdict } from '@/lib/modules/check/pipeline/score';
import { log } from '@/lib/observability';
import type { LanguageCode, Verdict } from '@/lib/modules/check/types';
import type { Json } from '@/lib/db/types';

// The text fact-check pipeline (PRD §3.3 Flow A): hash → cache → claims → retrieve
// → adjudicate → localize → cache + persist. The HUMILITY INVARIANT is code-enforced:
// no evidence ⇒ `unverified`, never a confident verdict.

export interface CheckRequester {
  botUserId?: string | null;
  apiKeyId?: string | null;
}

export interface TextCheckInput {
  text: string;
  language: LanguageCode;
  requester?: CheckRequester;
}

export interface CheckResult {
  checkId: string | null;
  verdict: Verdict;
  fromCache: boolean;
}

// Localizer seam — Section D injects the Sarvam translator. Default = English passthrough.
export type Localizer = (verdict: Verdict, language: LanguageCode) => Promise<Verdict>;
const identityLocalizer: Localizer = async (v, language) => ({ ...v, language });

export async function runTextCheck(input: TextCheckInput, opts: { localize?: Localizer } = {}): Promise<CheckResult> {
  const localize = opts.localize ?? identityLocalizer;
  const hash = contentHashFor(input.text);

  // 1. Cache — viral forwards short-circuit here.
  const cached = await getCachedVerdict(hash, input.language);
  if (cached) {
    const checkId = await persistCheck(input, hash, cached, true);
    return { checkId, verdict: cached, fromCache: true };
  }

  // 2. Extract claims.
  const claims = await extractClaims(input.text);

  // 3. Retrieve evidence + adjudicate — with the humility invariant.
  let english: Verdict;
  if (claims.length === 0) {
    english = unverifiedVerdict('en');
  } else {
    const claimEvidence: ClaimEvidence[] = [];
    for (const claim of claims) {
      claimEvidence.push({ claim, evidence: await searchCorpus(claim, { limit: 5, lang: 'en' }) });
    }
    const totalEvidence = claimEvidence.reduce((n, ce) => n + ce.evidence.length, 0);
    if (totalEvidence === 0) {
      // No reliable evidence → unverified (never a confident answer). No Claude call.
      english = {
        ...unverifiedVerdict('en'),
        claims: claims.map((c) => ({ text: c, verdict: 'unverified' as const, confidence: 0.3, sources: [] })),
      };
    } else {
      english = await synthesizeVerdict(input.text, claimEvidence);
    }
  }

  // 4. Localize (Section D) + cache + persist.
  const verdict = await localize(english, input.language);
  await putCachedVerdict(hash, input.language, verdict);
  const checkId = await persistCheck(input, hash, verdict, false);
  return { checkId, verdict, fromCache: false };
}

async function persistCheck(input: TextCheckInput, hash: string, verdict: Verdict, fromCache: boolean): Promise<string | null> {
  try {
    const sb = createAdminClient();
    const { data, error } = await sb
      .from('checks')
      .insert({
        bot_user_id: input.requester?.botUserId ?? null,
        api_key_id: input.requester?.apiKeyId ?? null,
        input_type: 'text',
        content_hash: hash,
        language: input.language,
        trust_score: verdict.trustScore,
        verdict_label: verdict.label,
        verdict_text: verdict.explanation,
        sources: verdict.sources as unknown as Json,
        status: 'done',
        from_cache: fromCache,
      })
      .select('id')
      .single();
    if (error) throw error;
    if (verdict.claims.length) {
      await sb.from('claims').insert(
        verdict.claims.map((c) => ({
          check_id: data.id,
          claim_text: c.text,
          verdict: c.verdict,
          confidence: c.confidence,
          sources: c.sources as unknown as Json,
        })),
      );
    }
    return data.id;
  } catch (e) {
    log.warn('persist check failed', { error: String(e) });
    return null;
  }
}
