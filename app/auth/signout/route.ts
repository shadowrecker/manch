import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { captureException } from '@/lib/observability';

// POST /auth/signout — end the Supabase session (clears the auth cookies) and
// return to the landing page. POST-only so a link prefetch or a cross-site
// <img> can never log someone out; 303 turns the form POST into a GET.
export async function POST(req: Request): Promise<Response> {
  const supabase = createClient();
  const { error } = await supabase.auth.signOut();
  if (error) captureException(error, { where: 'auth/signout' });
  return NextResponse.redirect(new URL('/', req.url), { status: 303 });
}
