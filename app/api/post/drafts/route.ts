import { NextResponse } from 'next/server';
import { createClient, getUser } from '@/lib/supabase/server';
import { captureException, log } from '@/lib/observability';

// GET /api/post/drafts — list the signed-in user's non-discarded drafts.
// RLS on the request-scoped client guarantees the user only sees their own rows;
// the explicit user_id filter is defence-in-depth. Used when the client wants to
// refetch the list (e.g. after navigating back to the page).
export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const supabase = createClient();
  const { data, error } = await supabase
    .from('drafts')
    .select('*')
    .eq('user_id', user.id)
    .neq('status', 'discarded')
    .order('created_at', { ascending: false });

  if (error) {
    captureException(error, { route: 'GET /api/post/drafts', userId: user.id });
    return NextResponse.json({ error: 'failed_to_load_drafts' }, { status: 500 });
  }

  log.info('drafts listed', { userId: user.id, count: data?.length ?? 0 });
  return NextResponse.json({ drafts: data ?? [] });
}
