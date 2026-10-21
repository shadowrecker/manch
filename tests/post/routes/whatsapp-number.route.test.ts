import { describe, it, expect, vi, beforeEach } from 'vitest';
import { jsonRequest, readJson, fakeUser, makeSupabase, makeChain } from '../helpers/mocks';

// POST /api/post/whatsapp-number — issues a one-time LINK code (ownership is
// proven by sending it FROM the number), or unlinks. Typed numbers are never trusted.

vi.mock('@/lib/supabase/server', () => ({ getUser: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/ratelimit', () => ({ rateLimit: vi.fn() }));
vi.mock('@/lib/env', () => ({ env: { whatsappBotNumber: '+91 90000 00000' } }));
vi.mock('@/lib/observability', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  captureException: vi.fn(),
}));

import { POST } from '@/app/api/post/whatsapp-number/route';
import { getUser } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { rateLimit } from '@/lib/ratelimit';

const req = (body: unknown) => jsonRequest('http://test/api/post/whatsapp-number', body);
let profiles: ReturnType<typeof makeChain>;
let codes: ReturnType<typeof makeChain>;

beforeEach(() => {
  vi.mocked(getUser).mockResolvedValue(fakeUser() as never);
  vi.mocked(rateLimit).mockResolvedValue({ success: true, remaining: 4 });
  profiles = makeChain();
  codes = makeChain();
  vi.mocked(createAdminClient).mockReturnValue(makeSupabase({ tables: { profiles, whatsapp_link_codes: codes } }) as never);
});

describe('POST /api/post/whatsapp-number', () => {
  it('401 when signed out', async () => {
    vi.mocked(getUser).mockResolvedValue(null);
    expect((await POST(req({}))).status).toBe(401);
  });

  it('issues a single-use 6-digit code and a wa.me deep link — never writes a typed number', async () => {
    const { status, body } = await readJson(await POST(req({ whatsapp: '+919999999999' })));
    expect(status).toBe(200);
    const b = body as { code: string; expiresAt: string; waLink: string };
    expect(b.code).toMatch(/^\d{6}$/);
    expect(new Date(b.expiresAt).getTime()).toBeGreaterThan(Date.now());
    expect(b.waLink).toBe(`https://wa.me/919000000000?text=LINK%20${b.code}`);
    expect(codes.delete).toHaveBeenCalled(); // older codes cleared
    expect(codes.insert).toHaveBeenCalledWith(expect.objectContaining({ code: b.code, user_id: 'user-1' }));
    expect(profiles.update).not.toHaveBeenCalled();
  });

  it('429 when rate limited', async () => {
    vi.mocked(rateLimit).mockResolvedValue({ success: false, remaining: 0 });
    expect((await POST(req({}))).status).toBe(429);
    expect(codes.insert).not.toHaveBeenCalled();
  });

  it('500 when the code cannot be stored', async () => {
    codes = makeChain({ data: null, error: { message: 'db' } });
    vi.mocked(createAdminClient).mockReturnValue(makeSupabase({ tables: { profiles, whatsapp_link_codes: codes } }) as never);
    expect((await POST(req({}))).status).toBe(500);
  });

  it('unlinks only the caller', async () => {
    const { status, body } = await readJson(await POST(req({ unlink: true })));
    expect(status).toBe(200);
    expect(body).toEqual({ ok: true });
    expect(profiles.update).toHaveBeenCalledWith({ whatsapp_e164: null });
    expect(profiles.eq).toHaveBeenCalledWith('id', 'user-1');
  });
});
