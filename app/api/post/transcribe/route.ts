import { NextResponse } from 'next/server';
import { getUser } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { transcribe } from '@/lib/modules/post/ai/transcribe';
import { rateLimit } from '@/lib/ratelimit';
import { captureServer, EVENTS } from '@/lib/analytics';
import { log, captureException } from '@/lib/observability';
import type { ApiError } from '@/lib/types';

// POST /api/post/transcribe (multipart/form-data, field "file") -> { text, detectedLang }
//
// Captures a web voice note, transcribes it via Whisper (Sarvam fallback), and
// stores a transcriptions row so the same input is available to the WhatsApp
// flow's data model. The returned text is dropped into the Generate textarea.
export async function POST(req: Request) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json<ApiError>({ error: 'unauthorized' }, { status: 401 });
  }

  // Transcription is paid (per-minute) so guard against spam.
  const rl = await rateLimit(`transcribe:${user.id}`, { limit: 10, windowSeconds: 60 });
  if (!rl.success) {
    return NextResponse.json<ApiError>(
      { error: 'Too many voice notes. Please wait a moment.', code: 'rate_limited' },
      { status: 429 },
    );
  }

  let file: File | null = null;
  try {
    const form = await req.formData();
    const f = form.get('file');
    if (f instanceof File) file = f;
  } catch {
    return NextResponse.json<ApiError>({ error: 'invalid form data' }, { status: 400 });
  }
  if (!file || file.size === 0) {
    return NextResponse.json<ApiError>({ error: 'No audio file provided.' }, { status: 400 });
  }

  try {
    const result = await transcribe({
      data: file,
      filename: file.name || 'voice-note.webm',
      mimeType: file.type || 'audio/webm',
    });

    // Persist for parity with the WhatsApp pipeline (privileged write).
    const sb = createAdminClient();
    const { error } = await sb.from('transcriptions').insert({
      user_id: user.id,
      source: 'web_voice',
      provider: result.provider,
      detected_lang: result.detectedLang,
      text: result.text,
    });
    if (error) {
      // Non-fatal: still return the transcript so the user can generate.
      log.warn('transcription persist failed', { userId: user.id, error: error.message });
    }

    await captureServer(EVENTS.voiceNoteSubmitted, user.id, {
      source: 'web',
      lang: result.detectedLang,
    });

    return NextResponse.json({ text: result.text, detectedLang: result.detectedLang });
  } catch (e) {
    captureException(e, { route: 'POST /api/post/transcribe', userId: user.id });
    return NextResponse.json<ApiError>(
      { error: 'Could not transcribe that audio. Please try again.' },
      { status: 502 },
    );
  }
}
