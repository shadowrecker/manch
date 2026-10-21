import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
const toast = vi.fn();
vi.mock('@/components/ui/toast', () => ({ toast: (m: string) => toast(m) }));

import { AvatarUpload } from '@/components/AvatarUpload';

// jsdom can't decode images or draw on canvas: stand in for both so the
// crop/resize path runs. `decodes` controls whether the "image" loads.
let decodes = true;
const drawImage = vi.fn();
class FakeImage {
  naturalWidth = 1200;
  naturalHeight = 800;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  set src(_v: string) {
    queueMicrotask(() => (decodes ? this.onload?.() : this.onerror?.()));
  }
}

beforeEach(() => {
  decodes = true;
  toast.mockReset();
  refresh.mockReset();
  drawImage.mockReset();
  vi.stubGlobal('Image', FakeImage);
  URL.createObjectURL = vi.fn(() => 'blob:x');
  URL.revokeObjectURL = vi.fn();
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ drawImage })) as never;
  HTMLCanvasElement.prototype.toBlob = function (cb: BlobCallback, type?: string) {
    cb(new Blob(['img'], { type: type ?? 'image/png' }));
  };
});
afterEach(() => vi.unstubAllGlobals());

function mockFetch(status: number, body: unknown) {
  const fn = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', fn);
  return fn;
}

const pick = async () =>
  userEvent.upload(screen.getByLabelText(/choose a profile picture/i), new File(['x'], 'me.jpg', { type: 'image/jpeg' }));

describe('<AvatarUpload>', () => {
  it('shows initials when there is no picture', () => {
    render(<AvatarUpload initialUrl={null} name="Asha Kumar" />);
    expect(screen.getByLabelText(/no profile picture/i)).toHaveTextContent('AK');
    expect(screen.getByRole('button', { name: /upload picture/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument();
  });

  it('center-crops to a 256px square, uploads WebP, shows it and refreshes the top bar', async () => {
    const fetchFn = mockFetch(200, { avatarUrl: 'https://x.supabase.co/new.webp' });
    render(<AvatarUpload initialUrl={null} name="Asha" />);
    await pick();
    await waitFor(() => expect(screen.getByAltText(/your profile picture/i)).toHaveAttribute('src', 'https://x.supabase.co/new.webp'));
    // 1200x800 source → centre 800x800 square at x=200 → 256x256 canvas
    expect(drawImage).toHaveBeenCalledWith(expect.any(FakeImage), 200, 0, 800, 800, 0, 0, 256, 256);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe('/api/profile/avatar');
    expect(init?.method).toBe('POST');
    expect(((init?.body as FormData).get('file') as File).type).toBe('image/webp');
    expect(refresh).toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith('Profile picture updated ✓');
  });

  it('falls back to JPEG when the browser cannot encode WebP', async () => {
    HTMLCanvasElement.prototype.toBlob = function (cb: BlobCallback, type?: string) {
      cb(new Blob(['img'], { type: type === 'image/webp' ? 'image/png' : type }));
    };
    const fetchFn = mockFetch(200, { avatarUrl: 'https://x/a.jpg' });
    render(<AvatarUpload initialUrl={null} name="A" />);
    await pick();
    await waitFor(() => expect(fetchFn).toHaveBeenCalled());
    expect(((fetchFn.mock.calls[0][1]?.body as FormData).get('file') as File).type).toBe('image/jpeg');
  });

  it('a file the browser cannot read is never uploaded', async () => {
    decodes = false;
    const fetchFn = mockFetch(200, {});
    render(<AvatarUpload initialUrl={null} name="A" />);
    await pick();
    await waitFor(() => expect(toast).toHaveBeenCalledWith('Couldn’t read that image — try a JPG or PNG.'));
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('shows server errors', async () => {
    mockFetch(415, { error: 'Use a JPG, PNG or WebP image.' });
    render(<AvatarUpload initialUrl={null} name="A" />);
    await pick();
    await waitFor(() => expect(toast).toHaveBeenCalledWith('Use a JPG, PNG or WebP image.'));
  });

  it('removes the picture', async () => {
    const fetchFn = mockFetch(200, { ok: true });
    render(<AvatarUpload initialUrl="https://x/old.webp" name="Asha Kumar" />);
    await userEvent.click(screen.getByRole('button', { name: /remove/i }));
    await waitFor(() => expect(screen.getByLabelText(/no profile picture/i)).toBeInTheDocument());
    expect(fetchFn).toHaveBeenCalledWith('/api/profile/avatar', { method: 'DELETE' });
    expect(refresh).toHaveBeenCalled();
  });
});
