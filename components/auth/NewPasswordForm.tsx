'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { PASSWORD_MIN, passwordProblem } from '@/lib/auth';
import { Spinner } from '@/components/ui/spinner';

// Set a new password for the signed-in user (reset flow, or Profile → change
// password). Supabase requires an active session, which the reset email's
// link provides via /auth/callback.
export function NewPasswordForm({ submitLabel, onDone }: { submitLabel: string; onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const problem = passwordProblem(password, confirm);
    if (problem) return setError(problem);
    setError(null);
    setBusy(true);
    const { error: err } = await createClient().auth.updateUser({ password });
    setBusy(false);
    if (err) {
      setError(/different from the old/i.test(err.message) ? 'Choose a password you haven’t used here before.' : err.message);
      return;
    }
    setPassword('');
    setConfirm('');
    onDone();
  }

  return (
    <form onSubmit={save}>
      <label htmlFor="np-password">New password</label>
      <input
        id="np-password"
        type="password"
        autoComplete="new-password"
        required
        minLength={PASSWORD_MIN}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <p className="hint">At least {PASSWORD_MIN} characters, with letters and numbers.</p>
      <label htmlFor="np-confirm">Confirm new password</label>
      <input
        id="np-confirm"
        type="password"
        autoComplete="new-password"
        required
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
      />
      {error && (
        <p role="alert" style={{ color: 'var(--bad)', fontSize: 14, marginBottom: 0 }}>
          {error}
        </p>
      )}
      <button type="submit" className="btn" style={{ marginTop: 16 }} disabled={busy}>
        {busy ? <Spinner /> : null} {submitLabel}
      </button>
    </form>
  );
}
