import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Env-dependent lib. lib/env freezes process.env at import time, so we
// resetModules + stubEnv per test, then dynamically import. The Upstash SDKs are
// mocked so the limiter is fully controllable and no network runs.

const limit = vi.fn();
const RedisCtor = vi.fn();
const RatelimitCtor = vi.fn();
const slidingWindow = vi.fn(() => ({ kind: 'sliding' }));

vi.mock('@upstash/redis', () => {
  class Redis {
    constructor(opts: unknown) {
      RedisCtor(opts);
    }
  }
  return { Redis };
});

vi.mock('@upstash/ratelimit', () => {
  class Ratelimit {
    static slidingWindow = slidingWindow;
    constructor(opts: unknown) {
      RatelimitCtor(opts);
    }
    limit = limit;
  }
  return { Ratelimit };
});

async function load(envOverrides: Record<string, string> = {}) {
  vi.resetModules();
  for (const [k, v] of Object.entries(envOverrides)) vi.stubEnv(k, v);
  return import('@/lib/ratelimit');
}

const REDIS_ENV = {
  UPSTASH_REDIS_REST_URL: 'https://redis.example',
  UPSTASH_REDIS_REST_TOKEN: 'redis_tok',
};

beforeEach(() => {
  limit.mockReset();
  RedisCtor.mockReset();
  RatelimitCtor.mockReset();
  slidingWindow.mockClear();
});

afterEach(() => vi.unstubAllEnvs());

describe('rateLimit', () => {
  it('fails open with full remaining when the Redis URL is absent', async () => {
    const { rateLimit } = await load({
      UPSTASH_REDIS_REST_URL: '',
      UPSTASH_REDIS_REST_TOKEN: 'redis_tok',
    });

    const res = await rateLimit('user-1', { limit: 5, windowSeconds: 60 });

    expect(res).toEqual({ success: true, remaining: 5 });
    expect(RedisCtor).not.toHaveBeenCalled();
    expect(RatelimitCtor).not.toHaveBeenCalled();
    expect(limit).not.toHaveBeenCalled();
  });

  it('fails open when the Redis token is absent', async () => {
    const { rateLimit } = await load({
      UPSTASH_REDIS_REST_URL: 'https://redis.example',
      UPSTASH_REDIS_REST_TOKEN: '',
    });

    const res = await rateLimit('user-1', { limit: 10, windowSeconds: 60 });

    expect(res).toEqual({ success: true, remaining: 10 });
    expect(limit).not.toHaveBeenCalled();
  });

  it('surfaces a blocked result from the limiter when Upstash is configured', async () => {
    limit.mockResolvedValue({ success: false, remaining: 0 });
    const { rateLimit } = await load(REDIS_ENV);

    const res = await rateLimit('user-99', { limit: 3, windowSeconds: 60 });

    expect(res).toEqual({ success: false, remaining: 0 });
    expect(RedisCtor).toHaveBeenCalledWith({
      url: 'https://redis.example',
      token: 'redis_tok',
    });
    expect(slidingWindow).toHaveBeenCalledWith(3, '60 s');
    expect(RatelimitCtor).toHaveBeenCalledWith(
      expect.objectContaining({ prefix: 'manch:rl', analytics: false }),
    );
    expect(limit).toHaveBeenCalledWith('user-99');
  });

  it('surfaces an allowed result with remaining from the limiter', async () => {
    limit.mockResolvedValue({ success: true, remaining: 2 });
    const { rateLimit } = await load(REDIS_ENV);

    const res = await rateLimit('user-7', { limit: 3, windowSeconds: 60 });

    expect(res).toEqual({ success: true, remaining: 2 });
  });

  it('fails open with full remaining when the limiter throws', async () => {
    limit.mockRejectedValue(new Error('redis down'));
    const { rateLimit } = await load(REDIS_ENV);

    const res = await rateLimit('user-7', { limit: 8, windowSeconds: 30 });

    expect(res).toEqual({ success: true, remaining: 8 });
  });
});
