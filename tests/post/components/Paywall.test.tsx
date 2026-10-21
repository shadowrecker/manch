import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Component test (jsdom). Paywall is a presentational upgrade modal that links
// each paid tier to /settings/billing?plan=<plan> and calls onClose on dismiss.
// Post now uses the shared Manch Paywall (@/components/Paywall); Folio's Solo
// tier is the Manch Plus plan.

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/post/generate',
  useSearchParams: () => new URLSearchParams(),
}));

import { Paywall } from '@/components/Paywall';

describe('<Paywall>', () => {
  it('renders nothing when open is false', () => {
    const { container } = render(<Paywall open={false} onClose={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the three paid tiers as billing deep-links (plus/pro/team, not free)', () => {
    render(<Paywall open onClose={vi.fn()} />);
    const plus = screen.getByRole('link', { name: /plus/i });
    const pro = screen.getByRole('link', { name: /pro/i });
    const team = screen.getByRole('link', { name: /team/i });
    expect(plus).toHaveAttribute('href', '/settings/billing?plan=plus');
    expect(pro).toHaveAttribute('href', '/settings/billing?plan=pro');
    expect(team).toHaveAttribute('href', '/settings/billing?plan=team');
    // Free tier is filtered out — exactly 3 tier links.
    expect(screen.queryByRole('link', { name: /free/i })).toBeNull();
  });

  it('renders the default title and no message paragraph when none given', () => {
    const { container } = render(<Paywall open onClose={vi.fn()} />);
    expect(screen.getByRole('heading', { name: /upgrade/i })).toBeInTheDocument();
    expect(container.querySelector('p.muted')).toBeNull();
  });

  it('renders a custom title and message', () => {
    render(<Paywall open title="You hit your limit" message="Upgrade to keep going" onClose={vi.fn()} />);
    expect(screen.getByRole('heading', { name: /you hit your limit/i })).toBeInTheDocument();
    expect(screen.getByText('Upgrade to keep going')).toBeInTheDocument();
  });

  it('calls onClose when the "Maybe later" dismiss button is clicked', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<Paywall open onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: /maybe later/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when the backdrop (modal overlay) itself is clicked', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    const { container } = render(<Paywall open onClose={onClose} />);
    const overlay = container.querySelector('.modal') as HTMLElement;
    await user.click(overlay);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does NOT call onClose when clicking inside the box (event target is not the overlay)', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    const { container } = render(<Paywall open onClose={onClose} />);
    const box = container.querySelector('.box') as HTMLElement;
    await user.click(box);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('calls onClose when a tier link is clicked', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<Paywall open onClose={onClose} />);
    await user.click(screen.getByRole('link', { name: /plus/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
