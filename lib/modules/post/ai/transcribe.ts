import OpenAI from 'openai';
import { env, requireEnv } from '@/lib/env';
import type { DetectedLang } from '@/lib/modules/post/types';
import { log } from '@/lib/observability';

// Transcription with a provider-agnostic interface (PRD §8.2). Primary: OpenAI
// Whisper (multilingual, strong Hindi/Hinglish). Fallback: Sarvam ASR if
// configured (Bhashini can be added behind the same interface). Abstracting
// here keeps switching cost ≈ 0.

let _openai: OpenAI | null = null;
function openai(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({ apiKey: requireEnv(env.openaiApiKey, 'OPENAI_API_KEY') });
  }
  return _openai;
}

export interface AudioInput {
  data: Blob | File;
  filename?: string;
  mimeType?: string;
}

export interface TranscriptionResult {
  text: string;
  detectedLang: DetectedLang;
  provider: 'whisper' | 'sarvam';
}

const HINGLISH_MARKERS = [
  'hai', 'kya', 'aaj', 'humara', 'bhi', 'baat', 'mein', 'ke', 'ki', 'ka', 'hua',
  'gaya', 'badal', 'soch', 'chalega', 'raha', 'zyada', 'bata', 'nahi', 'acha',
  'matlab', 'kaam', 'bahut', 'thoda', 'kuch', 'log', 'sab', 'yaar',
];

/** Cheap language heuristic; reconciled with the provider's own detection. */
export function detectLang(text: string): DetectedLang {
  if (/[ऀ-ॿ]/.test(text)) return 'hindi';
  const words = text.toLowerCase().split(/\s+/).map((w) => w.replace(/[^a-z]/g, ''));
  const hits = words.filter((w) => HINGLISH_MARKERS.includes(w)).length;
  return hits >= 2 ? 'hinglish' : 'english';
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
  const text = (res as { text?: string }).text ?? '';
  return { text, detectedLang: detectLang(text), provider: 'whisper' };
}

async function transcribeSarvam(audio: AudioInput): Promise<TranscriptionResult> {
  const form = new FormData();
  form.append('file', toFile(audio));
  form.append('model', 'saarika:v2');
  const res = await fetch('https://api.sarvam.ai/speech-to-text', {
    method: 'POST',
    headers: { 'api-subscription-key': env.sarvamApiKey },
    body: form,
  });
  if (!res.ok) throw new Error(`Sarvam ASR failed: ${res.status}`);
  const json = (await res.json()) as { transcript?: string };
  const text = json.transcript ?? '';
  return { text, detectedLang: detectLang(text), provider: 'sarvam' };
}

/** Transcribe audio, falling back to Sarvam if Whisper errors and is configured. */
export async function transcribe(audio: AudioInput): Promise<TranscriptionResult> {
  try {
    return await transcribeWhisper(audio);
  } catch (e) {
    log.warn('whisper transcription failed', { error: String(e) });
    if (env.sarvamApiKey) return transcribeSarvam(audio);
    throw e;
  }
}
