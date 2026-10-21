import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getUser } from '@/lib/supabase/server';
import { authUrl, LINKEDIN_STATE_COOKIE } from '@/lib/modules/post/linkedin/oauth';
import { randomId } from '@/lib/utils';
import { log } from '@/lib/observability';

// GET /api/post/linkedin/connect — kick off the LinkedIn OAuth flow.
// We mint a random `state`, stash it in a short-lived, httpOnly cookie, and
// redirect the user to LinkedIn's consent screen. The callback re-reads and
// clears the cookie to defeat CSRF.

export const runtime = 'nodejs';

export async function GET(): Promise<Response> {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const state = randomId(16);

  // Persist state for verification in the callback. 10 minutes is ample for a
  // consent round-trip; httpOnly + sameSite=lax keeps it off client JS while
  // still surviving the top-level redirect back from LinkedIn.
  cookies().set(LINKEDIN_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 10,
  });

  log.info('linkedin connect: redirecting to consent', { userId: user.id });
  return NextResponse.redirect(authUrl(state));
}
