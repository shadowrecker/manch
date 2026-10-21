import { describe, it, expect, vi, afterEach } from 'vitest';

const create = vi.fn();
vi.mock('openai', () => ({
  default: class {
    audio = { transcriptions: { create } };
    constructor(public o: unknown) {}
  },
}));

async function load(env: Record<string, string> = {}) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  return import('@/lib/modules/reels/ai/transcribe');
}
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  create.mockReset();
});

describe('transcribe', () => {
  it('returns Whisper text on success', async () => {
    create.mockResolvedValue({ text: 'hello world' });
    const { transcribe } = await load({ OPENAI_API_KEY: 'k' });
    const out = await transcribe({ data: new Blob(['x']), mimeType: 'audio/ogg' });
    expect(out).toEqual({ text: 'hello world', provider: 'whisper' });
  });

  it('falls back to Sarvam when Whisper fails and Sarvam is configured', async () => {
    create.mockRejectedValue(new Error('whisper down'));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ transcript: 'नमस्ते' }), { status: 200 })));
    const { transcribe } = await load({ OPENAI_API_KEY: 'k', SARVAM_API_KEY: 'sk' });
    const out = await transcribe({ data: new Blob(['x']) });
    expect(out.provider).toBe('sarvam');
    expect(out.text).toBe('नमस्ते');
  });

  it('rethrows when Whisper fails and no fallback is configured', async () => {
    create.mockRejectedValue(new Error('whisper down'));
    const { transcribe } = await load({ OPENAI_API_KEY: 'k', SARVAM_API_KEY: '' });
    await expect(transcribe({ data: new Blob(['x']) })).rejects.toThrow(/whisper down/);
  });
});
