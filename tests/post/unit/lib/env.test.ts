import { describe, it, expect, vi, afterEach } from 'vitest';

// lib/env builds `env` from process.env AT IMPORT TIME, so to assert defaults
// vs overrides we reset the module registry, stub env, then dynamically import.
// (Same canonical env-dependent pattern as razorpay.test.ts.)
async function load(envOverrides: Record<string, string> = {}) {
  vi.resetModules();
  for (const [k, v] of Object.entries(envOverrides)) vi.stubEnv(k, v);
  return import('@/lib/env');
}

afterEach(() => vi.unstubAllEnvs());

describe('requireEnv', () => {
  it('returns the value when it is truthy', async () => {
    const { requireEnv } = await load();
    expect(requireEnv('the-secret', 'MY_KEY')).toBe('the-secret');
  });

  it('throws an error mentioning the variable name when empty', async () => {
    const { requireEnv } = await load();
    expect(() => requireEnv('', 'MY_MISSING_KEY')).toThrow(/MY_MISSING_KEY/);
  });

  it('throws for any falsy value (undefined coerced)', async () => {
    const { requireEnv } = await load();
    // @ts-expect-error deliberately passing undefined to exercise the guard
    expect(() => requireEnv(undefined, 'ANOTHER_KEY')).toThrow(/ANOTHER_KEY/);
  });
});

describe('hasEnv', () => {
  it('returns true only when every named var is present and non-empty', async () => {
    const { hasEnv } = await load({ FOO_A: 'a', FOO_B: 'b' });
    expect(hasEnv('FOO_A', 'FOO_B')).toBe(true);
  });

  it('returns false when any named var is missing', async () => {
    const { hasEnv } = await load({ FOO_A: 'a' });
    expect(hasEnv('FOO_A', 'FOO_MISSING')).toBe(false);
  });

  it('returns false when a named var is present but empty', async () => {
    const { hasEnv } = await load({ FOO_A: 'a', FOO_EMPTY: '' });
    expect(hasEnv('FOO_A', 'FOO_EMPTY')).toBe(false);
  });

  it('returns true for the no-arg case (vacuously)', async () => {
    const { hasEnv } = await load();
    expect(hasEnv()).toBe(true);
  });
});

describe('env defaults and fallbacks', () => {
  it('uses the anthropicModel default when unset', async () => {
    const { env } = await load({ ANTHROPIC_MODEL: '' });
    expect(env.anthropicModel).toBe('claude-sonnet-4-6');
  });

  it('honours an explicit anthropicModel override', async () => {
    const { env } = await load({ ANTHROPIC_MODEL: 'claude-test-9' });
    expect(env.anthropicModel).toBe('claude-test-9');
  });

  it('uses the posthogHost default when unset', async () => {
    const { env } = await load({ NEXT_PUBLIC_POSTHOG_HOST: '' });
    expect(env.posthogHost).toBe('https://eu.i.posthog.com');
  });

  it('uses the appUrl default when unset', async () => {
    const { env } = await load({ NEXT_PUBLIC_APP_URL: '' });
    expect(env.appUrl).toBe('http://localhost:3000');
  });

  it('honours an explicit appUrl override', async () => {
    const { env } = await load({ NEXT_PUBLIC_APP_URL: 'https://manch.example' });
    expect(env.appUrl).toBe('https://manch.example');
  });

  it('falls back the supabase audio bucket to "audio"', async () => {
    const { env } = await load({ SUPABASE_STORAGE_BUCKET_AUDIO: '' });
    expect(env.supabaseAudioBucket).toBe('audio');
  });

  it('falls back the whisper model and resend from-email', async () => {
    const { env } = await load({ OPENAI_WHISPER_MODEL: '', RESEND_FROM_EMAIL: '' });
    expect(env.whisperModel).toBe('whisper-1');
    expect(env.resendFromEmail).toContain('hello@manch.app');
  });

  it('falls back the dialog360 base url and qstash url', async () => {
    const { env } = await load({ DIALOG360_BASE_URL: '', QSTASH_URL: '' });
    expect(env.dialog360BaseUrl).toBe('https://waba-v2.360dialog.io');
    expect(env.qstashUrl).toBe('https://qstash.upstash.io');
  });

  it('falls back the linkedin redirect uri to localhost', async () => {
    const { env } = await load({ LINKEDIN_REDIRECT_URI: '' });
    expect(env.linkedinRedirectUri).toBe('http://localhost:3000/api/post/linkedin/callback');
  });

  it('reads razorpay plan ids from env into the razorpayPlans object', async () => {
    const { env } = await load({
      RZP_PLAN_PLUS_MONTHLY: 'plan_plus_m',
      RZP_PLAN_PRO_YEARLY: 'plan_pro_y',
    });
    expect(env.razorpayPlans.plusMonthly).toBe('plan_plus_m');
    expect(env.razorpayPlans.proYearly).toBe('plan_pro_y');
  });

  it('returns empty string for an unset secret (never throws on import)', async () => {
    const { env } = await load({ ANTHROPIC_API_KEY: '' });
    expect(env.anthropicApiKey).toBe('');
  });
});
