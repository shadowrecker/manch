import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeSupabase, makeChain } from '../../helpers/mocks';

// vi.mock factories are hoisted — declare all collaborator mocks before importing
// the module under test, then drive them with vi.mocked(...).

vi.mock('@/lib/db/queries', () => ({
  getProfile: vi.fn(),
  incrementUsage: vi.fn(),
}));
vi.mock('@/lib/modules/post/queries', () => ({ getActiveVoiceProfile: vi.fn() }));
vi.mock('@/lib/modules/post/ai/prompts/generate', () => ({ generateThreeAngles: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/analytics', () => ({
  captureServer: vi.fn(),
  EVENTS: { draftGenerated: 'draft_generated' },
}));
// MODEL is read from lib/ai/claude; stub it so we don't pull the Anthropic SDK.
vi.mock('@/lib/ai/claude', () => ({ MODEL: 'claude-test-model' }));

import {
  generatePostsForUser,
  NoVoiceProfileError,
} from '@/lib/modules/post/services/generate';
import { getProfile, incrementUsage } from '@/lib/db/queries';
import { getActiveVoiceProfile } from '@/lib/modules/post/queries';
import { generateThreeAngles } from '@/lib/modules/post/ai/prompts/generate';
import { createAdminClient } from '@/lib/supabase/admin';
import { captureServer } from '@/lib/analytics';
import { WATERMARK_TEXT } from '@/lib/modules/post/entitlements';

const mProfile = vi.mocked(getProfile);
const mVoice = vi.mocked(getActiveVoiceProfile);
const mIncr = vi.mocked(incrementUsage);
const mAngles = vi.mocked(generateThreeAngles);
const mAdmin = vi.mocked(createAdminClient);
const mCapture = vi.mocked(captureServer);

const VOICE = {
  style_guide: 'punchy',
  seniority: 'founder',
  industry: 'saas',
  topics: ['growth'],
  tone: 'direct',
};

const ANGLES = { story: 'Story body', insight: 'Insight body', opinion: 'Opinion body' };

/** Build an admin client whose drafts.insert captures the inserted rows. */
function adminWithCapture() {
  const draftsChain = makeChain({ data: null, error: null });
  const inserted: { rows?: unknown[] } = {};
  draftsChain.insert.mockImplementation((rows: unknown[]) => {
    inserted.rows = rows;
    return draftsChain;
  });
  const sb = makeSupabase({ tables: { drafts: draftsChain } });
  return { sb, draftsChain, inserted };
}

function baseParams(overrides: Record<string, unknown> = {}) {
  return {
    userId: 'user-1',
    inputText: 'We shipped the new dashboard today',
    source: 'web' as const,
    ...overrides,
  };
}

beforeEach(() => {
  mProfile.mockResolvedValue({ plan: 'free', hindi_output: false } as never);
  mVoice.mockResolvedValue(VOICE as never);
  mAngles.mockResolvedValue(ANGLES as never);
  mIncr.mockResolvedValue(1 as never);
  mCapture.mockResolvedValue(undefined as never);
  const { sb } = adminWithCapture();
  mAdmin.mockReturnValue(sb as never);
});

describe('generatePostsForUser — guards', () => {
  it('throws NoVoiceProfileError when there is no active voice profile', async () => {
    mVoice.mockResolvedValue(null as never);
    await expect(generatePostsForUser(baseParams())).rejects.toBeInstanceOf(
      NoVoiceProfileError,
    );
  });

  it('does not insert drafts or meter usage when the voice profile is missing', async () => {
    mVoice.mockResolvedValue(null as never);
    const { sb, draftsChain } = adminWithCapture();
    mAdmin.mockReturnValue(sb as never);
    await expect(generatePostsForUser(baseParams())).rejects.toThrow();
    expect(draftsChain.insert).not.toHaveBeenCalled();
    expect(mIncr).not.toHaveBeenCalled();
    expect(mCapture).not.toHaveBeenCalled();
  });

  it('propagates a draft insert error', async () => {
    const draftsChain = makeChain({ data: null, error: { message: 'insert failed' } });
    const sb = makeSupabase({ tables: { drafts: draftsChain } });
    mAdmin.mockReturnValue(sb as never);
    await expect(generatePostsForUser(baseParams())).rejects.toEqual({
      message: 'insert failed',
    });
    // Usage/analytics happen only after a successful insert.
    expect(mIncr).not.toHaveBeenCalled();
    expect(mCapture).not.toHaveBeenCalled();
  });
});

describe('generatePostsForUser — happy path', () => {
  it('returns 3 posts in story/insight/opinion order', async () => {
    const res = await generatePostsForUser(baseParams());
    expect(res.posts).toHaveLength(3);
    expect(res.posts.map((p) => p.angle)).toEqual(['story', 'insight', 'opinion']);
    expect(res.posts[0].body).toContain('Story body');
    expect(res.posts[1].body).toContain('Insight body');
    expect(res.posts[2].body).toContain('Opinion body');
  });

  it('returns the configured MODEL and a genRequestId', async () => {
    const res = await generatePostsForUser(baseParams());
    expect(res.model).toBe('claude-test-model');
    expect(typeof res.genRequestId).toBe('string');
    expect(res.genRequestId.length).toBeGreaterThan(0);
  });

  it('inserts exactly 3 drafts with the given source and a shared gen_request_id', async () => {
    const { sb, draftsChain, inserted } = adminWithCapture();
    mAdmin.mockReturnValue(sb as never);
    const res = await generatePostsForUser(baseParams({ source: 'whatsapp' }));

    expect(draftsChain.insert).toHaveBeenCalledTimes(1);
    const rows = inserted.rows as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.source).toBe('whatsapp');
      expect(row.user_id).toBe('user-1');
      expect(row.gen_request_id).toBe(res.genRequestId);
      expect(row.model).toBe('claude-test-model');
      expect(row.ai_labelled).toBe(true);
    }
    // A single shared gen_request_id across all three drafts.
    const ids = new Set(rows.map((r) => r.gen_request_id));
    expect(ids.size).toBe(1);
    // Angles persisted in order.
    expect(rows.map((r) => r.angle)).toEqual(['story', 'insight', 'opinion']);
  });

  it('passes transcriptionId through (and defaults to null when absent)', async () => {
    const { sb, inserted } = adminWithCapture();
    mAdmin.mockReturnValue(sb as never);
    await generatePostsForUser(baseParams({ transcriptionId: 'tr-9' }));
    let rows = inserted.rows as Array<Record<string, unknown>>;
    expect(rows.every((r) => r.transcription_id === 'tr-9')).toBe(true);

    const second = adminWithCapture();
    mAdmin.mockReturnValue(second.sb as never);
    await generatePostsForUser(baseParams());
    rows = second.inserted.rows as Array<Record<string, unknown>>;
    expect(rows.every((r) => r.transcription_id === null)).toBe(true);
  });

  it('meters usage by 1 and captures the draft_generated event', async () => {
    const res = await generatePostsForUser(baseParams({ source: 'web' }));
    expect(mIncr).toHaveBeenCalledWith('user-1', 'posts', 1);
    expect(mCapture).toHaveBeenCalledWith(
      'draft_generated',
      'user-1',
      expect.objectContaining({
        source: 'web',
        gen_request_id: res.genRequestId,
        lang: res.detectedLang,
      }),
    );
  });

  it('forwards the voice profile + hindiOutput into generateThreeAngles', async () => {
    mProfile.mockResolvedValue({ plan: 'pro', hindi_output: true } as never);
    await generatePostsForUser(baseParams({ inputText: 'week recap' }));
    expect(mAngles).toHaveBeenCalledWith(
      expect.objectContaining({
        styleGuide: 'punchy',
        seniority: 'founder',
        industry: 'saas',
        topics: ['growth'],
        tone: 'direct',
        hindiOutput: true,
        weekSummary: 'week recap',
      }),
    );
  });

  it('falls back to plan "free" and empty style guide when profile/voice fields are absent', async () => {
    mProfile.mockResolvedValue(null as never);
    mVoice.mockResolvedValue({
      style_guide: null,
      seniority: 'ic',
      industry: 'fintech',
      topics: [],
      tone: 'warm',
    } as never);
    const { sb, inserted } = adminWithCapture();
    mAdmin.mockReturnValue(sb as never);
    await generatePostsForUser(baseParams());
    expect(mAngles).toHaveBeenCalledWith(
      expect.objectContaining({ styleGuide: '', hindiOutput: false }),
    );
    // Null plan -> free -> watermarked drafts.
    const rows = inserted.rows as Array<Record<string, unknown>>;
    expect(rows.every((r) => r.watermarked === true)).toBe(true);
  });
});

describe('generatePostsForUser — watermark per plan', () => {
  it('appends the watermark and flags watermarked=true on FREE plan', async () => {
    mProfile.mockResolvedValue({ plan: 'free', hindi_output: false } as never);
    const { sb, inserted } = adminWithCapture();
    mAdmin.mockReturnValue(sb as never);
    const res = await generatePostsForUser(baseParams());

    for (const post of res.posts) {
      expect(post.body).toContain(WATERMARK_TEXT);
    }
    const rows = inserted.rows as Array<Record<string, unknown>>;
    expect(rows.every((r) => r.watermarked === true)).toBe(true);
    expect(rows.every((r) => String(r.body).includes(WATERMARK_TEXT))).toBe(true);
  });

  it('does NOT watermark on the pro plan', async () => {
    mProfile.mockResolvedValue({ plan: 'pro', hindi_output: false } as never);
    const { sb, inserted } = adminWithCapture();
    mAdmin.mockReturnValue(sb as never);
    const res = await generatePostsForUser(baseParams());

    for (const post of res.posts) {
      expect(post.body).not.toContain(WATERMARK_TEXT);
    }
    const rows = inserted.rows as Array<Record<string, unknown>>;
    expect(rows.every((r) => r.watermarked === false)).toBe(true);
  });

  it('does NOT watermark on the plus plan (solo tier)', async () => {
    mProfile.mockResolvedValue({ plan: 'plus', hindi_output: false } as never);
    const res = await generatePostsForUser(baseParams());
    for (const post of res.posts) {
      expect(post.body).not.toContain(WATERMARK_TEXT);
    }
  });
});

describe('generatePostsForUser — detectedLang', () => {
  it('uses the provided detectedLang verbatim', async () => {
    const res = await generatePostsForUser(baseParams({ detectedLang: 'hindi' }));
    expect(res.detectedLang).toBe('hindi');
    expect(mCapture).toHaveBeenCalledWith(
      'draft_generated',
      'user-1',
      expect.objectContaining({ lang: 'hindi' }),
    );
  });

  it('derives detectedLang from inputText when not provided', async () => {
    const res = await generatePostsForUser(
      baseParams({ inputText: 'aaj humara pricing badal gaya' }),
    );
    expect(res.detectedLang).toBe('hinglish');
  });

  it('derives english for plain English input when not provided', async () => {
    const res = await generatePostsForUser(
      baseParams({ inputText: 'We launched the product this morning' }),
    );
    expect(res.detectedLang).toBe('english');
  });
});
