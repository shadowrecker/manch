import { describe, it, expect, vi, afterEach } from 'vitest';
import { hasEnv, requireEnv } from '@/lib/env';
import { TIERS, tierForPlan, CONTENT_PACK_PRICE_PAISE, CONTENT_PACK_CREDITS } from '@/lib/pricing';
import { reelsTier } from '@/lib/plans';
import { EVENTS } from '@/lib/events';
import { log, captureException } from '@/lib/observability';
import { WATERMARK_TEXT } from '@/lib/modules/reels/entitlements';

describe('env helpers', () => {
  it('requireEnv returns value or throws with the var name', () => {
    expect(requireEnv('x', 'FOO')).toBe('x');
    expect(() => requireEnv('', 'FOO')).toThrow(/FOO/);
  });
  it('hasEnv is true only when all present', () => {
    vi.stubEnv('A_TEST_VAR', 'y');
    expect(hasEnv('A_TEST_VAR')).toBe(true);
    expect(hasEnv('A_TEST_VAR', 'MISSING_VAR_X')).toBe(false);
    vi.unstubAllEnvs();
  });
});

describe('pricing (PRD §14, Manch plans)', () => {
  it('consumer ladder free/plus/pro/team maps onto the Reels tiers free/bharat/creator/agency', () => {
    const consumer = TIERS.filter((t) => !t.b2b).map((t) => t.plan);
    expect(consumer).toEqual(['free', 'plus', 'pro', 'team']);
    expect(consumer.map((p) => reelsTier(p))).toEqual(['free', 'bharat', 'creator', 'agency']);
    // The free tier advertises the Reels watermark text verbatim.
    expect(TIERS[0].feats.join(' ')).toContain(WATERMARK_TEXT);
  });
  it('content pack is ₹49 / 10 credits', () => {
    expect(CONTENT_PACK_PRICE_PAISE).toBe(4900);
    expect(CONTENT_PACK_CREDITS).toBe(10);
  });
  it('tierForPlan falls back to free', () => {
    expect(tierForPlan('team').name).toBe('Team');
    // @ts-expect-error runtime fallback
    expect(tierForPlan('nonsense').plan).toBe('free');
  });
});

describe('events taxonomy', () => {
  it('has the expected keys + unique snake_case values', () => {
    expect(EVENTS.pieceGenerated).toBe('bhasha_piece_generated');
    expect(EVENTS.contentPackPurchased).toBe('content_pack_purchased');
    const values = Object.values(EVENTS);
    expect(new Set(values).size).toBe(values.length);
    expect(values.every((v) => /^[a-z_]+$/.test(v))).toBe(true);
  });
});

describe('observability', () => {
  afterEach(() => vi.restoreAllMocks());
  it('log.* writes JSON with level + message', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    log.info('hi', { a: 1 });
    const line = spy.mock.calls[0][1] as string;
    expect(JSON.parse(line)).toMatchObject({ level: 'info', message: 'hi', a: 1 });
  });
  it('captureException includes a stack for Errors, stringifies non-Errors', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    captureException(new Error('boom'), { where: 'x' });
    expect(JSON.parse(spy.mock.calls[0][1] as string)).toMatchObject({ message: 'boom', where: 'x' });
    captureException('plain');
    expect(JSON.parse(spy.mock.calls[1][1] as string).message).toBe('plain');
  });
});
