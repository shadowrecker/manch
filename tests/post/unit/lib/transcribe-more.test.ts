import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

// Env-dependent lib pattern (see razorpay.test.ts): lib/env snapshots process.env
// at import, and lib/ai/transcribe reads env.sarvamApiKey / env.openaiApiKey at
// use, so we resetModules + stubEnv + dynamic import to vary behaviour per test.

// The OpenAI SDK is mocked module-wide. The mock instance's
// audio.transcriptions.create is reconfigurable per test via the shared handle.
const whisperCreate = vi.fn();
vi.mock('openai', () => {
  class OpenAI {
    audio = { transcriptions: { create: whisperCreate } };
    constructor(_opts?: unknown) {}
  }
  return { default: OpenAI };
});

async function load(envOverrides: Record<string, string> = {}) {
  vi.resetModules();
  // Always provide an OpenAI key so the lazy client constructs without throwing.
  vi.stubEnv('OPENAI_API_KEY', 'sk-test');
  for (const [k, v] of Object.entries(envOverrides)) vi.stubEnv(k, v);
  return import('@/lib/modules/post/ai/transcribe');
}

beforeEach(() => {
  whisperCreate.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function audio() {
  return { data: new Blob(['x']), filename: 'note.ogg', mimeType: 'audio/ogg' };
}

describe('transcribe — Whisper primary', () => {
  it('returns text, detectedLang and provider "whisper"', async () => {
    whisperCreate.mockResolvedValue({ text: 'hello' });
    const { transcribe } = await load();
    const res = await transcribe(audio());
    expect(res).toEqual({ text: 'hello', detectedLang: 'english', provider: 'whisper' });
    expect(whisperCreate).toHaveBeenCalledTimes(1);
    // Called with the whisper model + json response format and a File payload.
    expect(whisperCreate).toHaveBeenCalledWith(
      expect.objectContaining({ response_format: 'json' }),
    );
  });

  it('derives detectedLang from the transcript text (Devanagari -> hindi)', async () => {
    whisperCreate.mockResolvedValue({ text: 'आज मैंने एक नई चीज़ सीखी' });
    const { transcribe } = await load();
    const res = await transcribe(audio());
    expect(res.detectedLang).toBe('hindi');
    expect(res.provider).toBe('whisper');
  });

  it('treats a missing text field as empty string', async () => {
    whisperCreate.mockResolvedValue({});
    const { transcribe } = await load();
    const res = await transcribe(audio());
    expect(res.text).toBe('');
    expect(res.detectedLang).toBe('english');
  });
});

describe('transcribe — Sarvam fallback', () => {
  it('falls back to provider "sarvam" when Whisper throws and SARVAM_API_KEY is set', async () => {
    whisperCreate.mockRejectedValue(new Error('whisper 500'));
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ transcript: 'namaste world' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { transcribe } = await load({ SARVAM_API_KEY: 'sarvam-key' });
    const res = await transcribe(audio());

    expect(res.provider).toBe('sarvam');
    expect(res.text).toBe('namaste world');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.sarvam.ai/speech-to-text',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'api-subscription-key': 'sarvam-key' }),
      }),
    );
  });

  it('re-throws the Whisper error when SARVAM_API_KEY is NOT configured', async () => {
    whisperCreate.mockRejectedValue(new Error('whisper boom'));
    const { transcribe } = await load({ SARVAM_API_KEY: '' });
    await expect(transcribe(audio())).rejects.toThrow(/whisper boom/);
  });

  it('throws when Sarvam returns a non-ok response', async () => {
    whisperCreate.mockRejectedValue(new Error('whisper down'));
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('nope', { status: 503 })),
    );
    const { transcribe } = await load({ SARVAM_API_KEY: 'sarvam-key' });
    await expect(transcribe(audio())).rejects.toThrow(/Sarvam ASR failed: 503/);
  });

  it('treats a missing Sarvam transcript field as empty string', async () => {
    whisperCreate.mockRejectedValue(new Error('whisper down'));
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({}), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
    const { transcribe } = await load({ SARVAM_API_KEY: 'sarvam-key' });
    const res = await transcribe(audio());
    expect(res).toEqual({ text: '', detectedLang: 'english', provider: 'sarvam' });
  });
});

describe('detectLang', () => {
  it('detects Devanagari Hindi', async () => {
    const { detectLang } = await load();
    expect(detectLang('यह एक हिंदी वाक्य है')).toBe('hindi');
  });

  it('detects Hinglish when >=2 romanised markers present', async () => {
    const { detectLang } = await load();
    expect(detectLang('aaj humara pricing badal gaya yaar')).toBe('hinglish');
  });

  it('returns english with fewer than 2 markers', async () => {
    const { detectLang } = await load();
    expect(detectLang('We shipped the new dashboard today')).toBe('english');
  });

  it('returns english on empty input', async () => {
    const { detectLang } = await load();
    expect(detectLang('')).toBe('english');
  });
});
