import { describe, it, expect, vi, beforeEach } from 'vitest';

// Tests for the style-guide builder (lib/ai/prompts/voiceProfile.ts).
//
// The builder calls runText() from our Claude wrapper. We mock the Anthropic
// SDK class itself, so the real wrapper (with its model-aware request shaping)
// runs and we assert on the exact messages.create body. The model is pinned to
// a sampling-capable one here; model adaptation is covered in claude.test.ts.

const createSpy = vi.hoisted(() => {
  process.env.ANTHROPIC_API_KEY = 'sk-test';
  process.env.ANTHROPIC_MODEL = 'claude-sonnet-4-6';
  return vi.fn();
});

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: createSpy };
  },
}));

import { buildStyleGuide, type VoiceProfilePromptInput } from '@/lib/modules/post/ai/prompts/voiceProfile';

function baseInput(overrides: Partial<VoiceProfilePromptInput> = {}): VoiceProfilePromptInput {
  return {
    industry: 'fintech',
    seniority: 'Head of Product',
    topics: ['product', 'fundraising'],
    tone: 'warm',
    writingSample: 'I keep my sentences short. I tell stories.',
    ...overrides,
  };
}

function textResponse(text: string) {
  return { content: [{ type: 'text', text }] };
}

function firstCallArgs() {
  expect(createSpy).toHaveBeenCalledTimes(1);
  return createSpy.mock.calls[0][0] as {
    model: string;
    system: string;
    max_tokens: number;
    temperature: number;
    messages: Array<{ role: string; content: string }>;
  };
}

beforeEach(() => {
  createSpy.mockReset();
  createSpy.mockResolvedValue(textResponse('A solid style guide.'));
});

describe('buildStyleGuide', () => {
  it('returns the model text block content', async () => {
    createSpy.mockResolvedValue(textResponse('Open with a hook. Keep sentences short.'));
    const out = await buildStyleGuide(baseInput());
    expect(out).toBe('Open with a hook. Keep sentences short.');
  });

  it('trims whitespace from the returned guide', async () => {
    createSpy.mockResolvedValue(textResponse('   \n  guide body  \n  '));
    const out = await buildStyleGuide(baseInput());
    expect(out).toBe('guide body');
  });

  it('returns an empty string when the model emits no text block', async () => {
    createSpy.mockResolvedValue({ content: [{ type: 'tool_use', input: {} }] });
    const out = await buildStyleGuide(baseInput());
    expect(out).toBe('');
  });

  it('returns an empty string when content is empty', async () => {
    createSpy.mockResolvedValue({ content: [] });
    const out = await buildStyleGuide(baseInput());
    expect(out).toBe('');
  });

  it('picks the first text block when multiple block types are present', async () => {
    createSpy.mockResolvedValue({
      content: [
        { type: 'tool_use', input: {} },
        { type: 'text', text: 'the real guide' },
        { type: 'text', text: 'second guide' },
      ],
    });
    const out = await buildStyleGuide(baseInput());
    expect(out).toBe('the real guide');
  });

  it('uses the configured model and low-temperature config', async () => {
    await buildStyleGuide(baseInput());
    const args = firstCallArgs();
    expect(args.model).toBe('claude-sonnet-4-6');
    expect(args.max_tokens).toBe(600);
    expect(args.temperature).toBe(0.4);
  });

  it('sends a system prompt describing a voice-and-style analyst', async () => {
    await buildStyleGuide(baseInput());
    expect(firstCallArgs().system).toMatch(/voice-and-style analyst/i);
  });

  it('builds a user message with the author facts and the writing sample', async () => {
    await buildStyleGuide(
      baseInput({
        industry: 'SaaS',
        seniority: 'Founder',
        topics: ['GTM', 'pricing'],
        tone: 'bold',
        writingSample: 'My distinctive voice sample.',
      }),
    );
    const msg = firstCallArgs().messages[0];
    expect(msg.role).toBe('user');
    expect(msg.content).toContain('INDUSTRY: SaaS');
    expect(msg.content).toContain('SENIORITY: Founder');
    expect(msg.content).toContain('TOPICS: GTM, pricing');
    expect(msg.content).toContain('DESIRED TONE: bold');
    expect(msg.content).toContain('My distinctive voice sample.');
    expect(msg.content).toMatch(/WRITING SAMPLE \(untrusted/);
  });

  it('tolerates a missing writing sample (placeholder, still returns a guide)', async () => {
    const out = await buildStyleGuide(baseInput({ writingSample: undefined }));
    expect(out).toBe('A solid style guide.');
    expect(firstCallArgs().messages[0].content).toMatch(/no sample provided/i);
  });

  it('tolerates an empty/whitespace-only writing sample', async () => {
    const out = await buildStyleGuide(baseInput({ writingSample: '    ' }));
    expect(out).toBe('A solid style guide.');
    expect(firstCallArgs().messages[0].content).toMatch(/no sample provided/i);
  });

  it('shows "(none specified)" when topics is empty', async () => {
    await buildStyleGuide(baseInput({ topics: [] }));
    expect(firstCallArgs().messages[0].content).toContain('TOPICS: (none specified)');
  });

  it('omits temperature and adds thinking headroom on a current model', async () => {
    const { runText } = await import('@/lib/ai/claude');
    await runText({ system: 's', messages: [{ role: 'user', content: 'x' }], maxTokens: 600, temperature: 0.4 }, 'claude-opus-5');
    const args = createSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(args.model).toBe('claude-opus-5');
    expect(args).not.toHaveProperty('temperature');
    expect(args.max_tokens).toBe(12_600);
  });

  it('propagates a model/transport error (e.g. missing API key)', async () => {
    createSpy.mockRejectedValue(new Error('Missing required environment variable: ANTHROPIC_API_KEY'));
    await expect(buildStyleGuide(baseInput())).rejects.toThrow(/ANTHROPIC_API_KEY/);
  });
});
