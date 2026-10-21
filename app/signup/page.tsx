'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { PASSWORD_MIN, passwordProblem } from '@/lib/auth';
import { Spinner } from '@/components/ui/spinner';
import { AuthShell } from '@/components/auth/AuthShell';
import { GoogleButton } from '@/components/auth/GoogleButton';

// Create an account with email + password. Supabase emails a one-time
// verification link; after verifying, the user logs in with their password.
export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function signUp(e: React.FormEvent) {
    e.preventDefault();
    const problem = passwordProblem(password, confirm);
    if (problem) return setError(problem);
    setError(null);
    setBusy(true);
    const { data, error: err } = await createClient().auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/home`,
        // Copied into profiles.full_name by the handle_new_user trigger.
        data: { full_name: name.trim() || undefined },
      },
    });
    setBusy(false);
    if (err) return setError(err.message);
    // Email confirmation turned off in Supabase → already signed in.
    if (data.session) {
      router.push('/home');
      router.refresh();
      return;
    }
    // Same message whether or not the email already has an account, so the
    // page can't be used to discover who is registered.
    setSentTo(email.trim());
  }

  if (sentTo) {
    return (
      <AuthShell>
        <h1>Check your email ✉️</h1>
        <p className="sub">
          We sent a verification link to <b>{sentTo}</b>. Click it once to activate your account — after
          that you’ll log in with your email and password.
        </p>
        <p className="hint">
          Can’t find it? Check spam. Already verified? <Link href="/login">Log in</Link>.
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <h1>Create your Manch account</h1>
      <p className="sub">Free to start. One account for Post, Reels, Deals and Check.</p>

      <GoogleButton />

      <form onSubmit={signUp}>
        <label htmlFor="su-name">Full name</label>
        <input id="su-name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Asha Kumar" />

        <label htmlFor="su-email">Email</label>
        <input
          id="su-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
        />

        <label htmlFor="su-password">Password</label>
        <input
          id="su-password"
          type="password"
          autoComplete="new-password"
          required
          minLength={PASSWORD_MIN}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <p className="hint">At least {PASSWORD_MIN} characters, with letters and numbers.</p>

        <label htmlFor="su-confirm">Confirm password</label>
        <input
          id="su-confirm"
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

        <button type="submit" className="btn" style={{ width: '100%', justifyContent: 'center', marginTop: 16 }} disabled={busy}>
          {busy ? <Spinner /> : null} Create account
        </button>
      </form>

      <p className="hint" style={{ marginTop: 18, textAlign: 'center' }}>
        Already have an account? <Link href="/login">Log in</Link>
      </p>
    </AuthShell>
  );
}
