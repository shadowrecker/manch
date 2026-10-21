'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Spinner } from '@/components/ui/spinner';
import { toast } from '@/components/ui/toast';
import { initials } from '@/lib/utils';
import type { TeamRow, TeamInviteRow } from '@/lib/db/types';
import type { TeamMember } from '@/lib/modules/post/team';

// Team-lite settings UI (PRD §1; F-07). Billing + seat invites only — no
// approval workflow or analytics. Entitlements and seat math are enforced on the
// server; this component just renders state and POSTs/ DELETEs to /api/team/*.

export function TeamClient({
  team,
  members,
  invites,
  seats,
  isOwner,
}: {
  team: TeamRow;
  members: TeamMember[];
  invites: TeamInviteRow[];
  seats: number;
  isOwner: boolean;
}) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  // Tracks which invite id is being revoked so only that button spins.
  const [revoking, setRevoking] = useState<string | null>(null);

  // A pending invite holds a seat until accepted/revoked.
  const seatsUsed = members.length + invites.length;
  const seatsFull = seatsUsed >= seats;

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    const value = email.trim();
    if (!value) {
      toast('Enter an email to invite');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/team/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: value }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        toast(inviteError(data.error));
        return;
      }
      toast(`Invite sent to ${value}`);
      setEmail('');
      router.refresh();
    } catch {
      toast('Could not send invite. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function revoke(inviteId: string) {
    setRevoking(inviteId);
    try {
      const res = await fetch('/api/team/invite', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteId }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        toast('Could not revoke invite.');
        return;
      }
      toast('Invite revoked');
      router.refresh();
    } catch {
      toast('Could not revoke invite. Please try again.');
    } finally {
      setRevoking(null);
    }
  }

  return (
    <>
      <div className="card">
        <h1>{team.name}</h1>
        <p className="sub">
          Shared brand voice for your team. Invite up to {seats} teammates.
        </p>

        <div className="stat">
          <div className="s">
            <b>
              {seatsUsed} / {seats}
            </b>
            <span>Seats used</span>
          </div>
          <div className="s">
            <b>{members.length}</b>
            <span>Members</span>
          </div>
          <div className="s">
            <b>{invites.length}</b>
            <span>Pending invites</span>
          </div>
        </div>
      </div>

      {/* Members */}
      <div className="card">
        <h2>Members</h2>
        {members.length === 0 ? (
          <div className="empty">No members yet.</div>
        ) : (
          members.map((m) => (
            <div
              key={m.id}
              className="row"
              style={{ justifyContent: 'space-between', alignItems: 'center', padding: '10px 0' }}
            >
              <div className="row" style={{ alignItems: 'center', gap: 10 }}>
                <span className="li-av" aria-hidden>
                  {initials(m.full_name)}
                </span>
                <div>
                  <div style={{ fontWeight: 700 }}>{m.full_name || 'Teammate'}</div>
                  <div className="hint">{m.headline || 'No headline yet'}</div>
                </div>
              </div>
              {m.is_owner && <span className="badge-voice">Owner</span>}
            </div>
          ))
        )}
      </div>

      {/* Pending invites — owner only */}
      {isOwner && (
        <div className="card">
          <h2>Pending invites</h2>
          {invites.length === 0 ? (
            <div className="empty">No pending invites.</div>
          ) : (
            invites.map((inv) => (
              <div
                key={inv.id}
                className="row"
                style={{ justifyContent: 'space-between', alignItems: 'center', padding: '10px 0' }}
              >
                <div>
                  <div style={{ fontWeight: 600 }}>{inv.email}</div>
                  <div className="hint">Invited · waiting to accept</div>
                </div>
                <button
                  type="button"
                  className="btn ghost sm"
                  disabled={revoking === inv.id}
                  onClick={() => revoke(inv.id)}
                >
                  {revoking === inv.id ? (
                    <>
                      <Spinner /> Revoking…
                    </>
                  ) : (
                    'Revoke'
                  )}
                </button>
              </div>
            ))
          )}

          {/* Invite by email */}
          <form className="row" style={{ marginTop: 14, alignItems: 'center' }} onSubmit={invite}>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="teammate@company.com"
              aria-label="Invite teammate by email"
              disabled={busy || seatsFull}
              style={{ flex: 1, minWidth: 220 }}
            />
            <button type="submit" className="btn" disabled={busy || seatsFull}>
              {busy ? (
                <>
                  <Spinner /> Sending…
                </>
              ) : (
                'Invite teammate'
              )}
            </button>
          </form>
          {seatsFull && (
            <p className="hint" style={{ color: 'var(--warn)' }}>
              All {seats} seats are in use. Revoke a pending invite to free one up.
            </p>
          )}
        </div>
      )}
    </>
  );
}

/**
 * Shown to Team-plan users who don't have a team yet. Creates a team via
 * POST /api/team, then refreshes so the page re-renders with the full TeamClient.
 */
export function CreateTeamForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const value = name.trim();
    if (!value) {
      toast('Give your team a name');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: value }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        toast(data.error === 'team_plan_required' ? 'Team plan required.' : 'Could not create team.');
        return;
      }
      toast('Team created');
      router.refresh();
    } catch {
      toast('Could not create team. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h1>Create your team</h1>
      <p className="sub">Name your workspace, then invite up to 10 teammates.</p>
      <form onSubmit={create}>
        <label htmlFor="team-name">Team name</label>
        <input
          id="team-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Acme Growth"
          disabled={busy}
        />
        <div className="row" style={{ marginTop: 14 }}>
          <button type="submit" className="btn" disabled={busy}>
            {busy ? (
              <>
                <Spinner /> Creating…
              </>
            ) : (
              'Create team'
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

/** Map server error codes to friendly toasts. */
function inviteError(code?: string): string {
  switch (code) {
    case 'invalid_email':
      return 'That email looks invalid.';
    case 'no_seats_available':
      return 'No seats available. Revoke a pending invite first.';
    case 'already_invited':
      return 'That email already has a pending invite.';
    case 'not_team_owner':
      return 'Only the team owner can send invites.';
    default:
      return 'Could not send invite. Please try again.';
  }
}
