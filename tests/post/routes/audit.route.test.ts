import { describe, it, expect, vi, beforeEach } from 'vitest';
import { jsonRequest, readJson, fakeUser, makeSupabase, makeChain } from '../helpers/mocks';

// Route handler test — POST /api/post/audit.
// vi.mock factories are hoisted; declare them before importing the route.

vi.mock('@/lib/supabase/server', () => ({ getUser: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/ratelimit', () => ({ rateLimit: vi.fn() }));
vi.mock('@/lib/modules/post/ai/prompts/audit', () => ({ runAudit: vi.fn() }));
vi.mock('@/lib/analytics', () => ({
  captureServer: vi.fn(),
  EVENTS: { auditRun: 'audit_run' },
}));

import { POST } from '@/app/api/post/audit/route';
import { getUser } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { rateLimit } from '@/lib/ratelimit';
import { runAudit } from '@/lib/modules/post/ai/prompts/audit';
import { captureServer } from '@/lib/analytics';

const mUser = vi.mocked(getUser);
const mAdmin = vi.mocked(createAdminClient);
const mRL = vi.mocked(rateLimit);
const mRunAudit = vi.mocked(runAudit);
const mCapture = vi.mocked(captureServer);

const AUDIT_RESULT = {
  scores: { headline: 70, about: 40, experience: 80, frequency: 30, cta: 55 },
  overall: 55,
  fixes: [
    { dimension: 'Frequency', score: 30, action: 'Post more.' },
    { dimension: 'About', score: 40, action: 'Add a hook.' },
    { dimension: 'CTA', score: 55, action: 'Add a next step.' },
  ],
};

function req(body: unknown) {
  return jsonRequest('http://test/api/post/audit', body);
}

let auditsChain: ReturnType<typeof makeChain>;

beforeEach(() => {
  mUser.mockResolvedValue(fakeUser() as never);
  mRL.mockResolvedValue({ success: true, remaining: 9 });
  mRunAudit.mockResolvedValue(AUDIT_RESULT as never);
  auditsChain = makeChain({ data: { id: 'audit-123' }, error: null });
  mAdmin.mockReturnValue(makeSupabase({ tables: { audits: auditsChain } }) as never);
  mCapture.mockResolvedValue(undefined as never);
});

describe('POST /api/post/audit', () => {
  it('401 when unauthenticated', async () => {
    mUser.mockResolvedValue(null as never);
    const { status, body } = await readJson(await POST(req({ profileText: 'x' })));
    expect(status).toBe(401);
    expect((body as { error: string }).error).toBe('unauthorized');
    expect(mRunAudit).not.toHaveBeenCalled();
  });

  it('429 when rate limited', async () => {
    mRL.mockResolvedValue({ success: false, remaining: 0 });
    const { status, body } = await readJson(await POST(req({ profileText: 'x' })));
    expect(status).toBe(429);
    expect((body as { code: string }).code).toBe('rate_limited');
    expect(mRunAudit).not.toHaveBeenCalled();
  });

  it('rate limits per-user with the documented 10/min budget', async () => {
    await POST(req({ profileText: 'some profile text' }));
    expect(mRL).toHaveBeenCalledWith('audit:user-1', { limit: 10, windowSeconds: 60 });
  });

  it('400 invalid_json on a malformed body', async () => {
    const bad = new Request('http://test/api/post/audit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not json',
    });
    const { status, body } = await readJson(await POST(bad));
    expect(status).toBe(400);
    expect((body as { error: string }).error).toBe('invalid_json');
  });

  it('400 missing_profile_text when profileText is empty/whitespace', async () => {
    const { status, body } = await readJson(await POST(req({ profileText: '   ' })));
    expect(status).toBe(400);
    expect((body as { code: string }).code).toBe('missing_profile_text');
    expect(mRunAudit).not.toHaveBeenCalled();
  });

  it('400 missing_profile_text when profileText is absent', async () => {
    const { status, body } = await readJson(await POST(req({ linkedinUrl: 'https://x' })));
    expect(status).toBe(400);
    expect((body as { code: string }).code).toBe('missing_profile_text');
  });

  it('502 audit_failed when runAudit throws', async () => {
    mRunAudit.mockRejectedValue(new Error('claude down'));
    const { status, body } = await readJson(await POST(req({ profileText: 'real profile' })));
    expect(status).toBe(502);
    expect((body as { code: string }).code).toBe('audit_failed');
  });

  it('500 persist_failed when the insert errors', async () => {
    auditsChain = makeChain({ data: null, error: { message: 'db down' } });
    mAdmin.mockReturnValue(makeSupabase({ tables: { audits: auditsChain } }) as never);
    const { status, body } = await readJson(await POST(req({ profileText: 'real profile' })));
    expect(status).toBe(500);
    expect((body as { error: string }).error).toBe('persist_failed');
  });

  it('500 persist_failed when the insert returns no row', async () => {
    auditsChain = makeChain({ data: null, error: null });
    mAdmin.mockReturnValue(makeSupabase({ tables: { audits: auditsChain } }) as never);
    const { status, body } = await readJson(await POST(req({ profileText: 'real profile' })));
    expect(status).toBe(500);
    expect((body as { error: string }).error).toBe('persist_failed');
  });

  it('200 inserts an audits row with a share_id (admin) and returns the result shape', async () => {
    const { status, body } = await readJson(
      await POST(req({ linkedinUrl: '  https://linkedin.com/in/me  ', profileText: '  great profile  ' })),
    );
    expect(status).toBe(200);

    const b = body as {
      auditId: string;
      shareId: string;
      scores: unknown;
      overall: number;
      fixes: unknown;
    };
    expect(b.auditId).toBe('audit-123');
    expect(typeof b.shareId).toBe('string');
    expect(b.shareId.length).toBeGreaterThan(0);
    expect(b.scores).toEqual(AUDIT_RESULT.scores);
    expect(b.overall).toBe(55);
    expect(b.fixes).toEqual(AUDIT_RESULT.fixes);

    // runAudit was fed the trimmed pasted profile text.
    expect(mRunAudit).toHaveBeenCalledWith('great profile');

    // Privileged admin insert with the right columns, including share_id.
    expect(mAdmin).toHaveBeenCalled();
    expect(auditsChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-1',
        linkedin_url: 'https://linkedin.com/in/me',
        data_source: 'pasted',
        scores: AUDIT_RESULT.scores,
        overall: 55,
        fixes: AUDIT_RESULT.fixes,
        share_id: expect.any(String),
      }),
    );
    // The persisted share_id matches the returned one.
    const inserted = auditsChain.insert.mock.calls[0][0] as { share_id: string };
    expect(inserted.share_id).toBe(b.shareId);
    expect(auditsChain.select).toHaveBeenCalledWith('id');
  });

  it('captures the audit_run analytics event with the overall score', async () => {
    await POST(req({ profileText: 'great profile' }));
    expect(mCapture).toHaveBeenCalledWith(
      'audit_run',
      'user-1',
      expect.objectContaining({ overall: 55, data_source: 'pasted' }),
    );
  });

  it('still returns 200 when analytics capture throws (non-fatal)', async () => {
    mCapture.mockRejectedValue(new Error('posthog down'));
    const { status, body } = await readJson(await POST(req({ profileText: 'great profile' })));
    expect(status).toBe(200);
    expect((body as { auditId: string }).auditId).toBe('audit-123');
  });
});
