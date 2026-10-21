// Manch Post (formerly Folio AI) domain + API contract types. Imported by both
// server and client code, so keep this free of any runtime/server-only imports.
// The account Plan lives in @/lib/plans and ApiError in @/lib/types.

export type Angle = 'story' | 'insight' | 'opinion';
export type DetectedLang = 'english' | 'hinglish' | 'hindi';
export type DraftStatus = 'draft' | 'scheduled' | 'published' | 'discarded';
export type DraftSource = 'whatsapp' | 'web' | 'meeting_notes';
export type AuditDataSource = 'oauth' | 'pasted' | 'proxycurl';

export interface VoiceProfileInput {
  industry: string;
  seniority: string;
  topics: string[];
  tone: string;
  writingSample?: string;
}

export interface GeneratedPost {
  angle: Angle;
  body: string;
}

/** Response shape of POST /api/post/generate and the WhatsApp worker. */
export interface GenerateResult {
  genRequestId: string;
  posts: GeneratedPost[];
  detectedLang: DetectedLang;
  model: string;
}

export interface AuditScores {
  headline: number;
  about: number;
  experience: number;
  frequency: number;
  cta: number;
}

export interface AuditFix {
  dimension: string;
  score: number;
  action: string;
}

/** Response shape of the audit pipeline. */
export interface AuditResult {
  scores: AuditScores;
  overall: number;
  fixes: AuditFix[];
}

export const AUDIT_DIMENSIONS: { key: keyof AuditScores; label: string; hint: string }[] = [
  { key: 'headline', label: 'Headline', hint: 'Clear positioning & keywords' },
  { key: 'about', label: 'About section', hint: 'Story + proof + CTA' },
  { key: 'experience', label: 'Experience framing', hint: 'Impact over duties' },
  { key: 'frequency', label: 'Posting frequency', hint: 'Consistency signal' },
  { key: 'cta', label: 'CTA clarity', hint: 'Tells people what to do' },
];
