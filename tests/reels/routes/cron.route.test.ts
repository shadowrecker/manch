import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readJson, makeSupabase, makeChain } from '../helpers/mocks';

const upsertChain = makeChain({ data: null, error: null });
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn(() => makeSupabase({ tables: { hashtag_sets: upsertChain } })) }));

// Env-dependent (CRON_SECRET) → reset + stub + dynamic import.
async function loadHashtags(secret?: string) {
  vi.resetModules();
  if (secret !== undefined) vi.stubEnv('CRON_SECRET', secret);
  return import('@/app/api/reels/cron/hashtags/route');
}
async function loadAudio(secret?: string, provider?: string) {
  vi.resetModules();
  if (secret !== undefined) vi.stubEnv('CRON_SECRET', secret);
  if (provider !== undefined) vi.stubEnv('TREND_DATA_PROVIDER_KEY', provider);
  return import('@/app/api/reels/cron/audio/route');
}

const call = (path: string, method: 'GET' | 'POST', auth?: string) =>
  new Request(`http://test${path}`, { method, headers: auth ? { authorization: auth } : {} });
const post = (auth?: string) => call('/api/reels/cron/hashtags', 'POST', auth);

beforeEach(() => upsertChain.upsert.mockClear());
afterEach(() => vi.unstubAllEnvs());

describe('POST /api/reels/cron/hashtags', () => {
  it('401 when CRON_SECRET is not configured', async () => {
    const { POST } = await loadHashtags('');
    expect((await readJson(await POST(post('Bearer anything')))).status).toBe(401);
  });
  it('401 with a wrong/absent bearer token', async () => {
    const { POST } = await loadHashtags('s3cret');
    expect((await readJson(await POST(post()))).status).toBe(401);
    expect((await readJson(await POST(post('Bearer nope')))).status).toBe(401);
  });
  it('200 ensures uncurated candidate rows when authorised', async () => {
    const { POST } = await loadHashtags('s3cret');
    const { status, body } = await readJson(await POST(post('Bearer s3cret')));
    expect(status).toBe(200);
    expect((body as { candidates: number }).candidates).toBe(32); // 8 langs × 4 platforms
    // ignoreDuplicates so curated rows are never clobbered.
    const opts = upsertChain.upsert.mock.calls[0][1] as { ignoreDuplicates?: boolean };
    expect(opts.ignoreDuplicates).toBe(true);
    const rows = upsertChain.upsert.mock.calls[0][0] as { curated: boolean }[];
    expect(rows.every((r) => r.curated === false)).toBe(true);
  });
});

// Vercel Cron (vercel.json) invokes crons with GET + Authorization: Bearer $CRON_SECRET.
describe('GET /api/reels/cron/hashtags (Vercel Cron)', () => {
  it('200 with a valid bearer token', async () => {
    const { GET } = await loadHashtags('s3cret');
    const { status, body } = await readJson(await GET(call('/api/reels/cron/hashtags', 'GET', 'Bearer s3cret')));
    expect(status).toBe(200);
    expect((body as { candidates: number }).candidates).toBe(32);
  });
  it('401 without (or with a wrong) bearer token', async () => {
    const { GET } = await loadHashtags('s3cret');
    expect((await readJson(await GET(call('/api/reels/cron/hashtags', 'GET')))).status).toBe(401);
    expect((await readJson(await GET(call('/api/reels/cron/hashtags', 'GET', 'Bearer nope')))).status).toBe(401);
    expect(upsertChain.upsert).not.toHaveBeenCalled();
  });
});

describe('POST /api/reels/cron/audio', () => {
  const apost = (auth?: string) => call('/api/reels/cron/audio', 'POST', auth);

  it('401 without a valid token', async () => {
    const { POST } = await loadAudio('s3cret');
    expect((await readJson(await POST(apost()))).status).toBe(401);
  });
  it('200 no-op when no provider is configured', async () => {
    const { POST } = await loadAudio('s3cret', '');
    const { status, body } = await readJson(await POST(apost('Bearer s3cret')));
    expect(status).toBe(200);
    expect((body as { fetched: number }).fetched).toBe(0);
  });
});

describe('GET /api/reels/cron/audio (Vercel Cron)', () => {
  it('200 with a valid bearer token', async () => {
    const { GET } = await loadAudio('s3cret', '');
    expect((await readJson(await GET(call('/api/reels/cron/audio', 'GET', 'Bearer s3cret')))).status).toBe(200);
  });
  it('401 without a bearer token', async () => {
    const { GET } = await loadAudio('s3cret');
    expect((await readJson(await GET(call('/api/reels/cron/audio', 'GET')))).status).toBe(401);
  });
});
