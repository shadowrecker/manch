import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Unit tests for the Anthropic wrapper (lib/ai/claude.ts).
//
// The Anthropic SDK default export is a class; we mock it so that
// `new Anthropic({...}).messages.create(...)` resolves to a content array we
// control. The wrapper reads ANTHROPIC_API_KEY lazily (via requireEnv inside
// anthropic()), so env-dependent paths use the resetModules + stubEnv + dynamic
// import pattern from razorpay.test.ts.

// A single shared spy that every mocked Anthropic instance delegates to, so we
// can assert on the exact create() call args from the test body.
const createSpy = vi.fn();
// Capture the constructor options (apiKey, maxRetries) for assertions.
const ctorSpy = vi.fn();

vi.mock('@anthropic-ai/sdk', () => {
  class Anthropic {
    messages: { create: typeof createSpy };
    constructor(opts: unknown) {
      ctorSpy(opts);
      this.messages = { create: createSpy };
    }
  }
  return { default: Anthropic };
});

async function load(envOverrides: Record<string, string> = { ANTHROPIC_API_KEY: 'sk-test' }) {
  vi.resetModules();
  for (const [k, v] of Object.entries(envOverrides)) vi.stubEnv(k, v);
  return import('@/lib/ai/claude');
}

beforeEach(() => {
  createSpy.mockReset();
  ctorSpy.mockReset();
});

afterEach(() => vi.unstubAllEnvs());

describe('runToolCall', () => {
  const tool = {
    name: 'emit_thing',
    description: 'd',
    input_schema: { type: 'object' as const, properties: {} },
  };

  it('returns the tool_use input cast to T', async () => {
    createSpy.mockResolvedValue({
      content: [{ type: 'tool_use', name: 'emit_thing', input: { ok: true, n: 7 } }],
    });
    const { runToolCall } = await load();
    const out = await runToolCall<{ ok: boolean; n: number }>({
      system: 'sys',
      messages: [{ role: 'user', content: 'hi' }],
      tool,
    });
    expect(out).toEqual({ ok: true, n: 7 });
  });

  it('forces tool_choice for the given tool and passes system/messages/tools', async () => {
    createSpy.mockResolvedValue({ content: [{ type: 'tool_use', input: { ok: true } }] });
    const { runToolCall } = await load();
    await runToolCall({
      system: [{ type: 'text', text: 'block' }],
      messages: [{ role: 'user', content: 'do it' }],
      tool,
    });
    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        tool_choice: { type: 'tool', name: 'emit_thing' },
        tools: [tool],
        system: [{ type: 'text', text: 'block' }],
        messages: [{ role: 'user', content: 'do it' }],
      }),
    );
  });

  it('applies default max_tokens (2048) and temperature (0.7) when omitted', async () => {
    createSpy.mockResolvedValue({ content: [{ type: 'tool_use', input: {} }] });
    const { runToolCall } = await load();
    await runToolCall({ system: 's', messages: [], tool });
    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({ max_tokens: 2048, temperature: 0.7 }),
    );
  });

  it('passes through caller-provided maxTokens and temperature', async () => {
    createSpy.mockResolvedValue({ content: [{ type: 'tool_use', input: {} }] });
    const { runToolCall } = await load();
    await runToolCall({ system: 's', messages: [], tool, maxTokens: 512, temperature: 0.2 });
    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({ max_tokens: 512, temperature: 0.2 }),
    );
  });

  it('uses the configured MODEL from env', async () => {
    createSpy.mockResolvedValue({ content: [{ type: 'tool_use', input: {} }] });
    const { runToolCall, MODEL } = await load({
      ANTHROPIC_API_KEY: 'sk-test',
      ANTHROPIC_MODEL: 'claude-test-model',
    });
    expect(MODEL).toBe('claude-test-model');
    await runToolCall({ system: 's', messages: [], tool });
    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'claude-test-model' }),
    );
  });

  it('throws when the response has no tool_use block', async () => {
    createSpy.mockResolvedValue({
      content: [{ type: 'text', text: 'sorry, just chatting' }],
    });
    const { runToolCall } = await load();
    await expect(
      runToolCall({ system: 's', messages: [], tool }),
    ).rejects.toThrow(/tool_use/i);
  });

  it('throws when content is empty', async () => {
    createSpy.mockResolvedValue({ content: [] });
    const { runToolCall } = await load();
    await expect(runToolCall({ system: 's', messages: [], tool })).rejects.toThrow();
  });

  it('picks the tool_use block even when other block types precede it', async () => {
    createSpy.mockResolvedValue({
      content: [
        { type: 'text', text: 'thinking...' },
        { type: 'tool_use', input: { picked: true } },
      ],
    });
    const { runToolCall } = await load();
    const out = await runToolCall<{ picked: boolean }>({ system: 's', messages: [], tool });
    expect(out).toEqual({ picked: true });
  });
});

describe('cached', () => {
  it('wraps text as an ephemeral cache-eligible text block', async () => {
    const { cached } = await load();
    expect(cached('hello rubric')).toEqual({
      type: 'text',
      text: 'hello rubric',
      cache_control: { type: 'ephemeral' },
    });
  });

  it('preserves the exact text verbatim', async () => {
    const { cached } = await load();
    const text = 'line one\nline two\n  indented';
    expect(cached(text).text).toBe(text);
  });
});

describe('anthropic()', () => {
  it('throws a clear error when ANTHROPIC_API_KEY is missing', async () => {
    const { anthropic } = await load({ ANTHROPIC_API_KEY: '' });
    expect(() => anthropic()).toThrow(/ANTHROPIC_API_KEY/);
  });

  it('constructs the client with the api key and maxRetries when present', async () => {
    const { anthropic } = await load({ ANTHROPIC_API_KEY: 'sk-live-123' });
    anthropic();
    expect(ctorSpy).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: 'sk-live-123', maxRetries: 3 }),
    );
  });

  it('memoises the client (single construction across calls)', async () => {
    const { anthropic } = await load({ ANTHROPIC_API_KEY: 'sk-live-123' });
    const a = anthropic();
    const b = anthropic();
    expect(a).toBe(b);
    expect(ctorSpy).toHaveBeenCalledTimes(1);
  });
});
