import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const toPng = vi.fn().mockResolvedValue('data:image/png;base64,xxx');
vi.mock('html-to-image', () => ({ toPng: (...a: unknown[]) => toPng(...a) }));
vi.mock('posthog-js', () => ({ default: { capture: vi.fn(), __loaded: false } }));
const toast = vi.fn();
vi.mock('@/components/ui/toast', () => ({ toast: (...a: unknown[]) => toast(...a) }));

import { CaptionPanel } from '@/components/reels/CaptionPanel';

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  toPng.mockClear();
  toast.mockClear();
  fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ caption: 'नमस्ते दोस्तों #reels' }), { status: 200 }),
  );
  vi.stubGlobal('fetch', fetchMock);
});

describe('<CaptionPanel>', () => {
  it('fetches and renders the native-script caption with the handle', async () => {
    render(<CaptionPanel languageCode="hi" platform="instagram" context="my script" handle="anjali" onClose={vi.fn()} />);
    expect(await screen.findByText('नमस्ते दोस्तों #reels')).toBeInTheDocument();
    expect(screen.getByText('@anjali')).toBeInTheDocument();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/reels/caption');
    expect(JSON.parse(init.body as string)).toMatchObject({
      languageCode: 'hi',
      platform: 'instagram',
      context: 'my script',
    });
  });

  it('download triggers an image export via html-to-image', async () => {
    const user = userEvent.setup();
    render(<CaptionPanel languageCode="ta" platform="moj" context="x" handle={null} onClose={vi.fn()} />);
    await screen.findByText('नमस्ते दोस्तों #reels');
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    await user.click(screen.getByRole('button', { name: /download image/i }));
    await waitFor(() => expect(toPng).toHaveBeenCalled());
    clickSpy.mockRestore();
  });

  it('close calls onClose', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<CaptionPanel languageCode="hi" platform="instagram" context="x" handle={null} onClose={onClose} />);
    await screen.findByText('नमस्ते दोस्तों #reels');
    await user.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
