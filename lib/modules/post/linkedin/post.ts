import { createAdminClient } from '@/lib/supabase/admin';
import { log } from '@/lib/observability';

// Publish a text post to LinkedIn on a member's behalf via the UGC Posts API
// (PRD F-05). The stored access token + member URN come from the OAuth flow in
// lib/linkedin/oauth.ts. SERVER ONLY — uses the service-role client to read the
// member's token row regardless of request context (also called by the QStash
// worker, which has no user session).

const UGC_POSTS_URL = 'https://api.linkedin.com/v2/ugcPosts';

/** Raised when the user has not connected (or has lost) their LinkedIn token. */
export class LinkedInNotConnectedError extends Error {
  constructor(userId: string) {
    super(`No LinkedIn token for user ${userId}`);
    this.name = 'LinkedInNotConnectedError';
  }
}

/**
 * Publish `text` as a public LinkedIn post authored by `userId`.
 * Returns the created share's external id (preferring the x-restli-id header,
 * which carries the canonical urn:li:share/ugcPost id).
 */
export async function publishPost(
  userId: string,
  text: string,
): Promise<{ externalId: string }> {
  const sb = createAdminClient();
  const { data: token, error } = await sb
    .from('linkedin_tokens')
    .select('access_token, member_urn')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  if (!token || !token.access_token || !token.member_urn) {
    throw new LinkedInNotConnectedError(userId);
  }

  // Standard shareCommentary payload for a public, text-only share.
  const payload = {
    author: token.member_urn,
    lifecycleState: 'PUBLISHED',
    specificContent: {
      'com.linkedin.ugc.ShareContent': {
        shareCommentary: { text },
        shareMediaCategory: 'NONE',
      },
    },
    visibility: {
      'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
    },
  };

  const res = await fetch(UGC_POSTS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token.access_token}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const detail = await res.text();
    log.error('linkedin publish failed', { userId, status: res.status, detail });
    // Surface the HTTP status in the message so callers/workers can classify
    // transient (5xx/429) vs permanent failures.
    throw new Error(`LinkedIn ugcPosts failed (${res.status}): ${detail}`);
  }

  // The created id is returned in the x-restli-id response header; fall back to
  // the JSON body's id if the header is absent.
  const headerId = res.headers.get('x-restli-id');
  let externalId = headerId ?? '';
  if (!externalId) {
    try {
      const json = (await res.json()) as { id?: string };
      externalId = json.id ?? '';
    } catch {
      // No JSON body — leave externalId empty.
    }
  }

  return { externalId };
}
