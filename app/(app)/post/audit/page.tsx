import { redirect } from 'next/navigation';
import { getUser } from '@/lib/supabase/server';
import { AuditClient } from '@/components/post/AuditClient';

// LinkedIn Profile Audit page (PRD F-03). The (app) layout already auth-guards,
// but we re-check here so the server component never renders for an anon user.
export default async function AuditPage() {
  const user = await getUser();
  if (!user) redirect('/login');

  return <AuditClient />;
}
