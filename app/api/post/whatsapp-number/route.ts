import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { getUser } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { env } from '@/lib/env';
import { rateLimit } from '@/lib/ratelimit';
import { captureException, log } from '@/lib/observability';
import type { ApiError } from '@/lib/types';

// Link / unlink the caller's WhatsApp number (shared by every module — the one
// Manch number resolves senders by profiles.whatsapp_e164).
//
// POST {}                -> 200 { code, expiresAt, waLink }
//   Issues a single-use 6-digit code. The user sends "LINK <code>" FROM their
//   WhatsApp to the Manch number; lib/whatsapp/dispatch.ts then links the
//   sending number. Typing a number is never trusted — that would let anyone
//   claim someone else's number and receive their messages.
// POST { unlink: true }  -> 200 { ok: true }   removes the caller's link.

const CODE_TTL_MINUTES = 15;

export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json<ApiError>({ error: 'unauthorized' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { unlink?: unknown };
  const sb = createAdminClient();

  if (body.unlink === true) {
    const { error } = await sb.from('profiles').update({ whatsapp_e164: null }).eq('id', user.id);
    if (error) {
      captureException(error, { route: 'POST /api/post/whatsapp-number', userId: user.id });
      return NextResponse.json<ApiError>({ error: 'Could not unlink your number.' }, { status: 500 });
    }
    log.info('whatsapp number unlinked', { userId: user.id });
    return NextResponse.json({ ok: true });
  }

  const rl = await rateLimit(`wa-link:${user.id}`, { limit: 5, windowSeconds: 600 });
  if (!rl.success) {
    return NextResponse.json<ApiError>({ error: 'Too many codes requested. Try again soon.', code: 'rate_limited' }, { status: 429 });
  }

  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60_000).toISOString();
  // One live code per user: clear older ones first.
  await sb.from('whatsapp_link_codes').delete().eq('user_id', user.id);
  const { error } = await sb.from('whatsapp_link_codes').insert({ code, user_id: user.id, expires_at: expiresAt });
  if (error) {
    captureException(error, { route: 'POST /api/post/whatsapp-number', userId: user.id });
    return NextResponse.json<ApiError>({ error: 'Could not create a code. Please retry.' }, { status: 500 });
  }

  const bot = env.whatsappBotNumber.replace(/[^\d]/g, '');
  const waLink = bot ? `https://wa.me/${bot}?text=${encodeURIComponent(`LINK ${code}`)}` : null;
  return NextResponse.json({ code, expiresAt, waLink });
}
