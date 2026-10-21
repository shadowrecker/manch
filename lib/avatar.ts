// Profile-picture helpers shared by the upload API and its tests.

export const AVATAR_BUCKET = 'avatars';
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024; // must match the bucket's file_size_limit
/** Edge length of the square the browser crops/resizes to before uploading. */
export const AVATAR_SIZE = 256;

export type AvatarType = { mime: 'image/jpeg' | 'image/png' | 'image/webp'; ext: 'jpg' | 'png' | 'webp' };

/**
 * Identify an image by its leading bytes ("magic numbers"), never by the
 * filename or the client-declared Content-Type, which are trivially spoofed.
 * Returns null for anything that isn't a JPEG, PNG or WebP.
 */
export function sniffImageType(bytes: Uint8Array): AvatarType | null {
  const b = bytes;
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (
    b.length >= 8 &&
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => b[i] === v)
  ) {
    return { mime: 'image/png', ext: 'png' };
  }
  const ascii = (from: number, to: number) => String.fromCharCode(...b.subarray(from, to));
  if (b.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return { mime: 'image/webp', ext: 'webp' };
  return null;
}

/**
 * The storage path of an avatar URL we issued (`…/object/public/avatars/<path>`),
 * or null for anything else — so we only ever delete our own files.
 */
export function avatarPathFromUrl(url: string | null | undefined, supabaseUrl: string): string | null {
  if (!url || !supabaseUrl) return null;
  const prefix = `${supabaseUrl.replace(/\/$/, '')}/storage/v1/object/public/${AVATAR_BUCKET}/`;
  if (!url.startsWith(prefix)) return null;
  const path = decodeURIComponent(url.slice(prefix.length).split('?')[0]);
  return /^[0-9a-f-]{36}\/[a-z0-9]+\.(jpg|png|webp)$/.test(path) ? path : null;
}
