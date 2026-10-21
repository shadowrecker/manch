import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Component test (jsdom). VariantCard renders an angle tag + body, splits off
// the free-tier watermark into its own footer line, and copies the FULL body
// (watermark included) to the clipboard.

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
  usePathname: () => '/post/generate',
  useSearchParams: () => new URLSearchParams(),
}));

const toast = vi.fn();
vi.mock('@/components/ui/toast', () => ({ toast: (...a: unknown[]) => toast(...a) }));

import { VariantCard } from '@/components/post/VariantCard';
import { WATERMARK_TEXT } from '@/lib/modules/post/entitlements';

beforeEach(() => {
  push.mockReset();
  toast.mockReset();
});

describe('<VariantCard>', () => {
  it('renders the angle label and the body', () => {
    render(<VariantCard angle="story" body="Closed a big deal today." />);
    expect(screen.getByText('Story')).toBeInTheDocument();
    expect(screen.getByText('Closed a big deal today.')).toBeInTheDocument();
  });

  it('maps each angle to its human label', () => {
    const { rerender } = render(<VariantCard angle="insight" body="x" />);
    expect(screen.getByText('Insight')).toBeInTheDocument();
    rerender(<VariantCard angle="opinion" body="x" />);
    expect(screen.getByText('Opinion')).toBeInTheDocument();
  });

  it('does NOT render a watermark line when the body has none', () => {
    const { container } = render(<VariantCard angle="story" body="No mark here." />);
    expect(container.querySelector('.watermark')).toBeNull();
  });

  it('splits the watermark into its own dashed footer line and trims it off the body', () => {
    const body = `My great post about growth.\n\n${WATERMARK_TEXT}`;
    const { container } = render(<VariantCard angle="story" body={body} />);
    const watermark = container.querySelector('.watermark');
    expect(watermark).not.toBeNull();
    expect(watermark).toHaveTextContent(WATERMARK_TEXT);
    // The post body shows only the content (watermark stripped, trailing ws trimmed).
    const postBody = container.querySelector('.post-body');
    expect(postBody).toHaveTextContent('My great post about growth.');
    expect(postBody?.textContent).not.toContain(WATERMARK_TEXT);
  });

  it('Edit button deep-links to /post/drafts', async () => {
    const user = userEvent.setup();
    render(<VariantCard angle="story" body="hi" />);
    await user.click(screen.getByRole('button', { name: /edit/i }));
    expect(push).toHaveBeenCalledWith('/post/drafts');
  });

  it('Copy writes the FULL body (incl. watermark) to the clipboard and toasts', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true, writable: true });
    const body = `Some post\n\n${WATERMARK_TEXT}`;
    render(<VariantCard angle="story" body={body} />);
    await user.click(screen.getByRole('button', { name: /^copy$/i }));
    expect(writeText).toHaveBeenCalledWith(body);
    expect(toast).toHaveBeenCalledWith(expect.stringMatching(/copied/i));
  });

  it('toasts a failure message when clipboard.writeText rejects', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    const user = userEvent.setup();
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true, writable: true });
    render(<VariantCard angle="insight" body="oops" />);
    await user.click(screen.getByRole('button', { name: /^copy$/i }));
    expect(writeText).toHaveBeenCalledWith('oops');
    expect(toast).toHaveBeenCalledWith(expect.stringMatching(/fail/i));
  });
});
