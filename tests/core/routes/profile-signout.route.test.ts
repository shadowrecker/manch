import { describe, it, expect, vi, beforeEach } from 'vitest';
import { jsonRequest, readJson, fakeUser, makeChain, makeSupabase } from '../../helpers/mocks';

vi.mock('@/lib/supabase/server', () => ({ getUser: vi.fn(), createClient: vi.fn() }));
vi.mock('@/lib/observability', () => ({ captureException: vi.fn(), log: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));

import { PATCH } from '@/app/api/profile/route';
import { POST as signOut } from '@/app/auth/signout/route';
import { getUser, createClient } from '@/lib/supabase/server';

const url = 'http://test/api/profile';
let profiles: ReturnType<typeof makeChain>;
let sb: ReturnType<typeof makeSupabase> & { auth: { signOut?: ReturnType<typeof vi.fn> } };

beforeEach(() => {
  vi.mocked(getUser).mockResolvedValue(fakeUser() as never);
  profiles = makeChain({ data: { full_name: 'Asha' }, error: null });
  sb = makeSupabase({ tables: { profiles } }) as typeof sb;
  sb.auth.signOut = vi.fn(() => Promise.resolve({ error: null }));
  vi.mocked(createClient).mockReturnValue(sb as never);
});

const patch = (body: unknown) => PATCH(jsonRequest(url, body, { method: 'PATCH' }));

describe('PATCH /api/profile', () => {
  it('401 when signed out', async () => {
    vi.mocked(getUser).mockResolvedValue(null);
    expect((await patch({ full_name: 'x' })).status).toBe(401);
  });

  it('saves allowed fields on the caller’s own row (trimmed, blanks → null)', async () => {
    const { status, body } = await readJson(
      await patch({ full_name: '  Asha Kumar ', headline: '', handle: '@asha.cooks', default_language: 'ta', hindi_output: true }),
    );
    expect(status).toBe(200);
    expect(body).toEqual({ profile: { full_name: 'Asha' } });
    expect(profiles.update).toHaveBeenCalledWith(
      expect.objectContaining({ full_name: 'Asha Kumar', headline: null, handle: '@asha.cooks', default_language: 'ta', hindi_output: true }),
    );
    expect(profiles.eq).toHaveBeenCalledWith('id', 'user-1');
  });

  it('rejects plan, whatsapp number and other non-editable keys', async () => {
    for (const body of [{ plan: 'pro' }, { whatsapp_e164: '+919999999999' }, { id: 'other' }, { full_name: 'x', plan: 'team' }]) {
      expect((await patch(body)).status).toBe(400);
    }
    expect(profiles.update).not.toHaveBeenCalled();
  });

  it('rejects invalid values and empty updates', async () => {
    for (const body of [{ default_language: 'xx' }, { handle: 'has spaces' }, { full_name: 'a'.repeat(81) }, {}, null]) {
      expect((await patch(body)).status).toBe(400);
    }
  });

  it('clearing the default language stores null', async () => {
    await patch({ default_language: '' });
    expect(profiles.update).toHaveBeenCalledWith(expect.objectContaining({ default_language: null }));
  });

  it('500 when the database write fails', async () => {
    profiles = makeChain({ data: null, error: { message: 'db' } });
    vi.mocked(createClient).mockReturnValue(makeSupabase({ tables: { profiles } }) as never);
    expect((await patch({ full_name: 'x' })).status).toBe(500);
  });
});

describe('POST /auth/signout', () => {
  it('ends the session and 303-redirects home', async () => {
    const res = await signOut(new Request('http://test/auth/signout', { method: 'POST' }));
    expect(sb.auth.signOut).toHaveBeenCalled();
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('http://test/');
  });

  it('still redirects if Supabase errors', async () => {
    sb.auth.signOut = vi.fn(() => Promise.resolve({ error: new Error('x') }));
    expect((await signOut(new Request('http://test/auth/signout', { method: 'POST' }))).status).toBe(303);
  });
});
