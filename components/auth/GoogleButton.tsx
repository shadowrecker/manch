'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { env } from '@/lib/env';
import { toast } from '@/components/ui/toast';
import { Spinner } from '@/components/ui/spinner';
import { OrDivider } from '@/components/auth/AuthShell';

// "Continue with Google" — rendered only when NEXT_PUBLIC_AUTH_GOOGLE=true
// (the Google provider must be enabled in Supabase Auth first).
export function GoogleButton() {
  const [busy, setBusy] = useState(false);
  if (!env.authGoogle) return null;

  async function go() {
    setBusy(true);
    const { error } = await createClient().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback?next=/home` },
    });
    // On success the browser leaves for Google; we only get here on error.
    if (error) {
      setBusy(false);
      toast(error.message);
    }
  }

  return (
    <>
      <button type="button" className="btn ghost" style={{ width: '100%', justifyContent: 'center' }} onClick={go} disabled={busy}>
        {busy ? <Spinner /> : null} Continue with Google
      </button>
      <OrDivider />
    </>
  );
}
