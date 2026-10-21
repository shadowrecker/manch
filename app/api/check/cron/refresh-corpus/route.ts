import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { ingestCorpus } from '@/lib/modules/check/corpus/ingest';
import { log, captureException } from '@/lib/observability';

export const runtime = 'nodejs';
export const maxDuration = 300;

// /api/check/cron/refresh-corpus — pull + re-embed the fact-check corpus every 6 hours.
// Vercel Cron sends a GET with `Authorization: Bearer <secret>`; POST also works.
async function handle(req: Request): Promise<Response> {
  const secret = env.corpusRefreshCronSecret || env.cronSecret;
  if (!secret) return NextResponse.json({ error: 'cron not configured' }, { status: 503 });

  const auth = req.headers.get('authorization');
  const headerSecret = req.headers.get('x-cron-secret');
  if (auth !== `Bearer ${secret}` && headerSecret !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const summary = await ingestCorpus();
    return NextResponse.json({ ok: true, ...summary });
  } catch (e) {
    captureException(e, { route: 'check/cron/refresh-corpus' });
    log.error('corpus refresh failed', { error: String(e) });
    return NextResponse.json({ error: 'refresh failed' }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
