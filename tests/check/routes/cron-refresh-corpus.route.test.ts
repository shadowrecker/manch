import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readJson } from '../helpers/mocks';

const ingestFn = vi.fn();
vi.mock('@/lib/modules/check/corpus/ingest', () => ({ ingestCorpus: ingestFn }));

async function loadRoute(secret: string) {
  vi.resetModules();
  vi.stubEnv('CORPUS_REFRESH_CRON_SECRET', secret);
  return import('@/app/api/check/cron/refresh-corpus/route');
}

function reqWith(headers: Record<string, string>, method = 'POST') {
  return new Request('http://test/api/check/cron/refresh-corpus', { method, headers });
}

beforeEach(() => {
  ingestFn.mockReset();
  ingestFn.mockResolvedValue({ sources: 3, chunks: 40, embedded: 40, corpusVersion: 5 });
});
afterEach(() => vi.unstubAllEnvs());

describe('cron /api/check/cron/refresh-corpus', () => {
  it('503 when no cron secret is configured', async () => {
    const { POST } = await loadRoute('');
    expect((await readJson(await POST(reqWith({ authorization: 'Bearer x' })))).status).toBe(503);
  });

  it('401 with a wrong secret', async () => {
    const { POST } = await loadRoute('s3cret');
    expect((await POST(reqWith({ authorization: 'Bearer nope' }))).status).toBe(401);
    expect(ingestFn).not.toHaveBeenCalled();
  });

  it('200 on POST with the correct Bearer secret', async () => {
    const { POST } = await loadRoute('s3cret');
    const { status, body } = await readJson(await POST(reqWith({ authorization: 'Bearer s3cret' })));
    expect(status).toBe(200);
    expect((body as { chunks: number }).chunks).toBe(40);
    expect(ingestFn).toHaveBeenCalled();
  });

  it('200 on GET (Vercel Cron)', async () => {
    const { GET } = await loadRoute('s3cret');
    expect((await GET(reqWith({ authorization: 'Bearer s3cret' }, 'GET'))).status).toBe(200);
  });
});
