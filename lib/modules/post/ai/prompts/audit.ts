import type Anthropic from '@anthropic-ai/sdk';
import { runToolCall, cached } from '@/lib/ai/claude';
import type { AuditResult, AuditScores, AuditFix } from '@/lib/modules/post/types';
import { AUDIT_DIMENSIONS } from '@/lib/modules/post/types';

// LinkedIn Profile Audit grader (PRD F-03, §9.3). Takes the user-pasted profile
// text (headline / about / experience, etc.) and returns a structured Manch
// Score across five dimensions plus the three highest-impact fixes.
//
// Compliance: input is USER-PASTED text — no scraping. Treat it as untrusted;
// we only feed it to the model as content, never as instructions, and the tool
// schema constrains the output to numbers + short strings.

// Static, cache-eligible rubric. Encodes the §9.3 scoring criteria so the model
// grades consistently. Kept stable across requests to maximise prompt-cache hits.
const RUBRIC = `You are Manch's LinkedIn profile auditor for Indian professionals.
Grade the profile text the user pasted on five dimensions, each 0-100, using this rubric:

1. headline — Does the headline LEAD WITH THE OUTCOME the person creates (the value they deliver),
   not just a job title or company? Reward clear positioning, relevant keywords and a specific niche.
   Penalise generic titles ("Manager at X"), buzzword soup and empty headlines.

2. about — Is the About section structured as HOOK + PROOF + CTA? Reward a strong opening line that
   pulls the reader in, 2+ concrete results/numbers as proof, and a clear closing call-to-action
   (how/why to reach out). Penalise third-person corporate bios with no story, proof or CTA.

3. experience — Does each role frame IMPACT OVER DUTIES? Reward measurable wins (numbers, %, scale,
   outcomes) over lists of responsibilities. Penalise pure duty lists and copied job descriptions.

4. frequency — Does the profile signal CONSISTENT posting/activity? Reward evidence of regular,
   recent activity (2-3x/week is healthy). If there is no signal of activity, score this low and
   conservatively — assume inconsistent posting.

5. cta — Is there a CLEAR NEXT STEP for a reader anywhere in the profile (DM me, book a call, link,
   "open to..." )? Reward an explicit, easy next action. Penalise no contactability or next step.

Scoring guidance:
- Be specific and fair. Use the full 0-100 range; do not bunch everything around 50.
- If the pasted profile text is very short, sparse or missing whole sections, score CONSERVATIVELY
  (low) for the dimensions you cannot verify — never invent strengths that are not in the text.
- "overall" is the rounded mean of the five dimension scores.
- "fixes" must be exactly the THREE LOWEST-SCORING dimensions, lowest first. For each, give one
  specific, actionable instruction tailored to what the text is missing (not generic advice).
  Each fix.dimension MUST be one of: headline, about, experience, frequency, cta.`;

// Map a dimension key to its human label (for fixes shown in the UI / fallback).
const LABELS = Object.fromEntries(
  AUDIT_DIMENSIONS.map((d) => [d.key, d.label]),
) as Record<keyof AuditScores, string>;

const DIMENSION_KEYS = AUDIT_DIMENSIONS.map((d) => d.key);

// Tool schema forcing structured JSON output — no fragile text parsing.
const gradeProfileTool: Anthropic.Tool = {
  name: 'grade_profile',
  description: 'Return the Manch Score breakdown and top-3 fixes for a LinkedIn profile.',
  input_schema: {
    type: 'object',
    properties: {
      scores: {
        type: 'object',
        properties: {
          headline: { type: 'integer', minimum: 0, maximum: 100 },
          about: { type: 'integer', minimum: 0, maximum: 100 },
          experience: { type: 'integer', minimum: 0, maximum: 100 },
          frequency: { type: 'integer', minimum: 0, maximum: 100 },
          cta: { type: 'integer', minimum: 0, maximum: 100 },
        },
        required: ['headline', 'about', 'experience', 'frequency', 'cta'],
      },
      overall: { type: 'integer', minimum: 0, maximum: 100 },
      fixes: {
        type: 'array',
        minItems: 3,
        maxItems: 3,
        items: {
          type: 'object',
          properties: {
            dimension: {
              type: 'string',
              enum: DIMENSION_KEYS,
              description: 'One of: headline, about, experience, frequency, cta',
            },
            score: { type: 'integer', minimum: 0, maximum: 100 },
            action: {
              type: 'string',
              description: 'One specific, tailored action to improve this dimension.',
            },
          },
          required: ['dimension', 'score', 'action'],
        },
      },
    },
    required: ['scores', 'overall', 'fixes'],
  },
};

// Raw tool output shape (before we normalise it server-side).
interface GradeProfileOutput {
  scores: AuditScores;
  overall?: number;
  fixes?: AuditFix[];
}

function clampScore(n: unknown): number {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, v));
}

function meanScore(s: AuditScores): number {
  const total = s.headline + s.about + s.experience + s.frequency + s.cta;
  return Math.round(total / 5);
}

/** Build the top-3 fixes locally as a fallback / to enforce "3 lowest". */
function deriveFixes(scores: AuditScores, modelFixes?: AuditFix[]): AuditFix[] {
  const ranked = (Object.keys(scores) as (keyof AuditScores)[])
    .map((key) => ({ key, score: scores[key] }))
    .sort((a, b) => a.score - b.score)
    .slice(0, 3);

  return ranked.map(({ key, score }) => {
    // Prefer the model's action for this dimension when present.
    const fromModel = modelFixes?.find((f) => f.dimension === key);
    const action = fromModel?.action?.trim();
    return {
      dimension: LABELS[key],
      score,
      action: action || `Improve your ${LABELS[key].toLowerCase()} — it is your lowest-scoring area.`,
    };
  });
}

/**
 * Grade a pasted LinkedIn profile and return a normalised AuditResult.
 * The model produces the scores + suggested actions; we recompute `overall`
 * and the "3 lowest" fix ordering server-side so the output is always coherent.
 */
export async function runAudit(profileText: string): Promise<AuditResult> {
  const text = profileText.trim();

  const system = [cached(RUBRIC)];
  const messages: Anthropic.MessageParam[] = [
    {
      role: 'user',
      content:
        'Grade this LinkedIn profile. Here is the profile text the user pasted ' +
        '(headline, about, experience, etc.). If sections are missing or sparse, ' +
        'score conservatively.\n\n--- PROFILE TEXT START ---\n' +
        text +
        '\n--- PROFILE TEXT END ---',
    },
  ];

  const out = await runToolCall<GradeProfileOutput>({
    system,
    messages,
    tool: gradeProfileTool,
    maxTokens: 1024,
    temperature: 0.3, // graded output should be fairly deterministic
  });

  // Normalise scores (clamp to 0-100 ints).
  const scores: AuditScores = {
    headline: clampScore(out.scores?.headline),
    about: clampScore(out.scores?.about),
    experience: clampScore(out.scores?.experience),
    frequency: clampScore(out.scores?.frequency),
    cta: clampScore(out.scores?.cta),
  };

  // Compute overall server-side as the rounded mean if the model omitted/garbled it.
  const overall =
    typeof out.overall === 'number' && Number.isFinite(out.overall)
      ? clampScore(out.overall)
      : meanScore(scores);

  // Enforce "exactly the 3 lowest dimensions", reusing the model's actions.
  const fixes = deriveFixes(scores, out.fixes);

  return { scores, overall, fixes };
}
