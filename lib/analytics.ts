import { env } from '@/lib/env';
import { log } from '@/lib/observability';
import { EVENTS, type EventName } from '@/lib/events';

// Server-side PostHog capture (PRD §13). captureServer() is a no-op unless
// NEXT_PUBLIC_POSTHOG_KEY is configured, so it is always safe to call. This
// module pulls posthog-node and must only be imported from SERVER code. Client
// components import the event names from '@/lib/events' and capture via posthog-js.

export { EVENTS, type EventName };

let client: import('posthog-node').PostHog | null = null;
let initialised = false;

async function getClient(): Promise<import('posthog-node').PostHog | null> {
  if (initialised) return client;
  initialised = true;
  if (!env.posthogKey) return null;
  const { PostHog } = await import('posthog-node');
  client = new PostHog(env.posthogKey, {
    host: env.posthogHost,
    flushAt: 1,
    flushInterval: 0,
  });
  return client;
}

/** Capture a server-side product event. Safe to call without PostHog configured. */
export async function captureServer(
  event: EventName,
  distinctId: string,
  properties: Record<string, unknown> = {},
): Promise<void> {
  try {
    const c = await getClient();
    if (!c) return;
    c.capture({ distinctId, event, properties });
    await c.flush();
  } catch (e) {
    log.warn('posthog capture failed', { event, error: String(e) });
  }
}
