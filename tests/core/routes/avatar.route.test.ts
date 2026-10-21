import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readJson, fakeUser, makeChain } from '../../helpers/mocks';

vi.mock('@/lib/supabase/server', () => ({ getUser: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/db/queries', () => ({ getProfile: vi.fn() }));
vi.mock('@/lib/ratelimit', () => ({ rateLimit: vi.fn() }));
vi.mock('@/lib/env', () => ({ env: { supabaseUrl: 'https://abcd.supabase.co' } }));
vi.mock('@/lib/observability', () => ({ captureException: vi.fn(), log: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));

import { POST, DELETE } from '@/app/api/profile/avatar/route';
import { getUser } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getProfile } from '@/lib/db/queries';
import { rateLimit } from '@/lib/ratelimit';

const UID = '11111111-2222-3333-4444-555555555555';
const OLD = `https://abcd.supabase.co/storage/v1/object/public/avatars/${UID}/0011223344556677.webp`;
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

let profiles: ReturnType<typeof makeChain>;
let bucket: { upload: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn>; getPublicUrl: ReturnType<typeof vi.fn> };
let storageFrom: ReturnType<typeof vi.fn>;

function setup({ uploadError = null as unknown, dbError = null as unknown } = {}) {
  profiles = makeChain({ data: null, error: dbError });
  bucket = {
    upload: vi.fn(() => Promise.resolve({ data: {}, error: uploadError })),
    remove: vi.fn(() => Promise.resolve({ data: [], error: null })),
    getPublicUrl: vi.fn((p: string) => ({ data: { publicUrl: `https://abcd.supabase.co/storage/v1/object/public/avatars/${p}` } })),
  };
  storageFrom = vi.fn(() => bucket);
  vi.mocked(createAdminClient).mockReturnValue({ from: vi.fn(() => profiles), storage: { from: storageFrom } } as never);
}

const upload = (bytes: Uint8Array | null, name = 'avatar.webp', type = 'image/webp') => {
  const form = new FormData();
  if (bytes) form.append('file', new File([bytes as BlobPart], name, { type }));
  return POST(new Request('http://test/api/profile/avatar', { method: 'POST', body: form }));
};

beforeEach(() => {
  vi.mocked(getUser).mockResolvedValue(fakeUser({ id: UID }) as never);
  vi.mocked(rateLimit).mockResolvedValue({ success: true, remaining: 9 });
  vi.mocked(getProfile).mockResolvedValue({ avatar_url: OLD } as never);
  setup();
});

describe('POST /api/profile/avatar', () => {
  it('401 when signed out', async () => {
    vi.mocked(getUser).mockResolvedValue(null);
    expect((await upload(PNG)).status).toBe(401);
  });

  it('429 when rate limited', async () => {
    vi.mocked(rateLimit).mockResolvedValue({ success: false, remaining: 0 });
    expect((await upload(PNG)).status).toBe(429);
  });

  it('400 without a file, 413 over 2 MB', async () => {
    expect((await upload(null)).status).toBe(400);
    expect((await upload(new Uint8Array(2 * 1024 * 1024 + 1))).status).toBe(413);
    expect(bucket.upload).not.toHaveBeenCalled();
  });

  it('415 for non-images even when the name and Content-Type claim otherwise', async () => {
    const svg = new TextEncoder().encode('<svg onload="alert(1)"></svg>');
    const res = await readJson(await upload(svg, 'photo.png', 'image/png'));
    expect(res.status).toBe(415);
    expect(bucket.upload).not.toHaveBeenCalled();
  });

  it('stores the image in the caller’s own folder with the sniffed type, saves the URL, deletes the old one', async () => {
    const { status, body } = await readJson(await upload(PNG, 'whatever.webp', 'image/webp'));
    expect(status).toBe(200);
    expect(storageFrom).toHaveBeenCalledWith('avatars');
    const [path, , opts] = bucket.upload.mock.calls[0];
    expect(path).toMatch(new RegExp(`^${UID}/[0-9a-f]{16}\\.png$`));
    expect(opts).toEqual({ contentType: 'image/png', cacheControl: '31536000', upsert: false });
    const avatarUrl = (body as { avatarUrl: string }).avatarUrl;
    expect(avatarUrl).toBe(`https://abcd.supabase.co/storage/v1/object/public/avatars/${path}`);
    expect(profiles.update).toHaveBeenCalledWith({ avatar_url: avatarUrl });
    expect(profiles.eq).toHaveBeenCalledWith('id', UID);
    expect(bucket.remove).toHaveBeenCalledWith([`${UID}/0011223344556677.webp`]);
  });

  it('never deletes a previous URL that isn’t one of our avatars', async () => {
    vi.mocked(getProfile).mockResolvedValue({ avatar_url: 'https://evil.com/x.png' } as never);
    await upload(PNG);
    expect(bucket.remove).not.toHaveBeenCalled();
  });

  it('500 on storage failure (no profile write)', async () => {
    setup({ uploadError: { message: 'bucket not found' } });
    expect((await upload(PNG)).status).toBe(500);
    expect(profiles.update).not.toHaveBeenCalled();
  });

  it('500 on DB failure and removes the just-uploaded file (no orphans), keeps the old picture', async () => {
    setup({ dbError: { message: 'db' } });
    expect((await upload(PNG)).status).toBe(500);
    const newPath = bucket.upload.mock.calls[0][0];
    expect(bucket.remove).toHaveBeenCalledTimes(1);
    expect(bucket.remove).toHaveBeenCalledWith([newPath]);
  });
});

describe('DELETE /api/profile/avatar', () => {
  const del = () => DELETE();

  it('401 when signed out', async () => {
    vi.mocked(getUser).mockResolvedValue(null);
    expect((await del()).status).toBe(401);
  });

  it('clears the URL and deletes the stored file', async () => {
    const { status, body } = await readJson(await del());
    expect(status).toBe(200);
    expect(body).toEqual({ ok: true });
    expect(profiles.update).toHaveBeenCalledWith({ avatar_url: null });
    expect(bucket.remove).toHaveBeenCalledWith([`${UID}/0011223344556677.webp`]);
  });

  it('500 when the profile update fails (file kept)', async () => {
    setup({ dbError: { message: 'db' } });
    expect((await del()).status).toBe(500);
    expect(bucket.remove).not.toHaveBeenCalled();
  });
});
