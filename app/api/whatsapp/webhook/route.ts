import { NextResponse } from 'next/server';
import { verifyWebhookGet, verifySignature, verifyToken } from '@/lib/whatsapp/verify';
import { parseInbound } from '@/lib/whatsapp/inbound';
import { dispatchMessage } from '@/lib/whatsapp/dispatch';
import { log, captureException } from '@/lib/observability';

// The ONE WhatsApp webhook for Manch (360Dialog / Cloud API). Contract: fast and
// idempotent. Verify → parse → per message: dedupe, route to Post / Reels /
// Check (lib/whatsapp/router.ts), enqueue the slow work → always 200 to a
// verified POST so the platform does not retry deliveries we already accepted.

export const runtime = 'nodejs';

// GET: webhook subscription handshake. Echo the challenge as text/plain.
export async function GET(req: Request): Promise<Response> {
  const challenge = verifyWebhookGet(new URL(req.url).searchParams);
  if (challenge === null) return new Response('forbidden', { status: 403 });
  return new Response(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } });
}

export async function POST(req: Request): Promise<Response> {
  const rawBody = await req.text();

  // Cloud API deployments sign the body (X-Hub-Signature-256); 360Dialog
  // deployments send a shared secret header/query token instead. Accept either,
  // both fail closed when DIALOG360_WEBHOOK_SECRET is unset.
  const signature = req.headers.get('x-hub-signature-256');
  const token =
    req.headers.get('x-360dialog-webhook-secret') ?? new URL(req.url).searchParams.get('token');
  const valid = signature ? await verifySignature(rawBody, signature) : verifyToken(token);
  if (!valid) {
    log.warn('whatsapp webhook: invalid signature');
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    // Malformed JSON from a *verified* sender: ack so it is not retried forever.
    log.warn('whatsapp webhook: malformed json');
    return NextResponse.json({ ok: true });
  }

  // One failure must not drop the rest; always fall through to a 200 ack.
  for (const msg of parseInbound(payload)) {
    try {
      await dispatchMessage(msg);
    } catch (e) {
      captureException(e, { scope: 'whatsapp.webhook', waMessageId: msg.messageId });
    }
  }
  return NextResponse.json({ ok: true });
}
