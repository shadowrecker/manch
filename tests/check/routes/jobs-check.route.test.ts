import { describe, it, expect, vi, beforeEach } from 'vitest';
import { rawRequest, readJson } from '../helpers/mocks';

vi.mock('@/lib/modules/check/queries', () => ({ getBotUserByWaId: vi.fn(), getCheckUsage: vi.fn(), incrementCheckUsage: vi.fn(), planForBotUser: vi.fn() }));
vi.mock('@/lib/modules/check/pipeline/pipeline', () => ({ runTextCheck: vi.fn() }));
vi.mock('@/lib/modules/check/media/check', () => ({ runMediaCheck: vi.fn() }));
vi.mock('@/lib/modules/check/verdict/translate', () => ({ translateVerdict: vi.fn() }));
vi.mock('@/lib/modules/check/whatsapp/client', () => ({ sendText: vi.fn() }));
vi.mock('@/lib/analytics', () => ({ captureServer: vi.fn(), EVENTS: { checkCompleted: 'check_completed' } }));

import { POST } from '@/app/api/check/jobs/route';
import { getBotUserByWaId, getCheckUsage, incrementCheckUsage, planForBotUser } from '@/lib/modules/check/queries';
import { runTextCheck } from '@/lib/modules/check/pipeline/pipeline';
import { runMediaCheck } from '@/lib/modules/check/media/check';
import { sendText } from '@/lib/modules/check/whatsapp/client';

const mUser = vi.mocked(getBotUserByWaId);
const mUsage = vi.mocked(getCheckUsage);
const mRun = vi.mocked(runTextCheck);
const mMedia = vi.mocked(runMediaCheck);
const mSend = vi.mocked(sendText);
const mPlan = vi.mocked(planForBotUser);

const VERDICT = { trustScore: 2, label: 'false' as const, explanation: 'False.', claims: [], sources: [], language: 'hi' as const };
const job = (over: Record<string, unknown> = {}) => rawRequest('http://t/api/check/jobs', JSON.stringify({ waId: '9198', type: 'text', text: 'is the upi tax real?', ...over }));

beforeEach(() => {
  mUser.mockResolvedValue({ id: 'bu1', wa_id: '9198', language_pref: 'hi', plan: 'free', state: { onboarded: true } } as never);
  mUsage.mockResolvedValue(0);
  mRun.mockResolvedValue({ checkId: 'c1', verdict: VERDICT, fromCache: false });
  mMedia.mockResolvedValue({ checkId: 'c2', verdict: { ...VERDICT, label: 'manipulated' }, fromCache: false, analysis: null });
  mSend.mockResolvedValue(true);
  vi.mocked(incrementCheckUsage).mockResolvedValue(1);
  // Default: the bot user's own plan column (no linked Manch account).
  mPlan.mockImplementation(async (b) => (b.plan as never) ?? 'free');
});

describe('POST /api/check/jobs (worker)', () => {
  it('runs the text check and sends the formatted verdict', async () => {
    const { status } = await readJson(await POST(job() as never));
    expect(status).toBe(200);
    expect(mRun).toHaveBeenCalled();
    expect(mSend.mock.calls[0][1]).toContain('Trust score: 2/10');
    expect(incrementCheckUsage).toHaveBeenCalledWith('bu1');
  });

  it('sends the quota message when the free limit is used up (no check run)', async () => {
    mUsage.mockResolvedValue(10);
    await POST(job() as never);
    expect(mRun).not.toHaveBeenCalled();
    expect(mSend.mock.calls[0][1]).toMatch(/used your free checks/i);
  });

  it('gates media on the free plan with an upgrade message', async () => {
    await POST(job({ type: 'image', mediaId: 'x' }) as never);
    expect(mRun).not.toHaveBeenCalled();
    expect(mMedia).not.toHaveBeenCalled();
    expect(mSend.mock.calls[0][1]).toMatch(/Plus feature/i);
  });

  it('runs the media check on a paid plan and sends the verdict', async () => {
    mUser.mockResolvedValue({ id: 'bu1', wa_id: '9198', language_pref: 'hi', plan: 'plus', state: { onboarded: true } } as never);
    await POST(job({ type: 'video', mediaId: 'vid-1' }) as never);
    expect(mMedia).toHaveBeenCalledWith(expect.objectContaining({ mediaId: 'vid-1', mediaType: 'video' }));
    expect(mRun).not.toHaveBeenCalled();
  });

  it('uses the linked Manch account plan (planForBotUser) for entitlements', async () => {
    mUser.mockResolvedValue({ id: 'bu1', wa_id: '9198', user_id: 'u1', language_pref: 'ta', plan: 'free', state: { onboarded: true } } as never);
    mPlan.mockResolvedValue('pro');
    await POST(job({ type: 'image', mediaId: 'img-1' }) as never);
    expect(mPlan).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'u1' }));
    // pro → Check "personal" tier: media allowed, Tamil allowed.
    expect(mMedia).toHaveBeenCalledWith(expect.objectContaining({ mediaId: 'img-1', language: 'ta' }));
  });

  it('a free plan falls back to Hindi for a non-free-tier language', async () => {
    mUser.mockResolvedValue({ id: 'bu1', wa_id: '9198', language_pref: 'ta', plan: 'free', state: { onboarded: true } } as never);
    await POST(job() as never);
    expect(mRun).toHaveBeenCalledWith(expect.objectContaining({ language: 'hi' }), expect.anything());
  });

  it('200 (no-op) for an unknown bot user', async () => {
    mUser.mockResolvedValue(null);
    expect((await readJson(await POST(job() as never))).status).toBe(200);
    expect(mRun).not.toHaveBeenCalled();
  });
});
