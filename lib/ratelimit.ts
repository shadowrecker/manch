import { env } from '@/lib/env';

// Sliding-window rate limiter backed by Upstash Redis. If Redis isn't
// configured, it returns success (fail-open) so local/dev works without it —
// production should always set the Upstash vars.

export interface RateLimitResult {
  success: boolean;
  remaining: number;
}

export async function rateLimit(
  identifier: string,
  opts: { limit: number; windowSeconds: number },
): Promise<RateLimitResult> {
  if (!env.upstashRedisUrl || !env.upstashRedisToken) {
    return { success: true, remaining: opts.limit };
  }
  try {
    const { Redis } = await import('@upstash/redis');
    const { Ratelimit } = await import('@upstash/ratelimit');
    const redis = new Redis({ url: env.upstashRedisUrl, token: env.upstashRedisToken });
    const limiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(opts.limit, `${opts.windowSeconds} s` as `${number} s`),
      prefix: 'manch:rl',
      analytics: false,
    });
    const { success, remaining } = await limiter.limit(identifier);
    return { success, remaining };
  } catch {
    return { success: true, remaining: opts.limit };
  }
}
