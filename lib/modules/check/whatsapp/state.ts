import { LANGUAGE_CODES, LANGUAGES, isLanguageCode } from '@/lib/modules/check/languages';
import type { Json } from '@/lib/db/types';
import type { LanguageCode } from '@/lib/modules/check/types';

// Bot conversation state machine (PRD §3.2a). Stored in bot_users.state. The only
// stateful step is first-contact language onboarding; after that every message is
// a check.

export interface BotState {
  onboarded?: boolean;
  awaitingLanguage?: boolean;
}

export function asState(state: Json | null | undefined): BotState {
  return (state && typeof state === 'object' && !Array.isArray(state) ? state : {}) as BotState;
}

export function isOnboarded(state: Json | null | undefined): boolean {
  return asState(state).onboarded === true;
}

export const LANGUAGE_PROMPT = [
  '🙏 Welcome to Manch Check. Which language should I reply in?',
  '',
  ...LANGUAGES.map((l, i) => `${i + 1}. ${l.nativeName}${l.code === 'en' ? '' : ` (${l.name})`}`),
  '',
  'Reply with a number (1–8).',
].join('\n');

/** Parse a language choice from a number, code, native/English name, or button id. */
export function parseLanguageChoice(input: string): LanguageCode | null {
  const t = input.trim().toLowerCase();
  // interactive button id: "lang:hi"
  const idMatch = t.match(/^lang:([a-z]{2})$/);
  if (idMatch && isLanguageCode(idMatch[1])) return idMatch[1];
  // number 1..8
  const n = Number(t);
  if (Number.isInteger(n) && n >= 1 && n <= LANGUAGE_CODES.length) return LANGUAGE_CODES[n - 1];
  // raw code
  if (isLanguageCode(t)) return t;
  // English or native name
  const byName = LANGUAGES.find((l) => l.name.toLowerCase() === t || l.nativeName.toLowerCase() === t);
  return byName?.code ?? null;
}
