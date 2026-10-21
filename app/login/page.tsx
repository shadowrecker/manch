'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { safeNext } from '@/lib/auth';
import { toast } from '@/components/ui/toast';
import { Spinner } from '@/components/ui/spinner';
import { AuthShell } from '@/components/auth/AuthShell';
import { GoogleButton } from '@/components/auth/GoogleButton';

// Log in with the email + password chosen at sign-up. Email verification
// happens once, at sign-up; after that no email is needed to log in.
export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unconfirmed, setUnconfirmed] = useState(false);

  async function logIn(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setUnconfirmed(false);
    setBusy(true);
    const { error: err } = await createClient().auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (err) {
      if (/not confirmed/i.test(err.message)) {
        setUnconfirmed(true);
        setError('Please verify your email first — check your inbox for the link we sent when you signed up.');
      } else if (/invalid login credentials/i.test(err.message)) {
        setError('Incorrect email or password.');
      } else {
        setError(err.message);
      }
      return;
    }
    const next = safeNext(new URLSearchParams(window.location.search).get('next'));
    router.push(next);
    router.refresh();
  }

  async function resendVerification() {
    setBusy(true);
    const { error: err } = await createClient().auth.resend({
      type: 'signup',
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/home` },
    });
    setBusy(false);
    toast(err ? err.message : 'Verification email sent — check your inbox');
  }

  return (
    <AuthShell>
      <h1>Welcome to Manch</h1>
      <p className="sub">Log in to Post, Reels, Deals and Check.</p>

      <GoogleButton />

      <form onSubmit={logIn}>
        <label htmlFor="login-email">Email</label>
        <input
          id="login-email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
          <label htmlFor="login-password">Password</label>
          <Link href="/forgot-password" className="hint">
            Forgot password?
          </Link>
        </div>
        <input
          id="login-password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {error && (
          <p role="alert" style={{ color: 'var(--bad)', fontSize: 14, marginBottom: 0 }}>
            {error}
          </p>
        )}
        {unconfirmed && (
          <button type="button" className="btn ghost sm" style={{ marginTop: 8 }} onClick={resendVerification} disabled={busy}>
            Resend verification email
          </button>
        )}

        <button type="submit" className="btn" style={{ width: '100%', justifyContent: 'center', marginTop: 16 }} disabled={busy}>
          {busy ? <Spinner /> : null} Log in
        </button>
      </form>

      <p className="hint" style={{ marginTop: 18, textAlign: 'center' }}>
        New to Manch? <Link href="/signup">Create an account</Link>
      </p>
    </AuthShell>
  );
}
