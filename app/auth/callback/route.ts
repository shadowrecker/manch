import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { captureException } from '@/lib/observability';
import { safeNext } from '@/lib/auth';

// OAuth / magic-link callback. Supabase redirects here with a ?code which we
// exchange for a session (cookies are written by the request-scoped client),
// then forward the user into the app. Missing/invalid code → back to /login.
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const next = safeNext(url.searchParams.get('next'));

  if (!code) return NextResponse.redirect(new URL('/login', url.origin));

  const supabase = createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    captureException(error, { where: 'auth/callback' });
    return NextResponse.redirect(new URL('/login?error=auth', url.origin));
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
