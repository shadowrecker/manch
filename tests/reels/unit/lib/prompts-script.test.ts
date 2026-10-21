import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the Claude wrapper so we can inspect the prompt the builder constructs.
vi.mock('@/lib/ai/claude', () => ({
  cached: (text: string) => ({ type: 'text', text, cache_control: { type: 'ephemeral' } }),
  runToolCall: vi.fn(),
}));

import { generateThreeStyleScript } from '@/lib/modules/reels/ai/prompts/script';
import { runToolCall } from '@/lib/ai/claude';

const mRun = vi.mocked(runToolCall);

beforeEach(() => {
  mRun.mockResolvedValue({
    educational: { hook: 'h', body: 'b', cta: 'c' },
    entertainment: { hook: 'h', body: 'b', cta: 'c' },
    emotional: { hook: 'h', body: 'b', cta: 'c' },
  } as never);
});

describe('generateThreeStyleScript prompt construction', () => {
  it('builds a 2-block cached system with a language-specific, native-script-only instruction', async () => {
    await generateThreeStyleScript({ languageCode: 'ta', platform: 'instagram', ideaText: 'how I edit fast' });
    const params = mRun.mock.calls[0][0] as {
      system: { text: string }[];
      tool: { name: string; input_schema: { properties: Record<string, unknown> } };
      messages: { content: string }[];
    };
    expect(params.system).toHaveLength(2);
    // Static format rules first, language block second.
    expect(params.system[0].text).toMatch(/hook/i);
    expect(params.system[1].text).toMatch(/Tamil/);
    expect(params.system[1].text).toMatch(/Tamil script/);
    expect(params.system[1].text).toMatch(/never romanised/i);
  });

  it('forces the emit_script tool with exactly the three styles', async () => {
    await generateThreeStyleScript({ languageCode: 'hi', platform: 'moj', ideaText: 'idea' });
    const params = mRun.mock.calls[0][0] as unknown as {
      tool: { name: string; input_schema: { properties: Record<string, unknown> } };
    };
    expect(params.tool.name).toBe('emit_script');
    expect((params as unknown as { temperature: number }).temperature).toBe(0.85);
    expect(Object.keys(params.tool.input_schema.properties).sort()).toEqual([
      'educational',
      'emotional',
      'entertainment',
    ]);
  });

  it('puts the idea + platform into the user message and marks it untrusted', async () => {
    await generateThreeStyleScript({ languageCode: 'gu', platform: 'josh', ideaText: 'my festival reel' });
    const params = mRun.mock.calls[0][0] as { messages: { content: string }[] };
    const content = params.messages[0].content;
    expect(content).toContain('my festival reel');
    expect(content).toMatch(/untrusted/i);
    expect(content).toContain('josh');
  });

  it('returns the three-style result', async () => {
    const res = await generateThreeStyleScript({ languageCode: 'bn', platform: 'instagram', ideaText: 'x' });
    expect(res.educational.hook).toBe('h');
    expect(res.emotional.cta).toBe('c');
  });
});
