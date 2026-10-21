import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Env-dependent + module-memoised lib. analytics.ts memoises the PostHog client
// in module scope (the `initialised` flag), so we MUST resetModules between env
// scenarios. lib/env also freezes process.env at import, hence stubEnv + dynamic
// import. posthog-node is mocked so no real client/network is created.

const capture = vi.fn();
const flush = vi.fn();
const PostHogCtor = vi.fn();

vi.mock('posthog-node', () => {
  class PostHog {
    constructor(key: string, opts: unknown) {
      PostHogCtor(key, opts);
    }
    capture = capture;
    flush = flush;
  }
  return { PostHog };
});

async function load(envOverrides: Record<string, string> = {}) {
  vi.resetModules();
  for (const [k, v] of Object.entries(envOverrides)) vi.stubEnv(k, v);
  return import('@/lib/analytics');
}

const POSTHOG_ENV = {
  NEXT_PUBLIC_POSTHOG_KEY: 'phc_test_key',
  NEXT_PUBLIC_POSTHOG_HOST: 'https://eu.posthog.example',
};

beforeEach(() => {
  capture.mockReset();
  flush.mockReset();
  flush.mockResolvedValue(undefined);
  PostHogCtor.mockReset();
});

afterEach(() => vi.unstubAllEnvs());

describe('captureServer', () => {
  it('is a no-op (no throw, no client) when NEXT_PUBLIC_POSTHOG_KEY is absent', async () => {
    const { captureServer, EVENTS } = await load({ NEXT_PUBLIC_POSTHOG_KEY: '' });

    await expect(
      captureServer(EVENTS.draftGenerated, 'user-1', { source: 'whatsapp' }),
    ).resolves.toBeUndefined();

    expect(PostHogCtor).not.toHaveBeenCalled();
    expect(capture).not.toHaveBeenCalled();
    expect(flush).not.toHaveBeenCalled();
  });

  it('constructs PostHog with the key/host and captures + flushes the event', async () => {
    const { captureServer, EVENTS } = await load(POSTHOG_ENV);

    await captureServer(EVENTS.draftGenerated, 'user-42', { plan: 'pro' });

    expect(PostHogCtor).toHaveBeenCalledWith(
      'phc_test_key',
      expect.objectContaining({ host: 'https://eu.posthog.example' }),
    );
    expect(capture).toHaveBeenCalledWith({
      distinctId: 'user-42',
      event: 'draft_generated',
      properties: { plan: 'pro' },
    });
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it('defaults properties to an empty object when omitted', async () => {
    const { captureServer, EVENTS } = await load(POSTHOG_ENV);

    await captureServer(EVENTS.signup, 'user-7');

    expect(capture).toHaveBeenCalledWith({
      distinctId: 'user-7',
      event: 'signup',
      properties: {},
    });
  });

  it('memoises the client across calls (constructs PostHog only once)', async () => {
    const { captureServer, EVENTS } = await load(POSTHOG_ENV);

    await captureServer(EVENTS.signup, 'user-1');
    await captureServer(EVENTS.draftGenerated, 'user-2');

    expect(PostHogCtor).toHaveBeenCalledTimes(1);
    expect(capture).toHaveBeenCalledTimes(2);
    expect(flush).toHaveBeenCalledTimes(2);
  });

  it('swallows errors when capture throws (does not reject)', async () => {
    capture.mockImplementation(() => {
      throw new Error('capture failed');
    });
    const { captureServer, EVENTS } = await load(POSTHOG_ENV);

    await expect(captureServer(EVENTS.signup, 'user-1')).resolves.toBeUndefined();
    expect(flush).not.toHaveBeenCalled();
  });

  it('swallows errors when flush rejects (does not reject)', async () => {
    flush.mockRejectedValue(new Error('flush failed'));
    const { captureServer, EVENTS } = await load(POSTHOG_ENV);

    await expect(captureServer(EVENTS.signup, 'user-1')).resolves.toBeUndefined();
    expect(capture).toHaveBeenCalledTimes(1);
  });
});

describe('EVENTS re-export', () => {
  it('equals lib/events EVENTS', async () => {
    const analytics = await load();
    const events = await import('@/lib/events');
    expect(analytics.EVENTS).toEqual(events.EVENTS);
  });
});
