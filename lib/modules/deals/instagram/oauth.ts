import { env, requireEnv } from '@/lib/env';

// Instagram Business Login (the modern Instagram API with Instagram Login).
// Inert without Meta keys; the manual-entry path (lib/instagram/metrics) is the
// fallback while Meta App Review is pending (plan §8.1).

export const INSTAGRAM_STATE_COOKIE = 'ig_oauth_state';
const SCOPES = ['instagram_business_basic', 'instagram_business_manage_insights'];

export function authUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: requireEnv(env.metaAppId, 'META_APP_ID'),
    redirect_uri: env.instagramRedirectUri,
    response_type: 'code',
    scope: SCOPES.join(','),
    state,
  });
  return `https://www.instagram.com/oauth/authorize?${params.toString()}`;
}

export interface ShortTokenResult {
  accessToken: string;
  igUserId: string;
}

/** Exchange the OAuth code for a short-lived token + the IG user id. */
export async function exchangeCode(code: string): Promise<ShortTokenResult> {
  const body = new URLSearchParams({
    client_id: requireEnv(env.metaAppId, 'META_APP_ID'),
    client_secret: requireEnv(env.metaAppSecret, 'META_APP_SECRET'),
    grant_type: 'authorization_code',
    redirect_uri: env.instagramRedirectUri,
    code,
  });
  const res = await fetch('https://api.instagram.com/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) throw new Error(`instagram token exchange failed: ${res.status}`);
  const json = (await res.json()) as { access_token?: string; user_id?: string | number };
  if (!json.access_token || json.user_id == null) throw new Error('instagram token exchange: missing fields');
  return { accessToken: json.access_token, igUserId: String(json.user_id) };
}

/** Exchange a short-lived token for a long-lived one (~60 days). */
export async function getLongLivedToken(shortToken: string): Promise<{ accessToken: string; expiresIn: number }> {
  const params = new URLSearchParams({
    grant_type: 'ig_exchange_token',
    client_secret: requireEnv(env.metaAppSecret, 'META_APP_SECRET'),
    access_token: shortToken,
  });
  const res = await fetch(`https://graph.instagram.com/access_token?${params.toString()}`);
  if (!res.ok) throw new Error(`instagram long-lived exchange failed: ${res.status}`);
  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  return { accessToken: json.access_token ?? shortToken, expiresIn: json.expires_in ?? 0 };
}
