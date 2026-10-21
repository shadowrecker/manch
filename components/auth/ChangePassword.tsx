'use client';

import { toast } from '@/components/ui/toast';
import { NewPasswordForm } from '@/components/auth/NewPasswordForm';

// Profile → password. Also how accounts created before passwords existed (e.g.
// via a magic link) set their first password.
export function ChangePassword() {
  return (
    <div className="card">
      <h2>Password</h2>
      <p className="muted">Set or change the password you use to log in.</p>
      <NewPasswordForm submitLabel="Update password" onDone={() => toast('Password updated ✓')} />
    </div>
  );
}
