import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/db/types';
import { env, requireEnv } from '@/lib/env';

/**
 * Service-role Supabase client. BYPASSES RLS — SERVER ONLY.
 * Never import this from client components. Use only inside route handlers,
 * server actions and queue workers for privileged tables (tokens, usage,
 * outbox, WhatsApp dedupe).
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(
    requireEnv(env.supabaseUrl, 'NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv(env.supabaseServiceKey, 'SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
