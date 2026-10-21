import { env, requireEnv } from '@/lib/env';

// LinkedIn OAuth 2.0 (Sign In with LinkedIn using OpenID Connect + member
// posting). We request the OIDC scopes for identity plus w_member_social to
// publish on the member's behalf (PRD F-05 / Technical Architecture LinkedIn).
//
// Importing this module never throws; requireEnv() is called at the point of
// use so the build succeeds without LinkedIn credentials but the flow fails
// loudly the moment it is exercised without them.

const AUTHORIZE_URL = 'https://www.linkedin.com/oauth/v2/authorization';
const TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken';
const USERINFO_URL = 'https://api.linkedin.com/v2/userinfo';

/** Scopes: OIDC identity (sub/profile/email) + member posting. */
const SCOPE = 'openid profile email w_member_social';

/**
 * Build the LinkedIn consent URL. `state` is an opaque, unguessable value the
 * caller must persist (cookie) and re-verify in the callback to defeat CSRF.
 */
export function authUrl(state: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: requireEnv(env.linkedinClientId, 'LINKEDIN_CLIENT_ID'),
    redirect_uri: requireEnv(env.linkedinRedirectUri, 'LINKEDIN_REDIRECT_URI'),
    scope: SCOPE,
    state,
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

export interface TokenExchangeResult {
  accessToken: string;
  /** Seconds until the access token expires. */
  expiresIn: number;
  refreshToken?: string;
  scope?: string;
}

/**
 * Exchange the authorization `code` for an access token. LinkedIn expects an
 * x-www-form-urlencoded body on the token endpoint.
 */
export async function exchangeCode(code: string): Promise<TokenExchangeResult> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: requireEnv(env.linkedinRedirectUri, 'LINKEDIN_REDIRECT_URI'),
    client_id: requireEnv(env.linkedinClientId, 'LINKEDIN_CLIENT_ID'),
    client_secret: requireEnv(env.linkedinClientSecret, 'LINKEDIN_CLIENT_SECRET'),
  });

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`LinkedIn token exchange failed (${res.status}): ${detail}`);
  }

  // LinkedIn returns snake_case fields.
  const json = (await res.json()) as {
    access_token: string;
    expires_in: number;
    refresh_token?: string;
    scope?: string;
  };

  return {
    accessToken: json.access_token,
    expiresIn: json.expires_in,
    refreshToken: json.refresh_token,
    scope: json.scope,
  };
}

/**
 * Fetch the member's stable OpenID `sub` claim, used to build the author URN
 * `urn:li:person:<sub>` required by the posting API.
 */
export async function fetchMemberSub(accessToken: string): Promise<string> {
  const res = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`LinkedIn userinfo failed (${res.status}): ${detail}`);
  }

  const json = (await res.json()) as { sub?: string };
  if (!json.sub) {
    throw new Error('LinkedIn userinfo returned no sub claim');
  }
  return json.sub;
}

/** Cookie name holding the OAuth CSRF state between connect and callback. */
export const LINKEDIN_STATE_COOKIE = 'li_oauth_state';
