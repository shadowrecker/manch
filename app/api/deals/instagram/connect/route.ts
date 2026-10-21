import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getUser } from '@/lib/supabase/server';
import { authUrl, INSTAGRAM_STATE_COOKIE } from '@/lib/modules/deals/instagram/oauth';
import { randomId } from '@/lib/utils';
import type { ApiError } from '@/lib/types';

export const runtime = 'nodejs';

// GET /api/deals/instagram/connect — start the Instagram Business Login flow.
export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json<ApiError>({ error: 'unauthorized' }, { status: 401 });

  const state = randomId(16);
  cookies().set(INSTAGRAM_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 10,
  });
  return NextResponse.redirect(authUrl(state));
}
