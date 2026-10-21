import { describe, it, expect, vi, beforeEach } from 'vitest';

// Tests for the LinkedIn profile audit grader (lib/ai/prompts/audit.ts).
//
// We mock OUR claude wrapper: runToolCall returns the raw grade_profile output,
// and the source normalises it (clamp scores, recompute overall, derive the 3
// lowest fixes). `cached` is a faithful passthrough so the system block shape is
// preserved.

vi.mock('@/lib/ai/claude', () => ({
  runToolCall: vi.fn(),
  cached: (text: string) => ({ type: 'text', text, cache_control: { type: 'ephemeral' } }),
}));

import { runAudit } from '@/lib/modules/post/ai/prompts/audit';
import { runToolCall } from '@/lib/ai/claude';

const mRun = vi.mocked(runToolCall);

const fullScores = { headline: 80, about: 60, experience: 40, frequency: 30, cta: 20 };

function lastCallArgs() {
  expect(mRun).toHaveBeenCalled();
  return mRun.mock.calls[0][0] as {
    system: Array<{ type: string; text: string; cache_control?: { type: string } }>;
    messages: Array<{ role: string; content: string }>;
    tool: { name: string };
    maxTokens?: number;
    temperature?: number;
  };
}

beforeEach(() => {
  mRun.mockResolvedValue({
    scores: { ...fullScores },
    overall: 46,
    fixes: [
      { dimension: 'cta', score: 20, action: 'Add a clear DM CTA.' },
      { dimension: 'frequency', score: 30, action: 'Post 2-3x a week.' },
      { dimension: 'experience', score: 40, action: 'Lead with measurable impact.' },
    ],
  } as never);
});

describe('runAudit', () => {
  it('returns an AuditResult shape: scores + overall + fixes', async () => {
    const res = await runAudit('some profile text');
    expect(res).toHaveProperty('scores');
    expect(res).toHaveProperty('overall');
    expect(res).toHaveProperty('fixes');
    expect(res.scores).toEqual(fullScores);
    expect(Array.isArray(res.fixes)).toBe(true);
  });

  it('uses the grade_profile tool with a cached rubric system block', async () => {
    await runAudit('hi');
    const args = lastCallArgs();
    expect(args.tool.name).toBe('grade_profile');
    expect(Array.isArray(args.system)).toBe(true);
    expect(args.system[0].cache_control).toEqual({ type: 'ephemeral' });
    expect(args.system[0].text).toMatch(/profile auditor/i);
  });

  it('wraps the pasted profile text inside the untrusted profile markers', async () => {
    await runAudit('Headline: I build payments rails');
    const userMsg = lastCallArgs().messages[0].content;
    expect(lastCallArgs().messages[0].role).toBe('user');
    expect(userMsg).toContain('--- PROFILE TEXT START ---');
    expect(userMsg).toContain('--- PROFILE TEXT END ---');
    expect(userMsg).toContain('Headline: I build payments rails');
  });

  it('trims the profile text before sending it to the model', async () => {
    await runAudit('   spaced profile   ');
    const userMsg = lastCallArgs().messages[0].content;
    expect(userMsg).toContain('--- PROFILE TEXT START ---\nspaced profile\n--- PROFILE TEXT END ---');
  });

  it('requests low-temperature deterministic grading', async () => {
    await runAudit('hi');
    expect(lastCallArgs().temperature).toBe(0.3);
    expect(lastCallArgs().maxTokens).toBe(1024);
  });

  it('keeps the model overall when it is a finite number', async () => {
    const res = await runAudit('text');
    expect(res.overall).toBe(46);
  });

  it('computes overall as the rounded mean when the model omits it', async () => {
    mRun.mockResolvedValue({ scores: { ...fullScores }, fixes: [] } as never);
    const res = await runAudit('text');
    // mean of 80,60,40,30,20 = 230/5 = 46
    expect(res.overall).toBe(46);
  });

  it('computes overall from clamped scores and rounds the mean', async () => {
    mRun.mockResolvedValue({
      scores: { headline: 70, about: 70, experience: 70, frequency: 70, cta: 73 },
      // model omitted overall on purpose
      fixes: [],
    } as never);
    const res = await runAudit('text');
    // (70+70+70+70+73)/5 = 353/5 = 70.6 -> 71
    expect(res.overall).toBe(71);
  });

  it('recomputes overall when the model returns a non-finite/garbled value', async () => {
    mRun.mockResolvedValue({
      scores: { ...fullScores },
      overall: Number.NaN,
      fixes: [],
    } as never);
    const res = await runAudit('text');
    expect(res.overall).toBe(46);
  });

  it('clamps and rounds out-of-range / fractional dimension scores to 0-100 ints', async () => {
    mRun.mockResolvedValue({
      scores: { headline: 150, about: -10, experience: 61.6, frequency: 0, cta: 100 },
      fixes: [],
    } as never);
    const res = await runAudit('text');
    expect(res.scores).toEqual({
      headline: 100,
      about: 0,
      experience: 62,
      frequency: 0,
      cta: 100,
    });
  });

  it('coerces missing/non-numeric scores to 0', async () => {
    mRun.mockResolvedValue({
      scores: { headline: 'abc', about: undefined, experience: null, frequency: 50, cta: 50 },
      fixes: [],
    } as never);
    const res = await runAudit('text');
    expect(res.scores.headline).toBe(0);
    expect(res.scores.about).toBe(0);
    expect(res.scores.experience).toBe(0);
    expect(res.scores.frequency).toBe(50);
  });

  it('derives exactly the three lowest dimensions, lowest first, using human labels', async () => {
    const res = await runAudit('text');
    // lowest three of 80,60,40,30,20 -> cta(20), frequency(30), experience(40)
    expect(res.fixes).toHaveLength(3);
    expect(res.fixes.map((f) => f.score)).toEqual([20, 30, 40]);
    expect(res.fixes.map((f) => f.dimension)).toEqual([
      'CTA clarity',
      'Posting frequency',
      'Experience framing',
    ]);
  });

  it('reuses the model action for a dimension when available', async () => {
    const res = await runAudit('text');
    expect(res.fixes[0].action).toBe('Add a clear DM CTA.');
    expect(res.fixes[1].action).toBe('Post 2-3x a week.');
  });

  it('synthesises a fallback action when the model omits fixes', async () => {
    mRun.mockResolvedValue({ scores: { ...fullScores } } as never);
    const res = await runAudit('text');
    expect(res.fixes).toHaveLength(3);
    expect(res.fixes[0].dimension).toBe('CTA clarity');
    expect(res.fixes[0].action.length).toBeGreaterThan(0);
  });

  it('returns a valid AuditResult for very short profile text', async () => {
    mRun.mockResolvedValue({
      scores: { headline: 10, about: 5, experience: 0, frequency: 0, cta: 0 },
      fixes: [],
    } as never);
    const res = await runAudit('CEO');
    expect(res.overall).toBe(3); // (10+5+0+0+0)/5 = 3
    expect(res.fixes).toHaveLength(3);
    expect(Object.keys(res.scores)).toEqual([
      'headline',
      'about',
      'experience',
      'frequency',
      'cta',
    ]);
  });
});
