import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Component test (jsdom). The invite email links to /settings/team/accept,
// which renders <AcceptInvite> and POSTs the token to /api/team/accept.

const push = vi.fn();
const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh }),
  usePathname: () => '/settings/team/accept',
  useSearchParams: () => new URLSearchParams(),
}));
const toast = vi.fn();
vi.mock('@/components/ui/toast', () => ({ toast: (...a: unknown[]) => toast(...a) }));

import { AcceptInvite } from '@/components/post/AcceptInvite';

function mockFetch(status: number, body: unknown) {
  const fn = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', fn);
  return fn;
}

beforeEach(() => {
  push.mockReset();
  toast.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

describe('<AcceptInvite>', () => {
  it('shows a missing-token message and no accept button without a token', () => {
    render(<AcceptInvite token="" />);
    expect(screen.getByText(/missing its token/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /accept/i })).toBeNull();
  });

  it('POSTs the token to /api/team/accept and routes to /settings/team on success', async () => {
    const fetchMock = mockFetch(200, { ok: true, team_id: 't1' });
    const user = userEvent.setup();
    render(<AcceptInvite token="tok-1" />);
    await user.click(screen.getByRole('button', { name: /accept my seat/i }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/settings/team'));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/team/accept');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ token: 'tok-1' });
  });

  it('maps a server error code to a friendly toast and stays on the page', async () => {
    mockFetch(409, { error: 'team_full' });
    const user = userEvent.setup();
    render(<AcceptInvite token="tok-1" />);
    await user.click(screen.getByRole('button', { name: /accept my seat/i }));

    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.stringMatching(/no free seats/i)));
    expect(push).not.toHaveBeenCalled();
  });
});
