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

// Default: a sampling-capable legacy model, so the forced-tool path is exercised.
// Current-model behaviour is covered in the 'model adaptation' block below.
async function load(envOverrides: Record<string, string> = { ANTHROPIC_API_KEY: 'sk-test', ANTHROPIC_MODEL: 'claude-sonnet-4-6' }) {
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

  it('throws ClaudeTruncatedError when output was cut off at max_tokens (never returns partial input)', async () => {
    createSpy.mockResolvedValue({
      stop_reason: 'max_tokens',
      content: [{ type: 'tool_use', id: 't', name: 'emit', input: { posts: [{ angle: 'story' }] } }],
    });
    const mod = await load();
    const p = mod.runToolCall({ system: 's', messages: [], tool, maxTokens: 50 });
    await expect(p).rejects.toBeInstanceOf(mod.ClaudeTruncatedError);
    await expect(p).rejects.toThrow(/max_tokens=50/);
  });

  it('returns input normally when stop_reason is tool_use', async () => {
    createSpy.mockResolvedValue({
      stop_reason: 'tool_use',
      content: [{ type: 'tool_use', id: 't', name: 'emit', input: { ok: true } }],
    });
    const { runToolCall } = await load();
    await expect(runToolCall({ system: 's', messages: [], tool })).resolves.toEqual({ ok: true });
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

describe('modelCaps', () => {
  it('classifies legacy, Opus 4.7/4.8 and current models', async () => {
    const { modelCaps } = await load();
    for (const m of ['claude-sonnet-4-6', 'claude-opus-4-6', 'claude-haiku-4-5', 'claude-sonnet-4-20250514', 'claude-3-5-haiku-latest']) {
      expect(modelCaps(m)).toEqual({ sampling: true, forcedToolChoice: true, thinksByDefault: false });
    }
    for (const m of ['claude-opus-4-7', 'claude-opus-4-8']) {
      expect(modelCaps(m)).toEqual({ sampling: false, forcedToolChoice: true, thinksByDefault: false });
    }
    for (const m of ['claude-opus-5', 'claude-opus-5-5', 'claude-sonnet-5', 'claude-fable-5-1', 'claude-some-future-model']) {
      expect(modelCaps(m)).toEqual({ sampling: false, forcedToolChoice: false, thinksByDefault: true });
    }
  });
});

describe('runToolCall — model adaptation', () => {
  const tool = {
    name: 'emit_posts',
    description: 'd',
    input_schema: { type: 'object' as const, properties: {} },
  };
  const toolUse = (input: unknown) => ({
    stop_reason: 'tool_use',
    content: [
      { type: 'thinking', thinking: '', signature: 'sig' },
      { type: 'tool_use', id: 't', name: 'emit_posts', input },
    ],
  });

  it('current model: no temperature, auto tool_choice, instruction appended after the cached system, thinking headroom', async () => {
    createSpy.mockResolvedValue(toolUse({ ok: 1 }));
    const { runToolCall, cached } = await load({ ANTHROPIC_API_KEY: 'sk-test', ANTHROPIC_MODEL: 'claude-opus-5' });
    const system = [cached('stable prefix')];
    await expect(runToolCall({ system, messages: [{ role: 'user', content: 'hi' }], tool, maxTokens: 6000, temperature: 0.8 })).resolves.toEqual({ ok: 1 });
    const args = createSpy.mock.calls[0][0];
    expect(args.model).toBe('claude-opus-5');
    expect(args).not.toHaveProperty('temperature');
    expect(args.tool_choice).toEqual({ type: 'auto' });
    expect(args.max_tokens).toBe(18_000);
    expect(args.system[0]).toEqual(system[0]); // cached prefix untouched
    expect(args.system[1].text).toMatch(/calling the `emit_posts` tool/);
  });

  it('caps the budget at 20,000 for non-streaming requests', async () => {
    createSpy.mockResolvedValue(toolUse({}));
    const { runToolCall } = await load({ ANTHROPIC_API_KEY: 'sk-test', ANTHROPIC_MODEL: 'claude-opus-5' });
    await runToolCall({ system: 's', messages: [], tool, maxTokens: 8000 });
    expect(createSpy.mock.calls[0][0].max_tokens).toBe(20_000);
  });

  it('retries once when a current model answers in text, echoing its turn back unchanged', async () => {
    const firstContent = [{ type: 'thinking', thinking: '', signature: 'sig' }, { type: 'text', text: 'Here are posts…' }];
    createSpy.mockResolvedValueOnce({ stop_reason: 'end_turn', content: firstContent }).mockResolvedValueOnce(toolUse({ ok: 2 }));
    const { runToolCall } = await load({ ANTHROPIC_API_KEY: 'sk-test', ANTHROPIC_MODEL: 'claude-opus-5' });
    await expect(runToolCall({ system: 's', messages: [{ role: 'user', content: 'hi' }], tool })).resolves.toEqual({ ok: 2 });
    expect(createSpy).toHaveBeenCalledTimes(2);
    const retryMsgs = createSpy.mock.calls[1][0].messages;
    expect(retryMsgs[1]).toEqual({ role: 'assistant', content: firstContent });
    expect(retryMsgs[2].content).toMatch(/Call the `emit_posts` tool now/);
  });

  it('gives up after one retry', async () => {
    createSpy.mockResolvedValue({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'no tool' }] });
    const { runToolCall } = await load({ ANTHROPIC_API_KEY: 'sk-test', ANTHROPIC_MODEL: 'claude-opus-5' });
    await expect(runToolCall({ system: 's', messages: [], tool })).rejects.toThrow(/tool_use/);
    expect(createSpy).toHaveBeenCalledTimes(2);
  });

  it('Opus 4.7/4.8: forced tool_choice but no temperature', async () => {
    createSpy.mockResolvedValue(toolUse({}));
    const { runToolCall } = await load({ ANTHROPIC_API_KEY: 'sk-test', ANTHROPIC_MODEL: 'claude-opus-4-8' });
    await runToolCall({ system: 's', messages: [], tool, maxTokens: 1000, temperature: 0.3 });
    const args = createSpy.mock.calls[0][0];
    expect(args.tool_choice).toEqual({ type: 'tool', name: 'emit_posts' });
    expect(args).not.toHaveProperty('temperature');
    expect(args.max_tokens).toBe(1000);
  });

  it('throws ClaudeRefusalError on a refusal, without retrying', async () => {
    createSpy.mockResolvedValue({ stop_reason: 'refusal', content: [] });
    const mod = await load({ ANTHROPIC_API_KEY: 'sk-test', ANTHROPIC_MODEL: 'claude-opus-5' });
    await expect(mod.runToolCall({ system: 's', messages: [], tool })).rejects.toBeInstanceOf(mod.ClaudeRefusalError);
    expect(createSpy).toHaveBeenCalledTimes(1);
  });

  it('sends ANTHROPIC_EFFORT as output_config.effort on current models only', async () => {
    createSpy.mockResolvedValue(toolUse({}));
    const cur = await load({ ANTHROPIC_API_KEY: 'sk-test', ANTHROPIC_MODEL: 'claude-opus-5', ANTHROPIC_EFFORT: 'medium' });
    await cur.runToolCall({ system: 's', messages: [], tool });
    expect(createSpy.mock.calls[0][0].output_config).toEqual({ effort: 'medium' });
    createSpy.mockClear();
    const old = await load({ ANTHROPIC_API_KEY: 'sk-test', ANTHROPIC_MODEL: 'claude-sonnet-4-6', ANTHROPIC_EFFORT: 'medium' });
    await old.runToolCall({ system: 's', messages: [], tool });
    expect(createSpy.mock.calls[0][0]).not.toHaveProperty('output_config');
  });
});
