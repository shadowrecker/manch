import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readJson } from '../helpers/mocks';

vi.mock('@/lib/modules/check/api/auth', () => ({ extractApiKey: vi.fn(), verifyApiKey: vi.fn() }));
vi.mock('@/lib/modules/check/api/quota', () => ({ apiQuota: vi.fn() }));
vi.mock('@/lib/modules/check/pipeline/pipeline', () => ({ runTextCheck: vi.fn() }));
vi.mock('@/lib/modules/check/verdict/translate', () => ({ translateVerdict: vi.fn() }));
vi.mock('@/lib/ratelimit', () => ({ rateLimit: vi.fn() }));
vi.mock('@/lib/analytics', () => ({ captureServer: vi.fn(), EVENTS: { apiCall: 'api_call' } }));

import { POST } from '@/app/api/check/route';
import { extractApiKey, verifyApiKey } from '@/lib/modules/check/api/auth';
import { apiQuota } from '@/lib/modules/check/api/quota';
import { runTextCheck } from '@/lib/modules/check/pipeline/pipeline';
import { rateLimit } from '@/lib/ratelimit';

const mExtract = vi.mocked(extractApiKey);
const mVerify = vi.mocked(verifyApiKey);
const mQuota = vi.mocked(apiQuota);
const mRun = vi.mocked(runTextCheck);

const VERDICT = { trustScore: 2, label: 'false' as const, explanation: 'False.', claims: [{ text: 'c', verdict: 'refuted' as const, confidence: 0.8, sources: [] }], sources: [{ title: 'PIB', url: 'https://pib.gov.in/x' }], language: 'en' as const };
const req = (body: unknown) => new Request('http://t/api/check', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

beforeEach(() => {
  mExtract.mockReturnValue('tck_raw');
  mVerify.mockResolvedValue({ id: 'k1', org_name: 'Herald', plan: 'newsroom', monthly_quota: 10000, active: true } as never);
  mQuota.mockResolvedValue({ used: 1, limit: 10000, exceeded: false });
  vi.mocked(rateLimit).mockResolvedValue({ success: true, remaining: 59 });
  mRun.mockResolvedValue({ checkId: 'c1', verdict: VERDICT, fromCache: false });
});

describe('POST /api/check (Newsroom API-lite)', () => {
  it('401 without a valid key', async () => {
    mVerify.mockResolvedValue(null);
    expect((await readJson(await POST(req({ type: 'text', content: 'x' })))).status).toBe(401);
  });

  it('403 when the key has no API access', async () => {
    mVerify.mockResolvedValue({ id: 'k1', org_name: 'x', plan: 'plus', monthly_quota: 0, active: true } as never);
    expect((await readJson(await POST(req({ type: 'text', content: 'x' })))).status).toBe(403);
  });

  it('400 when content is missing', async () => {
    expect((await readJson(await POST(req({ type: 'text' })))).status).toBe(400);
  });

  it('429 when the monthly quota is exceeded', async () => {
    mQuota.mockResolvedValue({ used: 10000, limit: 10000, exceeded: true });
    expect((await readJson(await POST(req({ type: 'text', content: 'is the upi tax real' })))).status).toBe(429);
  });

  it('200 returns the structured JSON contract', async () => {
    const { status, body } = await readJson(await POST(req({ type: 'text', content: 'is the upi tax real', language: 'en' })));
    expect(status).toBe(200);
    const b = body as { trust_score: number; verdict: string; claims: unknown[]; source_links: unknown[]; check_timestamp: string };
    expect(b.trust_score).toBe(2);
    expect(b.verdict).toBe('false');
    expect(b.claims).toHaveLength(1);
    expect(b.source_links).toHaveLength(1);
    expect(b.check_timestamp).toBeTruthy();
  });
});
