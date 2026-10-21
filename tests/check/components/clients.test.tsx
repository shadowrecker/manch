import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('next/navigation', () => ({ usePathname: () => '/check', useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

import { ApiConsoleClient } from '@/components/check/ApiConsoleClient';
import { UpgradeCta } from '@/components/check/UpgradeCta';

function mockFetch(handler: (url: string, init?: RequestInit) => Response) {
  const fn = vi.fn((url: string, init?: RequestInit) => Promise.resolve(handler(url, init)));
  vi.stubGlobal('fetch', fn);
  return fn;
}
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });
beforeEach(() => vi.unstubAllGlobals());

describe('<ApiConsoleClient>', () => {
  it('creates a key via /api/check/keys and shows the raw key exactly once', async () => {
    const fetchFn = mockFetch(() => json({ id: 'k1', key: 'tck_secret123', monthly_quota: 10000 }));
    const user = userEvent.setup();
    render(<ApiConsoleClient />);
    await user.type(screen.getByPlaceholderText(/Daily Herald/i), 'The Daily Herald');
    await user.click(screen.getByRole('button', { name: /Create API key/i }));
    expect(await screen.findByText('tck_secret123')).toBeInTheDocument();
    expect(screen.getByText(/shown once/i)).toBeInTheDocument();
    expect(fetchFn.mock.calls[0][0]).toBe('/api/check/keys');
  });

  it('shows the curl quickstart for /api/check', () => {
    render(<ApiConsoleClient />);
    expect(screen.getByText(/\/api\/check/)).toBeInTheDocument();
  });
});

describe('<UpgradeCta>', () => {
  it('opens the shared Manch paywall offering Plus, linking to /settings/billing', async () => {
    const user = userEvent.setup();
    render(<UpgradeCta />);
    expect(screen.queryByText(/Maybe later/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Unlock photos/i }));
    const plus = screen.getByRole('link', { name: /Plus/ });
    expect(plus).toHaveAttribute('href', '/settings/billing?plan=plus');
    await user.click(screen.getByRole('button', { name: /Maybe later/i }));
    expect(screen.queryByText(/Maybe later/i)).not.toBeInTheDocument();
  });
});
