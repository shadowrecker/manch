import { describe, it, expect, vi, beforeEach } from 'vitest';
import { rawRequest, readJson, makeSupabase, makeChain } from '../helpers/mocks';

// Route handler test — QStash worker POST /api/post/jobs/publish (LinkedIn publish).
// Define LinkedInNotConnectedError INSIDE the @/lib/linkedin/post factory so
// `instanceof` works across the mock, then import it back for the error path.

vi.mock('@/lib/queue', () => ({ verifyQstashSignature: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/db/queries', () => ({ getPlan: vi.fn() }));
vi.mock('@/lib/modules/post/linkedin/post', () => {
  class LinkedInNotConnectedError extends Error {
    constructor(userId: string) {
      super(`No LinkedIn token for user ${userId}`);
      this.name = 'LinkedInNotConnectedError';
    }
  }
  return { publishPost: vi.fn(), LinkedInNotConnectedError };
});
vi.mock('@/lib/analytics', () => ({
  captureServer: vi.fn(),
  EVENTS: { postPublished: 'post_published' },
}));
vi.mock('@/lib/observability', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  captureException: vi.fn(),
}));

import { POST } from '@/app/api/post/jobs/publish/route';
import { verifyQstashSignature } from '@/lib/queue';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPlan } from '@/lib/db/queries';
import { publishPost, LinkedInNotConnectedError } from '@/lib/modules/post/linkedin/post';
import { captureServer } from '@/lib/analytics';

const mVerify = vi.mocked(verifyQstashSignature);
const mAdmin = vi.mocked(createAdminClient);
const mPlan = vi.mocked(getPlan);
const mPublish = vi.mocked(publishPost);
const mCapture = vi.mocked(captureServer);

function signed(bodyObj: unknown) {
  return rawRequest('http://test/api/post/jobs/publish', JSON.stringify(bodyObj), {
    'upstash-signature': 'sig-ok',
  });
}

const PP_ROW = { id: 'pp-1', user_id: 'user-1', draft_id: 'draft-1', status: 'scheduled' };
const DRAFT_ROW = { id: 'draft-1', body: 'Hello LinkedIn' };

/**
 * Build an admin client with separate per-table chains so we can assert on the
 * published_posts.update / drafts.update arguments independently.
 */
function admin(opts: {
  pp?: { data?: unknown; error?: unknown };
  draft?: { data?: unknown; error?: unknown };
} = {}) {
  const ppChain = makeChain(opts.pp ?? { data: PP_ROW, error: null });
  const draftChain = makeChain(opts.draft ?? { data: DRAFT_ROW, error: null });
  const sb = makeSupabase({ tables: { published_posts: ppChain, drafts: draftChain } });
  mAdmin.mockReturnValue(sb as never);
  return { sb, ppChain, draftChain };
}

beforeEach(() => {
  mVerify.mockResolvedValue(true);
  mPlan.mockResolvedValue('plus');
  mPublish.mockResolvedValue({ externalId: 'urn:li:share:123' } as never);
  mCapture.mockResolvedValue(undefined as never);
  admin();
});

describe('POST /api/post/jobs/publish — auth & guards', () => {
  it('401 when the QStash signature is invalid and does no work', async () => {
    mVerify.mockResolvedValue(false);
    const { status, body } = await readJson(await POST(signed({ publishedPostId: 'pp-1' })));
    expect(status).toBe(401);
    expect((body as { error: string }).error).toBe('unauthorized');
    expect(mAdmin).not.toHaveBeenCalled();
    expect(mPublish).not.toHaveBeenCalled();
  });

  it('verifies the signature against the header and raw body', async () => {
    const raw = JSON.stringify({ publishedPostId: 'pp-1' });
    await POST(rawRequest('http://test/api/post/jobs/publish', raw, { 'upstash-signature': 'sig-ok' }));
    expect(mVerify).toHaveBeenCalledWith('sig-ok', raw);
  });

  it('acks 200 on a malformed (but signed) body without publishing', async () => {
    const { status, body } = await readJson(
      await POST(rawRequest('http://test/api/post/jobs/publish', '{bad', { 'upstash-signature': 'sig-ok' })),
    );
    expect(status).toBe(200);
    expect((body as { ok: boolean }).ok).toBe(true);
    expect(mPublish).not.toHaveBeenCalled();
  });

  it('acks 200 when publishedPostId is missing', async () => {
    const { status, body } = await readJson(await POST(signed({})));
    expect(status).toBe(200);
    expect((body as { ok: boolean }).ok).toBe(true);
    expect(mAdmin).not.toHaveBeenCalled();
  });
});

describe('POST /api/post/jobs/publish — row resolution', () => {
  it('500 lookup_failed when the published_posts read errors', async () => {
    admin({ pp: { data: null, error: { message: 'db down' } } });
    const { status, body } = await readJson(await POST(signed({ publishedPostId: 'pp-1' })));
    expect(status).toBe(500);
    expect((body as { error: string }).error).toBe('lookup_failed');
    expect(mPublish).not.toHaveBeenCalled();
  });

  it('acks 200 when the published_post row is not found (deleted)', async () => {
    admin({ pp: { data: null, error: null } });
    const { status, body } = await readJson(await POST(signed({ publishedPostId: 'pp-1' })));
    expect(status).toBe(200);
    expect((body as { ok: boolean }).ok).toBe(true);
    expect(mPublish).not.toHaveBeenCalled();
  });

  it('idempotent: acks 200 and does not re-post when already published', async () => {
    admin({ pp: { data: { ...PP_ROW, status: 'published' }, error: null } });
    const { status } = await readJson(await POST(signed({ publishedPostId: 'pp-1' })));
    expect(status).toBe(200);
    expect(mPublish).not.toHaveBeenCalled();
  });

  it('500 lookup_failed when the draft read errors', async () => {
    admin({ draft: { data: null, error: { message: 'draft read failed' } } });
    const { status, body } = await readJson(await POST(signed({ publishedPostId: 'pp-1' })));
    expect(status).toBe(500);
    expect((body as { error: string }).error).toBe('lookup_failed');
    expect(mPublish).not.toHaveBeenCalled();
  });

  it('marks published_post failed (draft_not_found) and acks 200 when the draft is missing', async () => {
    const { ppChain } = admin({ draft: { data: null, error: null } });
    const { status } = await readJson(await POST(signed({ publishedPostId: 'pp-1' })));
    expect(status).toBe(200);
    expect(ppChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed', error: 'draft_not_found' }),
    );
    expect(mPublish).not.toHaveBeenCalled();
  });
});

describe('POST /api/post/jobs/publish — success', () => {
  it('publishes the draft, marks published_posts + draft published, captures analytics', async () => {
    const { ppChain, draftChain } = admin();
    const { status, body } = await readJson(await POST(signed({ publishedPostId: 'pp-1' })));

    expect(status).toBe(200);
    expect((body as { ok: boolean }).ok).toBe(true);

    expect(mPublish).toHaveBeenCalledWith('user-1', 'Hello LinkedIn');
    expect(ppChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'published', external_id: 'urn:li:share:123' }),
    );
    expect(ppChain.update.mock.calls[0][0]).toHaveProperty('published_at');
    expect(draftChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'published' }),
    );
    expect(mCapture).toHaveBeenCalledWith(
      'post_published',
      'user-1',
      expect.objectContaining({ platform: 'linkedin', plan: 'plus' }),
    );
  });

  it('stores external_id as null when publishPost returns an empty externalId', async () => {
    mPublish.mockResolvedValue({ externalId: '' } as never);
    const { ppChain } = admin();
    await POST(signed({ publishedPostId: 'pp-1' }));
    expect(ppChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'published', external_id: null }),
    );
  });
});

describe('POST /api/post/jobs/publish — failures', () => {
  it('LinkedInNotConnectedError: marks failed and acks 200 (permanent, no retry)', async () => {
    mPublish.mockRejectedValue(new LinkedInNotConnectedError('user-1'));
    const { ppChain } = admin();
    const { status, body } = await readJson(await POST(signed({ publishedPostId: 'pp-1' })));

    expect(status).toBe(200);
    expect((body as { ok: boolean }).ok).toBe(true);
    expect(ppChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed' }),
    );
    expect(mCapture).not.toHaveBeenCalled();
  });

  it('transient failure (5xx): marks failed and returns 500 so QStash retries', async () => {
    mPublish.mockRejectedValue(new Error('LinkedIn ugcPosts failed (503): unavailable'));
    const { ppChain } = admin();
    const { status, body } = await readJson(await POST(signed({ publishedPostId: 'pp-1' })));

    expect(status).toBe(500);
    expect((body as { error: string }).error).toBe('transient');
    expect(ppChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed', error: expect.stringContaining('503') }),
    );
  });

  it('transient failure (network/timeout): returns 500', async () => {
    mPublish.mockRejectedValue(new Error('fetch failed'));
    const { status } = await readJson(await POST(signed({ publishedPostId: 'pp-1' })));
    expect(status).toBe(500);
  });

  it('permanent failure (e.g. 4xx): marks failed and acks 200 to stop retries', async () => {
    mPublish.mockRejectedValue(new Error('LinkedIn ugcPosts failed (422): invalid'));
    const { ppChain } = admin();
    const { status, body } = await readJson(await POST(signed({ publishedPostId: 'pp-1' })));

    expect(status).toBe(200);
    expect((body as { ok: boolean }).ok).toBe(true);
    expect(ppChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed', error: expect.stringContaining('422') }),
    );
  });
});
