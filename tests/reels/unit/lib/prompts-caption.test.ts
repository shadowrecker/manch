import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/ai/claude', () => ({
  cached: (text: string) => ({ type: 'text', text, cache_control: { type: 'ephemeral' } }),
  runToolCall: vi.fn(),
}));

import { generateCaption } from '@/lib/modules/reels/ai/prompts/caption';
import { runToolCall } from '@/lib/ai/claude';

const mRun = vi.mocked(runToolCall);

describe('generateCaption', () => {
  beforeEach(() => {
    mRun.mockResolvedValue({ caption: 'வணக்கம் 🎬 #reels' } as never);
  });

  it('instructs native script + platform limit, forces emit_caption', async () => {
    await generateCaption({ languageCode: 'ta', platform: 'moj', context: 'my script' });
    const params = mRun.mock.calls[0][0] as {
      system: { text: string }[];
      tool: { name: string };
      messages: { content: string }[];
    };
    expect(params.system[0].text).toMatch(/Tamil/);
    expect(params.system[0].text).toMatch(/never romanised/i);
    expect(params.system[0].text).toMatch(/500/); // Moj caption limit
    expect(params.tool.name).toBe('emit_caption');
    // Bhasha's sampling temperature is passed explicitly (core default is 0.7).
    expect((params as unknown as { temperature: number }).temperature).toBe(0.8);
    expect(params.messages[0].content).toContain('my script');
  });

  it('hard-caps the caption to the platform limit', async () => {
    const long = 'அ'.repeat(900);
    mRun.mockResolvedValue({ caption: long } as never);
    const out = await generateCaption({ languageCode: 'ta', platform: 'moj', context: 'x' });
    expect(out.length).toBe(500); // Moj limit
  });
});
