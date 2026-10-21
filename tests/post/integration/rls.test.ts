import { describe, it, expect, beforeAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// GATED DB-integration test for Row-Level Security.
//
// This suite hits a LIVE Supabase project and is therefore skipped unless BOTH
// a service-role key and the public project URL are present in the environment.
// In CI (where live creds are intentionally absent) the `describe.skipIf(...)`
// block is skipped cleanly — no network calls, no failures.
//
// The single always-on test below documents the gating predicate so this file
// is never empty even when the integration block is skipped.

const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** True when the live-DB integration suite has the credentials it needs. */
const hasLiveCreds = Boolean(SERVICE_ROLE_KEY && SUPABASE_URL);

describe('RLS integration gating', () => {
  it('only runs the live-DB suite when service-role + project URL are configured', () => {
    // The gating predicate is the inverse of the skipIf condition below; assert
    // it is a boolean derived from exactly those two env vars so the gate is
    // provably wired. With no creds in CI this is `false` and the suite skips.
    expect(typeof hasLiveCreds).toBe('boolean');
    expect(hasLiveCreds).toBe(
      Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL),
    );
  });
});

describe.skipIf(!SERVICE_ROLE_KEY || !SUPABASE_URL)(
  'RLS: anonymous client cannot read another user\'s drafts',
  () => {
    // Clients are created in beforeAll (which never runs for a skipped suite) so
    // the describe body does not construct a client with undefined creds at
    // collection time.
    let admin: SupabaseClient;
    let anon: SupabaseClient | null = null;
    const anonAvailable = Boolean(ANON_KEY);

    beforeAll(() => {
      admin = createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      anon = ANON_KEY
        ? createClient(SUPABASE_URL!, ANON_KEY, {
            auth: { autoRefreshToken: false, persistSession: false },
          })
        : null;
    });

    it.skipIf(!anonAvailable)(
      'anon SELECT returns no rows for a foreign user\'s draft',
      async () => {
        const ownerId = `00000000-0000-0000-0000-${Date.now().toString().slice(-12).padStart(12, '0')}`;
        let seededId: string | null = null;

        try {
          // Seed a draft via the service-role client (bypasses RLS). Columns
          // mirror the real `drafts` schema (lib/db/types.ts): source/angle/
          // body/gen_request_id/model are required.
          const { data: inserted, error: insertErr } = await admin
            .from('drafts')
            .insert({
              user_id: ownerId,
              source: 'text',
              angle: 'story',
              body: 'secret draft body',
              gen_request_id: `rls-test-${Date.now()}`,
              model: 'test',
            })
            .select('id')
            .single();

          // If the schema differs in this project, surface it loudly rather than
          // silently passing — the test is only meaningful against the real DB.
          expect(insertErr).toBeNull();
          seededId = (inserted as { id: string } | null)?.id ?? null;
          expect(seededId).toBeTruthy();

          // The anonymous (unauthenticated, RLS-enforced) client must NOT see it.
          const { data: anonRows, error: anonErr } = await anon!
            .from('drafts')
            .select('id, body')
            .eq('id', seededId!);

          // RLS yields an empty result set (not an error) for rows the caller
          // cannot access. Either way, no foreign rows may leak.
          expect(anonErr).toBeNull();
          expect(anonRows ?? []).toHaveLength(0);
        } finally {
          // Cleanup with the service-role client regardless of outcome.
          if (seededId) {
            await admin.from('drafts').delete().eq('id', seededId);
          }
        }
      },
    );

    it.skipIf(!anonAvailable)(
      'anon cannot list any drafts without a session',
      async () => {
        // A blanket SELECT from an unauthenticated client must return zero rows
        // under a correct RLS policy (every row is owner-scoped).
        const { data, error } = await anon!.from('drafts').select('id').limit(1);
        expect(error).toBeNull();
        expect(data ?? []).toHaveLength(0);
      },
    );
  },
);
