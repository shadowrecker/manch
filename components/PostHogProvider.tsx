'use client';

import { useEffect } from 'react';
import posthog from 'posthog-js';
import { env } from '@/lib/env';

// Initialises PostHog on the client when a key is configured. No-op otherwise,
// so the app runs locally without analytics. Client components can capture
// events by importing `posthog` from 'posthog-js' directly.
export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (!env.posthogKey) return;
    const ph = posthog as unknown as { __loaded?: boolean };
    if (ph.__loaded) return;
    posthog.init(env.posthogKey, {
      api_host: env.posthogHost,
      capture_pageview: true,
      person_profiles: 'identified_only',
    });
  }, []);

  return <>{children}</>;
}
