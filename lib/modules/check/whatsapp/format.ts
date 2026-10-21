import type { Verdict } from '@/lib/modules/check/types';
import { scoreBand } from '@/lib/modules/check/pipeline/score';
import { env } from '@/lib/env';

/** Where WhatsApp users upgrade (the one Manch billing page). */
const UPGRADE_URL = `${env.appUrl}/settings/billing?plan=plus`;

// WhatsApp message formatting for verdicts. Plain text (WhatsApp markdown: *bold*).
// Always carries the humility disclaimer — a verdict is signals + sources, not a ruling.

const LABEL_TEXT: Record<string, string> = {
  verified: 'Looks accurate',
  misleading: 'Misleading',
  false: 'False',
  unverified: "Couldn't verify",
  manipulated: 'Possibly manipulated',
};

export function scoreEmoji(verdict: Verdict): string {
  if (verdict.label === 'manipulated') return '🎭';
  const band = scoreBand(verdict.trustScore);
  return band === 'high' ? '✅' : band === 'mid' ? '⚠️' : '❌';
}

export const DISCLAIMER =
  '⚠️ This is a signal with sources, not a final ruling. When in doubt, don’t forward. Manch Check is not a substitute for professional fact-checking.';

export function formatVerdict(verdict: Verdict): string {
  const lines = [
    `${scoreEmoji(verdict)} *Trust score: ${verdict.trustScore}/10 — ${LABEL_TEXT[verdict.label] ?? verdict.label}*`,
    '',
    verdict.explanation,
  ];
  if (verdict.sources.length) {
    lines.push('', '*Sources:*');
    for (const s of verdict.sources.slice(0, 4)) {
      lines.push(`• ${s.title}${s.url ? ` — ${s.url}` : ''}`);
    }
  }
  lines.push('', DISCLAIMER);
  return lines.join('\n');
}

export const CHECKING_MESSAGE = '🔎 Checking this for you… I’ll reply in a few seconds.';

export const QUOTA_MESSAGE =
  `You’ve used your free checks for this month. Upgrade to Manch Plus for unlimited checks, all media types, and every language: ${UPGRADE_URL}`;

export const MEDIA_UPGRADE_MESSAGE =
  `Checking images and videos is a Manch Plus feature. Free covers text messages. Upgrade for unlimited media checks: ${UPGRADE_URL}`;
