import { describe, it, expect } from 'vitest';
import { avatarPathFromUrl, sniffImageType } from '@/lib/avatar';

const bytes = (...b: number[]) => new Uint8Array(b);
const ascii = (s: string) => new Uint8Array([...s].map((c) => c.charCodeAt(0)));

describe('sniffImageType (by content, not by name)', () => {
  it('recognises JPEG, PNG and WebP signatures', () => {
    expect(sniffImageType(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0))).toEqual({ mime: 'image/jpeg', ext: 'jpg' });
    expect(sniffImageType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))).toEqual({ mime: 'image/png', ext: 'png' });
    expect(sniffImageType(ascii('RIFF\u0000\u0000\u0000\u0000WEBPVP8 '))).toEqual({ mime: 'image/webp', ext: 'webp' });
  });

  it('rejects everything else — SVG, GIF, HTML, scripts, truncated headers', () => {
    for (const s of ['<svg xmlns="http://www.w3.org/2000/svg">', 'GIF89a......', '<html><script>', '#!/bin/sh', 'RIFF....WAVE']) {
      expect(sniffImageType(ascii(s))).toBeNull();
    }
    expect(sniffImageType(bytes(0xff, 0xd8))).toBeNull();
    expect(sniffImageType(bytes())).toBeNull();
  });
});

describe('avatarPathFromUrl (only ever delete our own files)', () => {
  const base = 'https://abcd.supabase.co';
  const uid = '11111111-2222-3333-4444-555555555555';

  it('extracts the path from a URL we issued', () => {
    expect(avatarPathFromUrl(`${base}/storage/v1/object/public/avatars/${uid}/ab12cd34ef567890.webp`, base)).toBe(
      `${uid}/ab12cd34ef567890.webp`,
    );
    expect(avatarPathFromUrl(`${base}/storage/v1/object/public/avatars/${uid}/ab12.jpg?t=1`, `${base}/`)).toBe(`${uid}/ab12.jpg`);
  });

  it('ignores foreign hosts, other buckets, traversal and junk', () => {
    expect(avatarPathFromUrl(`https://evil.com/storage/v1/object/public/avatars/${uid}/a.webp`, base)).toBeNull();
    expect(avatarPathFromUrl(`${base}/storage/v1/object/public/media-kits/${uid}/a.webp`, base)).toBeNull();
    expect(avatarPathFromUrl(`${base}/storage/v1/object/public/avatars/${uid}/../other/a.webp`, base)).toBeNull();
    expect(avatarPathFromUrl(`${base}/storage/v1/object/public/avatars/${uid}/a.svg`, base)).toBeNull();
    expect(avatarPathFromUrl(null, base)).toBeNull();
    expect(avatarPathFromUrl(`${base}/x`, '')).toBeNull();
  });
});
