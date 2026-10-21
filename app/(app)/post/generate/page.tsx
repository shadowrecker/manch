import { redirect } from 'next/navigation';
import { getUser } from '@/lib/supabase/server';
import { getPlan, getUsage, getProfile } from '@/lib/db/queries';
import { GenerateClient } from '@/components/post/GenerateClient';

// Server component for the Voice-to-Post hero loop. Loads server-authoritative
// plan + monthly usage and the profile (for the Hindi-output flag and name used
// in copy), then hands them to the interactive client.
export default async function GeneratePage() {
  const user = await getUser();
  if (!user) redirect('/login');

  const [plan, used, profile] = await Promise.all([
    getPlan(user.id),
    getUsage(user.id, 'posts'),
    getProfile(user.id),
  ]);

  return (
    <GenerateClient
      plan={plan}
      used={used}
      hindiOutput={profile?.hindi_output ?? false}
      name={profile?.full_name ?? null}
    />
  );
}
