import OpenAI from 'openai';
import { env, requireEnv } from '@/lib/env';
import { log } from '@/lib/observability';

// Audio → text. Primary: OpenAI Whisper (multilingual, strong on Indian
// languages). Fallback: Sarvam ASR if configured. Language detection lives in
// lib/modules/reels/ai/vernacular.ts (it runs on the resulting text).

let _openai: OpenAI | null = null;
function openai(): OpenAI {
  if (!_openai) _openai = new OpenAI({ apiKey: requireEnv(env.openaiApiKey, 'OPENAI_API_KEY') });
  return _openai;
}

export interface AudioInput {
  data: Blob | File;
  filename?: string;
  mimeType?: string;
}

export interface TranscriptionResult {
  text: string;
  provider: 'whisper' | 'sarvam';
}

function toFile(audio: AudioInput): File {
  if (audio.data instanceof File) return audio.data;
  return new File([audio.data], audio.filename ?? 'audio.ogg', {
    type: audio.mimeType ?? 'audio/ogg',
  });
}

async function transcribeWhisper(audio: AudioInput): Promise<TranscriptionResult> {
  const res = await openai().audio.transcriptions.create({
    file: toFile(audio),
    model: env.whisperModel,
    response_format: 'json',
  });
  return { text: (res as { text?: string }).text ?? '', provider: 'whisper' };
}

async function transcribeSarvam(audio: AudioInput): Promise<TranscriptionResult> {
  const form = new FormData();
  form.append('file', toFile(audio));
  form.append('model', 'saarika:v2');
  const res = await fetch(`${env.sarvamBaseUrl}/speech-to-text`, {
    method: 'POST',
    headers: { 'api-subscription-key': env.sarvamApiKey },
    body: form,
  });
  if (!res.ok) throw new Error(`Sarvam ASR failed: ${res.status}`);
  const json = (await res.json()) as { transcript?: string };
  return { text: json.transcript ?? '', provider: 'sarvam' };
}

export async function transcribe(audio: AudioInput): Promise<TranscriptionResult> {
  try {
    return await transcribeWhisper(audio);
  } catch (e) {
    log.warn('whisper transcription failed', { error: String(e) });
    if (env.sarvamApiKey) return transcribeSarvam(audio);
    throw e;
  }
}
