import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { env } from '@/lib/env';
import { getUser } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { exchangeCode, fetchMemberSub, LINKEDIN_STATE_COOKIE } from '@/lib/modules/post/linkedin/oauth';
import { log, captureException } from '@/lib/observability';

// GET /api/post/linkedin/callback — OAuth redirect target.
// Verifies state, exchanges the code, resolves the member URN, and upserts the
// token (service role, since linkedin_tokens is privileged). Always redirects
// back to /post/drafts so the user lands in the editor.

export const runtime = 'nodejs';

function back(status: 'connected' | 'error'): Response {
  return NextResponse.redirect(`${env.appUrl}/post/drafts?linkedin=${status}`);
}

export async function GET(req: NextRequest): Promise<Response> {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const oauthError = url.searchParams.get('error');

  const cookieStore = cookies();
  const expectedState = cookieStore.get(LINKEDIN_STATE_COOKIE)?.value;
  // Consume the state cookie regardless of outcome (single use).
  cookieStore.delete(LINKEDIN_STATE_COOKIE);

  // User denied consent or LinkedIn returned an error.
  if (oauthError) {
    log.warn('linkedin callback: oauth error', { userId: user.id, oauthError });
    return back('error');
  }

  // CSRF check: state must be present and match the cookie we set.
  if (!code || !state || !expectedState || state !== expectedState) {
    log.warn('linkedin callback: missing/invalid state or code', { userId: user.id });
    return back('error');
  }

  try {
    const token = await exchangeCode(code);
    const sub = await fetchMemberSub(token.accessToken);

    const expiresAt = new Date(Date.now() + token.expiresIn * 1000).toISOString();
    const scopes = token.scope ? token.scope.split(/[\s,]+/).filter(Boolean) : null;

    const sb = createAdminClient();
    const { error } = await sb.from('linkedin_tokens').upsert(
      {
        user_id: user.id,
        access_token: token.accessToken,
        refresh_token: token.refreshToken ?? null,
        member_urn: `urn:li:person:${sub}`,
        expires_at: expiresAt,
        scopes,
      },
      { onConflict: 'user_id' },
    );
    if (error) throw error;

    log.info('linkedin connected', { userId: user.id });
    return back('connected');
  } catch (e) {
    captureException(e, { route: 'GET /api/post/linkedin/callback', userId: user.id });
    return back('error');
  }
}
