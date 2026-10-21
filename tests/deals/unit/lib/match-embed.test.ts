import { describe, it, expect } from 'vitest';
import { creatorProfileText, brandText, pgvectorLiteral, embedText, EMBEDDING_DIMS } from '@/lib/modules/deals/match/embed';
import type { BrandRow, CreatorProfileRow, IgMetricsRow } from '@/lib/db/types';

const profile = {
  user_id: 'u1',
  niche: ['home cooking', 'recipes'],
  primary_language: 'Hindi',
  content_style: 'warm',
  city: 'Lucknow',
  follower_band: 'micro',
  embedding: null,
  updated_at: '2026-01-01',
} as CreatorProfileRow;

const metrics = {
  followers: 8500,
  top_categories: ['recipes', 'street food'],
} as unknown as IgMetricsRow;

describe('creatorProfileText', () => {
  it('builds a normalised, embeddable profile string', () => {
    const t = creatorProfileText(profile, metrics);
    expect(t).toContain('home cooking, recipes');
    expect(t).toContain('Lucknow');
    expect(t).toContain('micro');
    expect(t).toContain('recipes, street food');
  });

  it('degrades to sensible defaults when fields are missing', () => {
    const t = creatorProfileText(null, null);
    expect(t).toContain('general');
    expect(t).toContain('India');
  });
});

describe('brandText', () => {
  it('builds a normalised brand string from catalog fields', () => {
    const b = {
      name: 'Mamaearth',
      niche: ['beauty', 'skincare'],
      target_audience: 'young Indian women',
      tier_focus: 'value',
      typical_creator_size: 'micro/mid',
    } as Pick<BrandRow, 'name' | 'niche' | 'target_audience' | 'tier_focus' | 'typical_creator_size'>;
    const t = brandText(b);
    expect(t).toContain('Mamaearth');
    expect(t).toContain('beauty, skincare');
    expect(t).toContain('young Indian women');
    expect(t).toContain('value');
  });
});

describe('pgvectorLiteral', () => {
  it('formats a number array as a pgvector text literal', () => {
    expect(pgvectorLiteral([0.1, 0.2, -0.3])).toBe('[0.1,0.2,-0.3]');
  });
});

describe('embedText', () => {
  it('returns null without an OpenAI key (graceful degradation)', async () => {
    expect(await embedText('anything')).toBeNull();
  });
});

describe('EMBEDDING_DIMS', () => {
  it('matches the pgvector column dimension', () => {
    expect(EMBEDDING_DIMS).toBe(1536);
  });
});
