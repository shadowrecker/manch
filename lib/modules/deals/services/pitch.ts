import { createAdminClient } from '@/lib/supabase/admin';
import { incrementUsage } from '@/lib/db/queries';
import { getBrandById, getCreatorProfile, getLatestMetrics } from '@/lib/modules/deals/queries';
import { getRateCard } from '@/lib/modules/deals/services/rates';
import { composePitch } from '@/lib/modules/deals/ai/prompts/pitch';
import { captureServer, EVENTS } from '@/lib/analytics';
import { log } from '@/lib/observability';
import type { Deliverable } from '@/lib/modules/deals/types';
import type { Json } from '@/lib/db/types';

export class NoBrandError extends Error {
  constructor() {
    super('Brand not found');
    this.name = 'NoBrandError';
  }
}

export class NoProfileError extends Error {
  constructor() {
    super('No creator profile — connect Instagram or enter stats first');
    this.name = 'NoProfileError';
  }
}

const VALID_DELIVERABLES: Deliverable[] = ['reel', 'story', 'post', 'bundle'];

export interface PitchResult {
  pitchId: string;
  subject: string;
  body: string;
  proposedRatePaise: number | null;
  deliverables: Deliverable[];
}

export function normalizeDeliverables(input: unknown): Deliverable[] {
  if (!Array.isArray(input)) return ['reel'];
  const out = input.filter((d): d is Deliverable => VALID_DELIVERABLES.includes(d as Deliverable));
  return out.length ? Array.from(new Set(out)) : ['reel'];
}

/** Compose + persist a pitch for a brand, using the creator's stats and rate card. */
export async function generatePitchForBrand(
  userId: string,
  brandId: string,
  deliverables: Deliverable[] = ['reel'],
): Promise<PitchResult> {
  const [brand, profile, metrics] = await Promise.all([
    getBrandById(brandId),
    getCreatorProfile(userId),
    getLatestMetrics(userId),
  ]);
  if (!brand) throw new NoBrandError();
  if (!profile && !metrics) throw new NoProfileError();

  const card = await getRateCard(userId);
  const proposedRatePaise = card?.suggestedRatePaise ?? null;

  const draft = await composePitch({
    creator: {
      niche: profile?.niche ?? [],
      followers: metrics?.followers ?? null,
      engagementRate: metrics?.engagement_rate ?? null,
      city: profile?.city ?? null,
      contentStyle: profile?.content_style ?? null,
    },
    brandName: brand.name,
    brandNiche: brand.niche ?? [],
    brandAudience: brand.target_audience,
    deliverables,
    suggestedRatePaise: proposedRatePaise,
  });

  const pitchId = crypto.randomUUID();
  const sb = createAdminClient();
  const { error } = await sb.from('pitches').insert({
    id: pitchId,
    user_id: userId,
    brand_id: brandId,
    subject: draft.subject,
    body: draft.body,
    proposed_rate_paise: proposedRatePaise,
    deliverables: deliverables as unknown as Json,
    status: 'pitched',
    ai_labelled: true,
  });
  if (error) throw error;

  try {
    await incrementUsage(userId, 'pitches', 1);
  } catch (e) {
    log.warn('pitch metering failed (pitch created)', { pitchId, error: String(e) });
  }
  await captureServer(EVENTS.pitchSent, userId, { brand_id: brandId });

  return { pitchId, subject: draft.subject, body: draft.body, proposedRatePaise, deliverables };
}
