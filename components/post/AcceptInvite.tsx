'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Spinner } from '@/components/ui/spinner';
import { toast } from '@/components/ui/toast';

// Accept a team seat from an invite link (/settings/team/accept?token=…). The
// invite email links here; the signed-in invitee confirms and we POST the token
// to /api/team/accept, which enforces seat capacity server-side.

const ERRORS: Record<string, string> = {
  invite_invalid_or_used: 'This invite link is invalid or has already been used.',
  already_on_a_team: 'You are already on another team.',
  team_full: 'This team has no free seats left. Ask the owner to free one up.',
  team_not_found: 'This team no longer exists.',
};

export function AcceptInvite({ token }: { token: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function accept() {
    setBusy(true);
    try {
      const res = await fetch('/api/team/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        toast(ERRORS[data.error ?? ''] ?? 'Could not accept the invite. Please try again.');
        return;
      }
      toast('Welcome to the team');
      router.push('/settings/team');
      router.refresh();
    } catch {
      toast('Network error — please try again');
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <div className="card">
        <h1>Join a team</h1>
        <div className="empty">This invite link is missing its token. Ask the owner to resend it.</div>
      </div>
    );
  }

  return (
    <div className="card">
      <h1>Join your team on Manch</h1>
      <p className="sub">
        A teammate invited you to share their brand voice. Accept to take your seat.
      </p>
      <div className="row" style={{ marginTop: 14 }}>
        <button className="btn" onClick={accept} disabled={busy}>
          {busy ? (
            <>
              <Spinner /> Joining…
            </>
          ) : (
            'Accept my seat'
          )}
        </button>
      </div>
    </div>
  );
}
