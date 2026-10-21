// Manch Check domain types (formerly TrustCheck, PRD §24–29). Shared by client +
// server — no imports with side effects. The account plan is the Manch `Plan`
// (@/lib/plans, mapped to a Check tier by checkTier()); `ApiError` lives in @/lib/types.

// MVP languages (PRD §26): Hindi, Tamil, Telugu, Bengali, Marathi, Kannada,
// Malayalam, English. (Bhasha's catalog adapted: +Malayalam +English, -Gu/Pa.)
export type LanguageCode = 'hi' | 'ta' | 'te' | 'bn' | 'mr' | 'kn' | 'ml' | 'en';

export type InputType = 'text' | 'image' | 'video' | 'url';

// The synthesised verdict label.
export type VerdictLabel = 'verified' | 'misleading' | 'false' | 'unverified' | 'manipulated';
export const VERDICT_LABELS: VerdictLabel[] = ['verified', 'misleading', 'false', 'unverified', 'manipulated'];

// Per-claim adjudication against the corpus.
export type ClaimVerdict = 'supported' | 'refuted' | 'unverified';

// Media authenticity outcome — deliberately probabilistic (PRD §26 deepfake).
export type MediaVerdict = 'likely_ai' | 'possibly_manipulated' | 'no_signals';

export interface Source {
  title: string;
  url: string;
  publisher?: string;
}

export interface Claim {
  text: string;
  verdict: ClaimVerdict;
  confidence: number; // 0..1
  sources: Source[];
}

/** The full verdict returned to the bot / API. Trust score is 1..10. */
export interface Verdict {
  trustScore: number;
  label: VerdictLabel;
  explanation: string; // plain-language, grade-8, in the user's language
  claims: Claim[];
  sources: Source[];
  language: LanguageCode;
}

export interface MediaAnalysis {
  mediaType: 'image' | 'video';
  verdict: MediaVerdict;
  confidence: number; // 0..1
  signals: Record<string, unknown>;
  note: string; // the humility note (signals, not proof)
}

/** Clamp a model-proposed trust score into the 1..10 band. */
export function clampTrustScore(n: number): number {
  return Math.max(1, Math.min(10, Math.round(n)));
}
