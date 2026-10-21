import { NextResponse } from 'next/server';
import { getUser } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getProfile } from '@/lib/db/queries';
import { env } from '@/lib/env';
import { rateLimit } from '@/lib/ratelimit';
import { randomId } from '@/lib/utils';
import { AVATAR_BUCKET, AVATAR_MAX_BYTES, avatarPathFromUrl, sniffImageType } from '@/lib/avatar';
import { captureException, log } from '@/lib/observability';
import type { ApiError } from '@/lib/types';

export const runtime = 'nodejs';

// POST /api/profile/avatar   multipart/form-data { file }  -> 200 { avatarUrl }
// DELETE /api/profile/avatar                              -> 200 { ok: true }
//
// The server is the only writer to the `avatars` bucket (service role): it
// checks the real image type from the file bytes (JPEG / PNG / WebP only) and
// the size, stores it under the caller's own folder with a fresh random name
// (so the URL changes and browsers never show a stale cached picture), points
// profiles.avatar_url at it, and deletes the previous picture.

async function removeOld(sb: ReturnType<typeof createAdminClient>, url: string | null | undefined) {
  const path = avatarPathFromUrl(url, env.supabaseUrl);
  if (!path) return;
  const { error } = await sb.storage.from(AVATAR_BUCKET).remove([path]);
  if (error) log.warn('avatar: could not delete previous file', { path, error: error.message });
}

export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json<ApiError>({ error: 'unauthorized' }, { status: 401 });

  const rl = await rateLimit(`avatar:${user.id}`, { limit: 10, windowSeconds: 600 });
  if (!rl.success) {
    return NextResponse.json<ApiError>({ error: 'Too many uploads — try again in a few minutes.', code: 'rate_limited' }, { status: 429 });
  }

  let file: File | null = null;
  try {
    const form = await req.formData();
    const f = form.get('file');
    file = f instanceof File ? f : null;
  } catch {
    // fall through to the 400 below
  }
  if (!file || file.size === 0) {
    return NextResponse.json<ApiError>({ error: 'Choose an image to upload.', code: 'no_file' }, { status: 400 });
  }
  if (file.size > AVATAR_MAX_BYTES) {
    return NextResponse.json<ApiError>({ error: 'Image is too large (max 2 MB).', code: 'too_large' }, { status: 413 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniffImageType(bytes);
  if (!type) {
    return NextResponse.json<ApiError>({ error: 'Use a JPG, PNG or WebP image.', code: 'bad_type' }, { status: 415 });
  }

  const sb = createAdminClient();
  const path = `${user.id}/${randomId(8)}.${type.ext}`;
  const { error: upErr } = await sb.storage
    .from(AVATAR_BUCKET)
    .upload(path, bytes, { contentType: type.mime, cacheControl: '31536000', upsert: false });
  if (upErr) {
    captureException(upErr, { route: 'POST /api/profile/avatar', userId: user.id });
    return NextResponse.json<ApiError>({ error: 'Could not upload your picture.' }, { status: 500 });
  }

  const avatarUrl = sb.storage.from(AVATAR_BUCKET).getPublicUrl(path).data.publicUrl;
  const previous = (await getProfile(user.id))?.avatar_url;
  const { error: dbErr } = await sb.from('profiles').update({ avatar_url: avatarUrl }).eq('id', user.id);
  if (dbErr) {
    await sb.storage.from(AVATAR_BUCKET).remove([path]); // don't leave an orphan
    captureException(dbErr, { route: 'POST /api/profile/avatar', userId: user.id });
    return NextResponse.json<ApiError>({ error: 'Could not save your picture.' }, { status: 500 });
  }

  await removeOld(sb, previous);
  return NextResponse.json({ avatarUrl });
}

export async function DELETE() {
  const user = await getUser();
  if (!user) return NextResponse.json<ApiError>({ error: 'unauthorized' }, { status: 401 });

  const sb = createAdminClient();
  const previous = (await getProfile(user.id))?.avatar_url;
  const { error } = await sb.from('profiles').update({ avatar_url: null }).eq('id', user.id);
  if (error) {
    captureException(error, { route: 'DELETE /api/profile/avatar', userId: user.id });
    return NextResponse.json<ApiError>({ error: 'Could not remove your picture.' }, { status: 500 });
  }
  await removeOld(sb, previous);
  return NextResponse.json({ ok: true });
}
