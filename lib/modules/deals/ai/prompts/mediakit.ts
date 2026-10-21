import type Anthropic from '@anthropic-ai/sdk';
import { cached, runToolCall } from '@/lib/ai/claude';
import type { MediaKitData } from '@/lib/modules/deals/types';

// The Auto Media Kit prompt (PRD §20, C-01). Professional brand-pitch framing
// that leads with audience value — specific, credible, never inflated.

export interface MediaKitInput {
  followers: number | null;
  engagementRate: number | null;
  niche: string[];
  contentStyle: string | null;
  city: string | null;
  topCategories: string[];
  rateHint?: string | null;
}

const SYSTEM = `You write professional media kits that Indian creators send to brands.

Frame everything around the VALUE TO A BRAND: who this creator reaches, why their
audience trusts them, and what a partnership delivers. Be specific and credible —
NEVER inflate numbers or invent stats the creator did not provide. Indian context;
warm but professional. Concise sections a brand manager can skim in 30 seconds.`;

const TOOL: Anthropic.Tool = {
  name: 'emit_media_kit',
  description: 'Return the sections of a professional creator media kit.',
  input_schema: {
    type: 'object',
    properties: {
      headline: { type: 'string', description: 'A one-line positioning headline.' },
      about: { type: 'string', description: 'A short "about the creator" paragraph.' },
      keyStatsNarrative: { type: 'string', description: 'A narrative framing of the stats for brands.' },
      whyBrands: { type: 'string', description: 'Why brands should partner with this creator.' },
      pricingNote: { type: 'string', description: 'A tasteful note on collaboration/pricing.' },
    },
    required: ['headline', 'about', 'keyStatsNarrative', 'whyBrands', 'pricingNote'],
  },
};

export async function composeMediaKit(input: MediaKitInput): Promise<MediaKitData> {
  const userMsg = [
    `CREATOR: ${input.niche.join(', ') || 'general'} creator${input.city ? ` based in ${input.city}` : ''}.`,
    `Content style: ${input.contentStyle ?? '—'}.`,
    `STATS (use only these — do not invent): ${input.followers ?? '—'} followers, ${input.engagementRate ?? '—'}% engagement rate.`,
    `Top content categories: ${input.topCategories.join(', ') || '—'}.`,
    input.rateHint ? `RATE CONTEXT: ${input.rateHint}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  return runToolCall<MediaKitData>({
    system: [cached(SYSTEM)],
    messages: [{ role: 'user', content: userMsg }],
    tool: TOOL,
    maxTokens: 1500,
    temperature: 0.7,
  });
}
