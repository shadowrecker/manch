'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Spinner } from '@/components/ui/spinner';
import { toast } from '@/components/ui/toast';
import { initials } from '@/lib/utils';
import { AVATAR_SIZE } from '@/lib/avatar';
import type { ApiError } from '@/lib/types';

/**
 * Center-crop to a square and resize to AVATAR_SIZE in the browser, so even a
 * 10 MB phone photo uploads as a ~20 KB image. WebP where the browser can
 * encode it, JPEG otherwise.
 */
async function toSquareImage(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('decode'));
      el.src = url;
    });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = AVATAR_SIZE;
    canvas.height = AVATAR_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas');
    ctx.drawImage(
      img,
      (img.naturalWidth - side) / 2,
      (img.naturalHeight - side) / 2,
      side,
      side,
      0,
      0,
      AVATAR_SIZE,
      AVATAR_SIZE,
    );
    const encode = (type: string) =>
      new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.9));
    const webp = await encode('image/webp');
    const blob = webp && webp.type === 'image/webp' ? webp : await encode('image/jpeg');
    if (!blob) throw new Error('encode');
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Profile → picture: choose, auto-crop, upload (POST /api/profile/avatar), or remove.
export function AvatarUpload({ initialUrl, name }: { initialUrl: string | null; name: string | null }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState(initialUrl);
  const [busy, setBusy] = useState<null | 'upload' | 'remove'>(null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow picking the same file again
    if (!file) return;
    setBusy('upload');
    try {
      let blob: Blob;
      try {
        blob = await toSquareImage(file);
      } catch {
        toast('Couldn’t read that image — try a JPG or PNG.');
        return;
      }
      const form = new FormData();
      form.append('file', blob, blob.type === 'image/webp' ? 'avatar.webp' : 'avatar.jpg');
      const res = await fetch('/api/profile/avatar', { method: 'POST', body: form });
      const data = (await res.json().catch(() => ({}))) as ApiError & { avatarUrl?: string };
      if (!res.ok || !data.avatarUrl) {
        toast(data.error ?? 'Could not upload your picture');
        return;
      }
      setUrl(data.avatarUrl);
      toast('Profile picture updated ✓');
      router.refresh(); // update the avatar in the top bar
    } catch {
      toast('Network error — please try again');
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    setBusy('remove');
    try {
      const res = await fetch('/api/profile/avatar', { method: 'DELETE' });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as ApiError;
        toast(data.error ?? 'Could not remove your picture');
        return;
      }
      setUrl(null);
      toast('Profile picture removed');
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="card">
      <h2>Profile picture</h2>
      <div className="row" style={{ alignItems: 'center', gap: 18 }}>
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element -- Supabase Storage URL, already 256px
          <img src={url} alt="Your profile picture" className="avatar-preview" width={88} height={88} />
        ) : (
          <div className="avatar-preview placeholder" aria-label="No profile picture">
            {initials(name)}
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="row">
            <button type="button" className="btn sm" onClick={() => input.current?.click()} disabled={busy !== null}>
              {busy === 'upload' ? (
                <>
                  <Spinner /> Uploading…
                </>
              ) : url ? (
                'Change picture'
              ) : (
                'Upload picture'
              )}
            </button>
            {url && (
              <button type="button" className="btn ghost sm" onClick={remove} disabled={busy !== null}>
                {busy === 'remove' ? <Spinner /> : null} Remove
              </button>
            )}
          </div>
          <p className="hint" style={{ margin: 0 }}>
            JPG, PNG or WebP. We crop it to a square automatically.
          </p>
        </div>
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={onPick}
          hidden
          aria-label="Choose a profile picture"
        />
      </div>
    </div>
  );
}
