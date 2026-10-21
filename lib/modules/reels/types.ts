// Manch Reels domain + API contract types (formerly Bhasha Studio lib/types).
// No server-only imports (used on the client too). The account plan is the
// Manch `Plan` from '@/lib/plans'; the shared `ApiError` lives in '@/lib/types'.

export type { Plan, ReelsTier } from '@/lib/plans';
export type { ApiError } from '@/lib/types';

export type LanguageCode = 'hi' | 'ta' | 'te' | 'mr' | 'bn' | 'kn' | 'gu' | 'pa';
export type Platform = 'instagram' | 'moj' | 'josh' | 'sharechat' | 'youtube';
export type Style = 'educational' | 'entertainment' | 'emotional';
export type PieceKind =
  | 'script'
  | 'caption'
  | 'hashtags'
  | 'audio_match'
  | 'thumbnail'
  | 'repurpose'
  | 'calendar';
export type PieceSource = 'web' | 'whatsapp' | 'agency_bulk';

export const STYLES: Style[] = ['educational', 'entertainment', 'emotional'];
export const PLATFORMS: Platform[] = ['instagram', 'moj', 'josh', 'sharechat', 'youtube'];

/** A single script angle. */
export interface ScriptOutput {
  hook: string;
  body: string;
  cta: string;
}

/** The three style variants of one idea (the Script Generator's output). */
export interface ThreeStyleScript {
  educational: ScriptOutput;
  entertainment: ScriptOutput;
  emotional: ScriptOutput;
}

export interface GenerateScriptResult {
  pieceId: string;
  languageCode: LanguageCode;
  platform: Platform;
  styles: ThreeStyleScript;
  model: string;
}

/** 30 hashtags in three volume tiers (PRD §13). */
export interface HashtagSet {
  high: string[];
  mid: string[];
  niche: string[];
}

export interface TrendingAudioItem {
  id: string;
  title: string;
  audioUrl: string;
  mood: string | null;
  region: string | null;
  platform: string;
  rank: number | null;
}

/** Per-platform caption character limits (PRD §13 Caption Builder). */
export const PLATFORM_CAPTION_LIMIT: Record<Platform, number> = {
  instagram: 2200,
  sharechat: 1000,
  moj: 500,
  josh: 500,
  youtube: 5000,
};
