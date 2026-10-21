import { describe, it, expect, vi, afterEach } from 'vitest';

const create = vi.fn();
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create };
    constructor(public opts: unknown) {}
  },
}));
const publishJSON = vi.fn().mockResolvedValue({ messageId: 'm1' });
const verify = vi.fn().mockResolvedValue(true);
vi.mock('@upstash/qstash', () => ({
  Client: class {
    publishJSON = publishJSON;
    constructor(public o: unknown) {}
  },
  Receiver: class {
    verify = verify;
    constructor(public o: unknown) {}
  },
}));

async function load(path: string, env: Record<string, string> = {}) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  return import(path);
}
afterEach(() => vi.unstubAllEnvs());

describe('claude runToolCall', () => {
  it('returns the tool_use input', async () => {
    create.mockResolvedValue({ content: [{ type: 'tool_use', input: { ok: 1 } }] });
    const { runToolCall, cached } = await load('@/lib/ai/claude', { ANTHROPIC_API_KEY: 'k' });
    const out = await runToolCall({ system: 'sys', messages: [{ role: 'user', content: 'x' }], tool: { name: 't', input_schema: { type: 'object' } } });
    expect(out).toEqual({ ok: 1 });
    expect(cached('hi')).toMatchObject({ type: 'text', text: 'hi', cache_control: { type: 'ephemeral' } });
  });
  it('throws when no tool_use block', async () => {
    create.mockResolvedValue({ content: [{ type: 'text', text: 'nope' }] });
    const { runToolCall } = await load('@/lib/ai/claude', { ANTHROPIC_API_KEY: 'k' });
    await expect(runToolCall({ system: 's', messages: [], tool: { name: 't', input_schema: { type: 'object' } } })).rejects.toThrow(/tool_use/);
  });
});

describe('queue', () => {
  it('enqueue publishes to appUrl+path and returns the messageId', async () => {
    const { enqueue } = await load('@/lib/queue', { QSTASH_TOKEN: 't', NEXT_PUBLIC_APP_URL: 'https://app' });
    const res = await enqueue('/api/reels/jobs/generate', { a: 1 }, { deduplicationId: 'd1' });
    expect(res.messageId).toBe('m1');
    expect(publishJSON).toHaveBeenCalledWith(expect.objectContaining({ url: 'https://app/api/reels/jobs/generate', deduplicationId: 'd1' }));
  });
  it('enqueue throws without a token', async () => {
    const { enqueue } = await load('@/lib/queue', { QSTASH_TOKEN: '' });
    await expect(enqueue('/p', {})).rejects.toThrow(/QSTASH_TOKEN/);
  });
  it('verifyQstashSignature: false without sig/key, true when Receiver verifies', async () => {
    const m1 = await load('@/lib/queue', { QSTASH_CURRENT_SIGNING_KEY: '' });
    expect(await m1.verifyQstashSignature('sig', 'body')).toBe(false);
    const m2 = await load('@/lib/queue', { QSTASH_CURRENT_SIGNING_KEY: 'cur', QSTASH_NEXT_SIGNING_KEY: 'nxt' });
    expect(await m2.verifyQstashSignature(null, 'body')).toBe(false);
    expect(await m2.verifyQstashSignature('sig', 'body')).toBe(true);
  });
});

describe('ratelimit + analytics (no env → safe)', () => {
  it('rateLimit fails open without Upstash env', async () => {
    const { rateLimit } = await load('@/lib/ratelimit', { UPSTASH_REDIS_REST_URL: '', UPSTASH_REDIS_REST_TOKEN: '' });
    expect(await rateLimit('id', { limit: 5, windowSeconds: 60 })).toEqual({ success: true, remaining: 5 });
  });
  it('captureServer is a no-op without a PostHog key', async () => {
    const { captureServer, EVENTS } = await load('@/lib/analytics', { NEXT_PUBLIC_POSTHOG_KEY: '' });
    await expect(captureServer(EVENTS.pieceGenerated, 'u1', {})).resolves.toBeUndefined();
  });
});
