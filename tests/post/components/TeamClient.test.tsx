import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { TeamRow, TeamInviteRow } from '@/lib/db/types';
import type { TeamMember } from '@/lib/modules/post/team';

// Component test (jsdom). TeamClient renders members, seat usage and pending
// invites; the invite form POSTs /api/team/invite with the email. CreateTeamForm
// (a second export) POSTs /api/team with a name.

const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh }),
  usePathname: () => '/settings/team',
  useSearchParams: () => new URLSearchParams(),
}));

const toast = vi.fn();
vi.mock('@/components/ui/toast', () => ({ toast: (...a: unknown[]) => toast(...a) }));

import { TeamClient, CreateTeamForm } from '@/components/post/TeamClient';

function mockFetch(impl: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const fn = vi.fn(impl);
  vi.stubGlobal('fetch', fn);
  return fn;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const team: TeamRow = {
  id: 't1',
  name: 'Acme Growth',
  owner_id: 'owner-1',
  brand_voice: null,
  seats: 10,
  created_at: '2026-01-01T00:00:00Z',
};

const members: TeamMember[] = [
  { id: 'owner-1', full_name: 'Asha Owner', headline: 'Founder', is_owner: true },
  { id: 'm2', full_name: 'Ben Member', headline: 'Engineer', is_owner: false },
];

const invites: TeamInviteRow[] = [
  { id: 'inv1', team_id: 't1', email: 'pending@acme.com', token: 'tok', status: 'pending', created_at: '2026-01-02T00:00:00Z' },
];

beforeEach(() => {
  refresh.mockReset();
  toast.mockReset();
  vi.unstubAllGlobals();
});

describe('<TeamClient>', () => {
  it('renders the team name, seat usage, members and pending invites (owner view)', () => {
    render(<TeamClient team={team} members={members} invites={invites} seats={10} isOwner />);
    expect(screen.getByRole('heading', { name: /acme growth/i })).toBeInTheDocument();
    // seatsUsed = members(2) + invites(1) = 3 / 10
    expect(screen.getByText('3 / 10')).toBeInTheDocument();
    // Members
    expect(screen.getByText('Asha Owner')).toBeInTheDocument();
    expect(screen.getByText('Ben Member')).toBeInTheDocument();
    expect(screen.getByText('Owner')).toBeInTheDocument();
    // Pending invite email
    expect(screen.getByText('pending@acme.com')).toBeInTheDocument();
  });

  it('hides the pending-invites section and invite form for non-owners', () => {
    render(<TeamClient team={team} members={members} invites={invites} seats={10} isOwner={false} />);
    expect(screen.queryByRole('heading', { name: /pending invites/i })).toBeNull();
    expect(screen.queryByLabelText(/invite teammate by email/i)).toBeNull();
  });

  it('shows the empty members state when there are no members', () => {
    render(<TeamClient team={team} members={[]} invites={[]} seats={10} isOwner />);
    expect(screen.getByText(/no members yet/i)).toBeInTheDocument();
    expect(screen.getByText(/no pending invites/i)).toBeInTheDocument();
  });

  it('the invite form POSTs /api/team/invite with the email and refreshes on success', async () => {
    const fetchMock = mockFetch(() => jsonResponse({ ok: true }));
    const user = userEvent.setup();
    render(<TeamClient team={team} members={members} invites={[]} seats={10} isOwner />);

    await user.type(screen.getByLabelText(/invite teammate by email/i), 'new@acme.com');
    await user.click(screen.getByRole('button', { name: /invite teammate/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/team/invite');
    expect((init as RequestInit).method).toBe('POST');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ email: 'new@acme.com' });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(toast).toHaveBeenCalledWith(expect.stringMatching(/invite sent to new@acme\.com/i));
  });

  it('does not POST an invite when the email is empty', async () => {
    const fetchMock = mockFetch(() => jsonResponse({ ok: true }));
    const user = userEvent.setup();
    render(<TeamClient team={team} members={members} invites={[]} seats={10} isOwner />);
    await user.click(screen.getByRole('button', { name: /invite teammate/i }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith(expect.stringMatching(/enter an email/i));
  });

  it('maps a server error code to a friendly invite toast', async () => {
    mockFetch(() => jsonResponse({ ok: false, error: 'already_invited' }, 200));
    const user = userEvent.setup();
    render(<TeamClient team={team} members={members} invites={[]} seats={10} isOwner />);
    await user.type(screen.getByLabelText(/invite teammate by email/i), 'dupe@acme.com');
    await user.click(screen.getByRole('button', { name: /invite teammate/i }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.stringMatching(/already has a pending invite/i)));
    expect(refresh).not.toHaveBeenCalled();
  });

  it('disables the invite form and warns when all seats are in use', () => {
    // 2 members + 0 invites with seats=2 → full.
    render(<TeamClient team={team} members={members} invites={[]} seats={2} isOwner />);
    expect(screen.getByLabelText(/invite teammate by email/i)).toBeDisabled();
    expect(screen.getByText(/all 2 seats are in use/i)).toBeInTheDocument();
  });

  it('Revoke DELETEs /api/team/invite with the invite id', async () => {
    const fetchMock = mockFetch(() => jsonResponse({ ok: true }));
    const user = userEvent.setup();
    render(<TeamClient team={team} members={members} invites={invites} seats={10} isOwner />);

    await user.click(screen.getByRole('button', { name: /revoke/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/team/invite');
    expect((init as RequestInit).method).toBe('DELETE');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ inviteId: 'inv1' });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });
});

describe('<CreateTeamForm>', () => {
  it('POSTs /api/team with a name and refreshes on success', async () => {
    const fetchMock = mockFetch(() => jsonResponse({ ok: true }));
    const user = userEvent.setup();
    render(<CreateTeamForm />);

    await user.type(screen.getByLabelText(/team name/i), 'My Squad');
    await user.click(screen.getByRole('button', { name: /create team/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/team');
    expect((init as RequestInit).method).toBe('POST');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ name: 'My Squad' });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(toast).toHaveBeenCalledWith(expect.stringMatching(/team created/i));
  });

  it('does not POST when the team name is empty', async () => {
    const fetchMock = mockFetch(() => jsonResponse({ ok: true }));
    const user = userEvent.setup();
    render(<CreateTeamForm />);
    await user.click(screen.getByRole('button', { name: /create team/i }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith(expect.stringMatching(/give your team a name/i));
  });

  it('toasts the team_plan_required message on that error code', async () => {
    mockFetch(() => jsonResponse({ ok: false, error: 'team_plan_required' }, 200));
    const user = userEvent.setup();
    render(<CreateTeamForm />);
    await user.type(screen.getByLabelText(/team name/i), 'My Squad');
    await user.click(screen.getByRole('button', { name: /create team/i }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.stringMatching(/team plan required/i)));
    expect(refresh).not.toHaveBeenCalled();
  });
});
