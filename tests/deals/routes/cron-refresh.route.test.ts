import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readJson } from '../helpers/mocks';

// Stable mock fn (survives resetModules) so the re-imported route uses it.
const refreshFn = vi.fn();
vi.mock('@/lib/modules/deals/services/metrics-refresh', () => ({ refreshConnectedMetrics: refreshFn }));

async function loadRoute(secret: string) {
  vi.resetModules();
  vi.stubEnv('CRON_SECRET', secret);
  return import('@/app/api/deals/cron/refresh-metrics/route');
}

function reqWith(headers: Record<string, string>, method = 'POST') {
  return new Request('http://test/api/deals/cron/refresh-metrics', { method, headers });
}

beforeEach(() => {
  refreshFn.mockReset();
  refreshFn.mockResolvedValue({ total: 2, refreshed: 2, failed: 0 });
});
afterEach(() => vi.unstubAllEnvs());

describe('cron /api/deals/cron/refresh-metrics', () => {
  it('503 when CRON_SECRET is not configured', async () => {
    const { POST } = await loadRoute('');
    expect((await readJson(await POST(reqWith({ authorization: 'Bearer x' })))).status).toBe(503);
  });

  it('401 with a wrong secret', async () => {
    const { POST } = await loadRoute('s3cret');
    expect((await POST(reqWith({ authorization: 'Bearer nope' }))).status).toBe(401);
    expect(refreshFn).not.toHaveBeenCalled();
  });

  it('200 on POST with the correct Bearer secret', async () => {
    const { POST } = await loadRoute('s3cret');
    const { status, body } = await readJson(await POST(reqWith({ authorization: 'Bearer s3cret' })));
    expect(status).toBe(200);
    expect((body as { refreshed: number }).refreshed).toBe(2);
    expect(refreshFn).toHaveBeenCalled();
  });

  it('200 on GET (Vercel Cron) with the correct Bearer secret', async () => {
    const { GET } = await loadRoute('s3cret');
    expect((await GET(reqWith({ authorization: 'Bearer s3cret' }, 'GET'))).status).toBe(200);
  });

  it('accepts the x-cron-secret header too', async () => {
    const { POST } = await loadRoute('s3cret');
    expect((await POST(reqWith({ 'x-cron-secret': 's3cret' }))).status).toBe(200);
  });
});
