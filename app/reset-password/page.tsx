'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { toast } from '@/components/ui/toast';
import { AuthShell } from '@/components/auth/AuthShell';
import { NewPasswordForm } from '@/components/auth/NewPasswordForm';

// Landing page of the reset-password email. /auth/callback has already turned
// the link into a session; here the user picks the new password.
export default function ResetPasswordPage() {
  const router = useRouter();
  const [state, setState] = useState<'checking' | 'ready' | 'expired'>('checking');

  useEffect(() => {
    createClient()
      .auth.getUser()
      .then(({ data }) => setState(data.user ? 'ready' : 'expired'));
  }, []);

  return (
    <AuthShell>
      <h1>Choose a new password</h1>
      {state === 'checking' && <p className="sub">Checking your reset link…</p>}
      {state === 'expired' && (
        <p className="sub">
          This reset link is invalid or has expired. <Link href="/forgot-password">Send a new one</Link>.
        </p>
      )}
      {state === 'ready' && (
        <NewPasswordForm
          submitLabel="Save password"
          onDone={() => {
            toast('Password updated ✓');
            router.push('/home');
            router.refresh();
          }}
        />
      )}
    </AuthShell>
  );
}
