import { describe, it, expect, vi, beforeEach } from 'vitest';
import { jsonRequest, readJson, fakeUser, makeChain, makeSupabase } from '../helpers/mocks';

// Route handler test — POST /api/post/schedule.
// Drives: getUser, getPlan, real canSchedule entitlement, RLS draft lookup via
// createClient, privileged writes via createAdminClient, enqueue (future), and
// publishPost (+ LinkedInNotConnectedError) for immediate publish.

vi.mock('@/lib/supabase/server', () => ({ getUser: vi.fn(), createClient: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/db/queries', () => ({ getPlan: vi.fn() }));
vi.mock('@/lib/queue', () => ({ enqueue: vi.fn() }));

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

import { POST } from '@/app/api/post/schedule/route';
import { getUser, createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPlan } from '@/lib/db/queries';
import { enqueue } from '@/lib/queue';
import { publishPost, LinkedInNotConnectedError } from '@/lib/modules/post/linkedin/post';
import { captureServer } from '@/lib/analytics';

const mUser = vi.mocked(getUser);
const mCreate = vi.mocked(createClient);
const mAdmin = vi.mocked(createAdminClient);
const mPlan = vi.mocked(getPlan);
const mEnqueue = vi.mocked(enqueue);
const mPublish = vi.mocked(publishPost);
const mCapture = vi.mocked(captureServer);

function req(body: unknown) {
  return jsonRequest('http://test/api/post/schedule', body) as never;
}

// Build a server (RLS) client whose drafts lookup returns `draft`.
function serverWith(draft: unknown, error: unknown = null) {
  const drafts = makeChain({ data: draft, error });
  return makeSupabase({ tables: { drafts } });
}

// Build an admin client where published_posts.ins(...).select().single() yields a row.
function adminWith(ppRow: unknown = { id: 'pp-1' }, ppError: unknown = null) {
  const published = makeChain({ data: ppRow, error: ppError });
  const drafts = makeChain();
  const client = makeSupabase({ tables: { published_posts: published, drafts } });
  return { client, published, drafts };
}

beforeEach(() => {
  mUser.mockResolvedValue(fakeUser() as never);
  mPlan.mockResolvedValue('plus');
  mCreate.mockReturnValue(serverWith({ id: 'd-1', body: 'hello', status: 'draft' }) as never);
  mPublish.mockResolvedValue({ externalId: 'urn:li:share:99' } as never);
  mEnqueue.mockResolvedValue({ messageId: 'm-1' } as never);
  const { client } = adminWith();
  mAdmin.mockReturnValue(client as never);
});

describe('POST /api/post/schedule', () => {
  it('401 when unauthenticated', async () => {
    mUser.mockResolvedValue(null as never);
    const { status, body } = await readJson(await POST(req({ draftId: 'd-1' })));
    expect(status).toBe(401);
    expect((body as { error: string }).error).toBe('unauthorized');
  });

  it('400 on invalid JSON', async () => {
    const bad = new Request('http://test/api/post/schedule', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not json',
    }) as never;
    const { status, body } = await readJson(await POST(bad));
    expect(status).toBe(400);
    expect((body as { error: string }).error).toBe('invalid_json');
  });

  it('400 when draftId is missing', async () => {
    const { status, body } = await readJson(await POST(req({})));
    expect(status).toBe(400);
    expect((body as { error: string }).error).toBe('draftId_required');
  });

  it('400 when scheduledFor is an unparseable date', async () => {
    const { status, body } = await readJson(
      await POST(req({ draftId: 'd-1', scheduledFor: 'not-a-date' })),
    );
    expect(status).toBe(400);
    expect((body as { error: string }).error).toBe('invalid_scheduledFor');
  });

  it('402 upgrade when a free plan tries to schedule a future post', async () => {
    mPlan.mockResolvedValue('free');
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const { status, body } = await readJson(
      await POST(req({ draftId: 'd-1', scheduledFor: future })),
    );
    expect(status).toBe(402);
    expect((body as { code: string }).code).toBe('upgrade');
    expect(mEnqueue).not.toHaveBeenCalled();
    expect(mPublish).not.toHaveBeenCalled();
  });

  it('404 when the draft is not found', async () => {
    mCreate.mockReturnValue(serverWith(null) as never);
    const { status, body } = await readJson(await POST(req({ draftId: 'missing' })));
    expect(status).toBe(404);
    expect((body as { error: string }).error).toBe('draft_not_found');
  });

  it('500 when the draft lookup errors', async () => {
    mCreate.mockReturnValue(serverWith(null, { message: 'rls' }) as never);
    const { status, body } = await readJson(await POST(req({ draftId: 'd-1' })));
    expect(status).toBe(500);
    expect((body as { error: string }).error).toBe('lookup_failed');
  });

  it('future schedule: inserts published_posts and enqueues a delayed publish job', async () => {
    const { client, published } = adminWith({ id: 'pp-9' });
    mAdmin.mockReturnValue(client as never);

    const future = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const { status, body } = await readJson(
      await POST(req({ draftId: 'd-1', scheduledFor: future })),
    );

    expect(status).toBe(200);
    expect((body as { ok: boolean; publishedPostId: string }).ok).toBe(true);
    expect((body as { publishedPostId: string }).publishedPostId).toBe('pp-9');

    // A scheduled row is recorded.
    expect(published.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        draft_id: 'd-1',
        user_id: 'user-1',
        platform: 'linkedin',
        status: 'scheduled',
        scheduled_for: future,
      }),
    );

    // A delayed job is enqueued targeting the publish worker.
    expect(mEnqueue).toHaveBeenCalledTimes(1);
    const [path, payload, opts] = mEnqueue.mock.calls[0];
    expect(path).toBe('/api/post/jobs/publish');
    expect(payload).toEqual({ publishedPostId: 'pp-9' });
    expect(opts).toEqual(
      expect.objectContaining({ deduplicationId: 'publish:pp-9' }),
    );
    expect((opts as { delaySeconds: number }).delaySeconds).toBeGreaterThan(0);

    // No immediate publish for a future schedule.
    expect(mPublish).not.toHaveBeenCalled();
  });

  it('future schedule: 500 + rolls back the row when enqueue throws', async () => {
    const { client, published } = adminWith({ id: 'pp-roll' });
    mAdmin.mockReturnValue(client as never);
    mEnqueue.mockRejectedValue(new Error('qstash down'));

    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const { status, body } = await readJson(
      await POST(req({ draftId: 'd-1', scheduledFor: future })),
    );
    expect(status).toBe(500);
    expect((body as { error: string }).error).toBe('enqueue_failed');
    // Orphan scheduled row is deleted.
    expect(published.delete).toHaveBeenCalled();
  });

  it('future schedule: 500 when the published_posts insert returns no row', async () => {
    const { client } = adminWith(null, { message: 'insert fail' });
    mAdmin.mockReturnValue(client as never);

    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const { status, body } = await readJson(
      await POST(req({ draftId: 'd-1', scheduledFor: future })),
    );
    expect(status).toBe(500);
    expect((body as { error: string }).error).toBe('schedule_failed');
    expect(mEnqueue).not.toHaveBeenCalled();
  });

  it('publish now: publishes immediately, marks published, and captures post_published', async () => {
    const { client, published } = adminWith({ id: 'pp-now' });
    mAdmin.mockReturnValue(client as never);

    const { status, body } = await readJson(await POST(req({ draftId: 'd-1' })));
    expect(status).toBe(200);
    expect((body as { ok: boolean; publishedPostId: string }).ok).toBe(true);
    expect((body as { publishedPostId: string }).publishedPostId).toBe('pp-now');

    expect(mPublish).toHaveBeenCalledWith('user-1', 'hello');
    // Row first inserted as scheduled, then updated to published with external id.
    expect(published.insert).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'scheduled', platform: 'linkedin' }),
    );
    expect(published.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'published', external_id: 'urn:li:share:99' }),
    );
    expect(mCapture).toHaveBeenCalledWith(
      'post_published',
      'user-1',
      expect.objectContaining({ platform: 'linkedin', plan: 'plus' }),
    );
    expect(mEnqueue).not.toHaveBeenCalled();
  });

  it('publish now is allowed even on the free plan (no future time)', async () => {
    mPlan.mockResolvedValue('free');
    const { client } = adminWith({ id: 'pp-free' });
    mAdmin.mockReturnValue(client as never);

    const { status } = await readJson(await POST(req({ draftId: 'd-1' })));
    expect(status).toBe(200);
    expect(mPublish).toHaveBeenCalled();
  });

  it('publish now: 409 linkedin_not_connected when publishPost raises it', async () => {
    const { client, published } = adminWith({ id: 'pp-x' });
    mAdmin.mockReturnValue(client as never);
    mPublish.mockRejectedValue(new LinkedInNotConnectedError('user-1'));

    const { status, body } = await readJson(await POST(req({ draftId: 'd-1' })));
    expect(status).toBe(409);
    expect((body as { code: string }).code).toBe('linkedin_not_connected');
    expect((body as { ok: boolean }).ok).toBe(false);
    // The attempt is recorded as failed.
    expect(published.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed' }),
    );
  });

  it('publish now: 500 publish_failed on an unexpected publish error', async () => {
    const { client } = adminWith({ id: 'pp-y' });
    mAdmin.mockReturnValue(client as never);
    mPublish.mockRejectedValue(new Error('linkedin 500'));

    const { status, body } = await readJson(await POST(req({ draftId: 'd-1' })));
    expect(status).toBe(500);
    expect((body as { error: string }).error).toBe('publish_failed');
  });

  it('publish now: 500 schedule_failed when the initial insert returns no row', async () => {
    const { client } = adminWith(null, { message: 'no row' });
    mAdmin.mockReturnValue(client as never);

    const { status, body } = await readJson(await POST(req({ draftId: 'd-1' })));
    expect(status).toBe(500);
    expect((body as { error: string }).error).toBe('schedule_failed');
    expect(mPublish).not.toHaveBeenCalled();
  });

  it('a past scheduledFor is treated as publish-now (not a future schedule)', async () => {
    const { client } = adminWith({ id: 'pp-past' });
    mAdmin.mockReturnValue(client as never);

    const past = new Date(Date.now() - 60 * 1000).toISOString();
    const { status } = await readJson(await POST(req({ draftId: 'd-1', scheduledFor: past })));
    expect(status).toBe(200);
    expect(mPublish).toHaveBeenCalled();
    expect(mEnqueue).not.toHaveBeenCalled();
  });
});
