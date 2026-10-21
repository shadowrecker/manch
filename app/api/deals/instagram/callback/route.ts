import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { getUser } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { exchangeCode, getLongLivedToken, INSTAGRAM_STATE_COOKIE } from '@/lib/modules/deals/instagram/oauth';
import { fetchProfile } from '@/lib/modules/deals/instagram/graph';
import { fetchAndSnapshot } from '@/lib/modules/deals/instagram/metrics';
import { EVENTS, captureServer } from '@/lib/analytics';
import { log, captureException } from '@/lib/observability';

export const runtime = 'nodejs';

// GET /api/deals/instagram/callback — OAuth redirect: exchange code, store the
// connection, snapshot metrics. Always redirects back to /deals/media-kit.
export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const user = await getUser();
  if (!user) return NextResponse.redirect(`${origin}/login`);

  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const cookieState = cookies().get(INSTAGRAM_STATE_COOKIE)?.value;
  cookies().delete(INSTAGRAM_STATE_COOKIE);
  if (!code || !state || state !== cookieState) {
    return NextResponse.redirect(`${origin}/deals/media-kit?ig=error`);
  }

  try {
    const { accessToken: shortToken, igUserId } = await exchangeCode(code);
    const { accessToken: longToken, expiresIn } = await getLongLivedToken(shortToken);
    const profile = await fetchProfile(longToken, igUserId);

    const sb = createAdminClient();
    await sb.from('instagram_connections').upsert(
      {
        user_id: user.id,
        ig_user_id: igUserId,
        ig_username: profile.username,
        account_type: profile.accountType,
        access_token: longToken,
        token_expires: expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null,
      },
      { onConflict: 'user_id' },
    );

    // Best-effort metric snapshot; a transient failure shouldn't break the connect.
    await fetchAndSnapshot(user.id).catch((e) => log.warn('ig snapshot failed', { error: String(e) }));
    await captureServer(EVENTS.instagramConnected, user.id, { account_type: profile.accountType });
    return NextResponse.redirect(`${origin}/deals/media-kit?ig=connected`);
  } catch (e) {
    captureException(e, { route: 'deals/instagram/callback', userId: user.id });
    return NextResponse.redirect(`${origin}/deals/media-kit?ig=error`);
  }
}
