'use client';

import Link from 'next/link';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Spinner } from '@/components/ui/spinner';
import { AuthShell } from '@/components/auth/AuthShell';

// Email a password-reset link. The link signs the user in via /auth/callback
// and lands on /reset-password to choose a new password.
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await createClient().auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });
    setBusy(false);
    // Rate limits are worth surfacing; otherwise always show the same message so
    // the page can't reveal which emails have accounts.
    if (err && /rate limit|too many/i.test(err.message)) return setError('Too many requests — please wait a few minutes.');
    setSent(true);
  }

  return (
    <AuthShell>
      <h1>Reset your password</h1>
      {sent ? (
        <p className="sub">
          If an account exists for <b>{email.trim()}</b>, we’ve emailed a link to set a new password. It
          works once and expires after an hour.
        </p>
      ) : (
        <form onSubmit={send}>
          <p className="sub">Enter your account email and we’ll send you a reset link.</p>
          <label htmlFor="fp-email">Email</label>
          <input
            id="fp-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
          {error && (
            <p role="alert" style={{ color: 'var(--bad)', fontSize: 14, marginBottom: 0 }}>
              {error}
            </p>
          )}
          <button type="submit" className="btn" style={{ width: '100%', justifyContent: 'center', marginTop: 16 }} disabled={busy}>
            {busy ? <Spinner /> : null} Send reset link
          </button>
        </form>
      )}
      <p className="hint" style={{ marginTop: 18, textAlign: 'center' }}>
        Remembered it? <Link href="/login">Log in</Link>
      </p>
    </AuthShell>
  );
}
