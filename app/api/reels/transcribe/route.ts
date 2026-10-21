import { NextResponse } from 'next/server';
import { getUser } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { rateLimit } from '@/lib/ratelimit';
import { transcribe } from '@/lib/modules/reels/ai/transcribe';
import { detectLanguage } from '@/lib/modules/reels/ai/vernacular';
import { captureException, log } from '@/lib/observability';
import type { ApiError } from '@/lib/types';

// POST /api/reels/transcribe (multipart, field "file") -> { text, detectedLang }
export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json<ApiError>({ error: 'unauthorized' }, { status: 401 });

  const rl = await rateLimit(`transcribe:${user.id}`, { limit: 20, windowSeconds: 60 });
  if (!rl.success) {
    return NextResponse.json<ApiError>({ error: 'Slow down a moment.', code: 'rate_limited' }, { status: 429 });
  }

  let file: File | null = null;
  try {
    const form = await req.formData();
    const f = form.get('file');
    if (f instanceof File) file = f;
  } catch {
    return NextResponse.json<ApiError>({ error: 'invalid_form' }, { status: 400 });
  }
  if (!file) return NextResponse.json<ApiError>({ error: 'file_required' }, { status: 400 });

  try {
    const { text, provider } = await transcribe({ data: file, filename: file.name, mimeType: file.type });
    const detectedLang = detectLanguage(text);
    const sb = createAdminClient();
    await sb.from('transcriptions').insert({
      user_id: user.id,
      source: 'web_voice',
      provider,
      detected_lang: detectedLang,
      text,
    });
    return NextResponse.json({ text, detectedLang });
  } catch (e) {
    captureException(e, { route: 'POST /api/reels/transcribe', userId: user.id });
    log.error('transcription failed', { userId: user.id, error: String(e) });
    return NextResponse.json<ApiError>({ error: 'Could not transcribe.' }, { status: 502 });
  }
}
