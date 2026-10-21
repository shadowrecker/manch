'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { toast } from '@/components/ui/toast';
import { Spinner } from '@/components/ui/spinner';

// One sign-in for all of Manch. Three methods via the browser Supabase client:
// (a) email magic link, (b) Google OAuth, (c) phone OTP. Magic-link + Google
// land on /auth/callback to exchange the code; phone OTP verifies inline and
// then routes to /home.
export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [email, setEmail] = useState('');
  const [emailSent, setEmailSent] = useState(false);

  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);

  const [busy, setBusy] = useState<null | 'email' | 'google' | 'phone' | 'verify'>(null);

  const callbackUrl = () =>
    typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : '/auth/callback';

  async function sendMagicLink() {
    if (!email.trim()) return toast('Enter your email');
    setBusy('email');
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: callbackUrl() },
    });
    setBusy(null);
    if (error) return toast(error.message);
    setEmailSent(true);
    toast('Magic link sent — check your inbox');
  }

  async function signInWithGoogle() {
    setBusy('google');
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: callbackUrl() },
    });
    // On success the browser is redirected to Google; we only reach here on error.
    if (error) {
      setBusy(null);
      toast(error.message);
    }
  }

  async function sendPhoneOtp() {
    if (!phone.trim()) return toast('Enter your phone number');
    setBusy('phone');
    const { error } = await supabase.auth.signInWithOtp({ phone: phone.trim() });
    setBusy(null);
    if (error) return toast(error.message);
    setOtpSent(true);
    toast('OTP sent via SMS');
  }

  async function verifyPhoneOtp() {
    if (!otp.trim()) return toast('Enter the 6-digit code');
    setBusy('verify');
    const { error } = await supabase.auth.verifyOtp({
      phone: phone.trim(),
      token: otp.trim(),
      type: 'sms',
    });
    setBusy(null);
    if (error) return toast(error.message);
    router.push('/home');
  }

  return (
    <>
      <header className="top">
        <div className="logo">
          <span className="mark">म</span> Manch
        </div>
      </header>

      <div className="wrap" style={{ maxWidth: 460 }}>
        <div className="card">
          <h1>Welcome to Manch</h1>
          <p className="sub">One account for Post, Reels, Deals and Check.</p>

          {/* Google OAuth */}
          <button
            className="btn ghost"
            style={{ width: '100%', justifyContent: 'center' }}
            onClick={signInWithGoogle}
            disabled={busy !== null}
          >
            {busy === 'google' ? <Spinner /> : null} Continue with Google
          </button>

          <div className="row" style={{ alignItems: 'center', margin: '18px 0' }}>
            <div style={{ flex: 1, height: 1, background: 'var(--line)' }} />
            <span className="hint">or</span>
            <div style={{ flex: 1, height: 1, background: 'var(--line)' }} />
          </div>

          {/* Email magic link */}
          <label htmlFor="login-email">Email magic link</label>
          <input
            id="login-email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={emailSent}
          />
          <button
            className="btn"
            style={{ width: '100%', justifyContent: 'center', marginTop: 10 }}
            onClick={sendMagicLink}
            disabled={busy !== null || emailSent}
          >
            {busy === 'email' ? <Spinner /> : null}
            {emailSent ? '✓ Link sent — check your email' : 'Send magic link'}
          </button>

          <div className="row" style={{ alignItems: 'center', margin: '18px 0' }}>
            <div style={{ flex: 1, height: 1, background: 'var(--line)' }} />
            <span className="hint">or</span>
            <div style={{ flex: 1, height: 1, background: 'var(--line)' }} />
          </div>

          {/* Phone OTP */}
          <label htmlFor="login-phone">Phone (OTP)</label>
          <input
            id="login-phone"
            type="tel"
            placeholder="+91 98765 43210"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={otpSent}
          />
          {!otpSent ? (
            <button
              className="btn ghost"
              style={{ width: '100%', justifyContent: 'center', marginTop: 10 }}
              onClick={sendPhoneOtp}
              disabled={busy !== null}
            >
              {busy === 'phone' ? <Spinner /> : null} Send OTP
            </button>
          ) : (
            <>
              <label htmlFor="login-otp">Enter the 6-digit code</label>
              <input
                id="login-otp"
                inputMode="numeric"
                placeholder="123456"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
              />
              <button
                className="btn"
                style={{ width: '100%', justifyContent: 'center', marginTop: 10 }}
                onClick={verifyPhoneOtp}
                disabled={busy !== null}
              >
                {busy === 'verify' ? <Spinner /> : null} Verify & continue
              </button>
            </>
          )}

          <p className="hint" style={{ marginTop: 18, textAlign: 'center' }}>
            By continuing you agree to our terms. AI-assisted content is labelled.
          </p>
        </div>
      </div>
    </>
  );
}
