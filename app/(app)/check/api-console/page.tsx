import { redirect } from 'next/navigation';
import { getUser } from '@/lib/supabase/server';
import { ApiConsoleClient } from '@/components/check/ApiConsoleClient';

export const dynamic = 'force-dynamic';

// /check/api-console — issue Newsroom API keys.
export default async function CheckApiConsolePage() {
  const user = await getUser();
  if (!user) redirect('/login');
  return <ApiConsoleClient />;
}
