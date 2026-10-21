import crypto from 'node:crypto';
import { env } from '@/lib/env';

// Webhook verification for the shared 360Dialog / WhatsApp Cloud API number.
// Three checks live here:
//   1. verifyWebhookGet  — the one-time GET subscription handshake (hub.*).
//   2. verifySignature   — the per-POST HMAC-SHA256 body signature.
//   3. verifyToken       — the per-POST shared-secret token (360Dialog style).
// All fail closed: if the shared secret is missing, verification returns null/
// false so an unconfigured deployment can never be tricked into processing
// unsigned traffic.

/**
 * Cloud API GET verification handshake. When the platform first subscribes the
 * webhook it issues a GET with `hub.mode`, `hub.verify_token` and
 * `hub.challenge`. We echo the challenge back iff the token matches our secret.
 * Returns the challenge string to send back, or null to respond 403.
 */
export function verifyWebhookGet(searchParams: URLSearchParams): string | null {
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');
  if (!env.dialog360WebhookSecret) return null;
  if (mode === 'subscribe' && token === env.dialog360WebhookSecret) {
    return challenge;
  }
  return null;
}

/**
 * Verify the `X-Hub-Signature-256` header: an HMAC-SHA256 of the *raw* request
 * body keyed by the webhook secret, formatted as `sha256=<hex>`. Compared in
 * constant time. Returns false if either the secret or header is absent, or if
 * the digest does not match.
 */
export async function verifySignature(
  rawBody: string,
  signatureHeader: string | null,
): Promise<boolean> {
  const secret = env.dialog360WebhookSecret;
  if (!secret || !signatureHeader) return false;

  // Header form is "sha256=<hex>"; tolerate a missing prefix defensively.
  const provided = signatureHeader.startsWith('sha256=')
    ? signatureHeader.slice('sha256='.length)
    : signatureHeader;

  const expected = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');

  // Buffers must be equal length for timingSafeEqual; bail early if not.
  const a = Buffer.from(provided, 'hex');
  const b = Buffer.from(expected, 'hex');
  if (a.length !== b.length || a.length === 0) return false;

  try {
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * Shared-secret check for 360Dialog setups that send the webhook secret as a
 * header (`x-360dialog-webhook-secret`) or `?token=` instead of signing the
 * body. Fails closed when the secret is unset. Constant-time comparison.
 */
export function verifyToken(token: string | null): boolean {
  const secret = env.dialog360WebhookSecret;
  if (!secret || !token) return false;
  const a = Buffer.from(token, 'utf8');
  const b = Buffer.from(secret, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
