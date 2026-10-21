import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeSupabase, makeChain } from '../../helpers/mocks';

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));

import { hashApiKey, generateApiKey, extractApiKey, verifyApiKey } from '@/lib/modules/check/api/auth';
import { createAdminClient } from '@/lib/supabase/admin';

describe('api key helpers', () => {
  it('hashes a key stably (and the hash is not the key)', () => {
    const raw = generateApiKey();
    expect(raw).toMatch(/^tck_[0-9a-f]{48}$/);
    const h = hashApiKey(raw);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toBe(raw);
    expect(hashApiKey(raw)).toBe(h);
  });

  it('extracts the key from Authorization or x-api-key', () => {
    expect(extractApiKey(new Request('http://t', { headers: { authorization: 'Bearer tck_abc' } }))).toBe('tck_abc');
    expect(extractApiKey(new Request('http://t', { headers: { 'x-api-key': 'tck_xyz' } }))).toBe('tck_xyz');
    expect(extractApiKey(new Request('http://t'))).toBeNull();
  });
});

describe('verifyApiKey', () => {
  beforeEach(() => {
    vi.mocked(createAdminClient).mockReturnValue(
      makeSupabase({ tables: { api_keys: makeChain({ data: { id: 'k1', org_name: 'Daily Herald', plan: 'newsroom', monthly_quota: 10000, active: true }, error: null }) } }) as never,
    );
  });
  it('resolves an active key by its hash', async () => {
    const key = await verifyApiKey('tck_raw');
    expect(key?.id).toBe('k1');
  });
  it('returns null for an empty key', async () => {
    expect(await verifyApiKey('')).toBeNull();
  });
});
