'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { Spinner } from '@/components/ui/spinner';
import { Paywall } from '@/components/Paywall';
import { toast } from '@/components/ui/toast';
import { VariantCard } from '@/components/post/VariantCard';
import { quotaState } from '@/lib/modules/post/entitlements';
import type { ApiError } from '@/lib/types';
import type { Plan } from '@/lib/plans';
import type { DetectedLang, GenerateResult } from '@/lib/modules/post/types';

// Local, dependency-free language heuristic for the live "Detected: …" hint.
// Mirrors the server's detectLang (lib/ai/transcribe) but inlined to keep the
// OpenAI SDK out of the client bundle. The server response is authoritative.
const HINGLISH_MARKERS = new Set([
  'hai', 'kya', 'aaj', 'humara', 'bhi', 'baat', 'mein', 'ke', 'ki', 'ka', 'hua',
  'gaya', 'badal', 'soch', 'chalega', 'raha', 'zyada', 'bata', 'nahi', 'acha',
  'matlab', 'kaam', 'bahut', 'thoda', 'kuch', 'log', 'sab', 'yaar',
]);

function detectLangClient(text: string): DetectedLang {
  if (/[ऀ-ॿ]/.test(text)) return 'hindi';
  const hits = text
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/[^a-z]/g, ''))
    .filter((w) => HINGLISH_MARKERS.has(w)).length;
  return hits >= 2 ? 'hinglish' : 'english';
}

// Client port of the demo's Generate view. Real behaviour:
//  - Generate -> POST /api/post/generate; 402 opens the paywall, 409 routes to
//    onboarding, success renders 3 VariantCards.
//  - Record voice note -> MediaRecorder capture -> POST /api/post/transcribe -> fills
//    the textarea (graceful toast if the browser can't record).
// Quota/limits are server-authoritative; the UI count here is only for display.

const EXAMPLES = [
  {
    label: 'First enterprise client',
    ex: 'Closed our first enterprise client this week after months of getting ghosted. The deal almost died twice.',
  },
  {
    label: 'Hiring lesson',
    ex: 'Spent the whole week debugging a hiring mistake. Promoted someone too fast and had to walk it back. Painful lesson.',
  },
  {
    label: 'Pricing insight (Hinglish)',
    ex: 'Aaj ek interesting insight mila — humara cheapest plan sabse zyada churn kar raha hai. Pricing ke baare mein soch badal gaya.',
  },
];

const LANG_LABEL: Record<DetectedLang, string> = {
  english: 'English',
  hinglish: 'Hinglish',
  hindi: 'Hindi (Devanagari)',
};

export function GenerateClient({
  plan,
  used,
  hindiOutput,
}: {
  plan: Plan;
  used: number;
  hindiOutput: boolean;
  // `name` is accepted (page passes the profile name) but not rendered in this
  // view; the LinkedIn-preview avatar lives in the /post/drafts editor.
  name?: string | null;
}) {
  const [input, setInput] = useState('');
  const [generating, setGenerating] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [posts, setPosts] = useState<GenerateResult['posts'] | null>(null);
  const [langHint, setLangHint] = useState('');
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [count, setCount] = useState(used);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const q = quotaState(plan, count);
  const outputNote = hindiOutput ? 'output in Hindi' : 'output in professional English';

  function updateLangHint(text: string) {
    if (!text.trim()) {
      setLangHint('');
      return;
    }
    setLangHint(`Detected: ${LANG_LABEL[detectLangClient(text)]} → ${outputNote}`);
  }

  function onInput(value: string) {
    setInput(value);
    updateLangHint(value);
  }

  function applyExample(ex: string) {
    onInput(ex);
  }

  async function generate() {
    const text = input.trim();
    if (!text) {
      toast('Tell me what happened this week');
      return;
    }
    setGenerating(true);
    try {
      const res = await fetch('/api/post/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inputText: text }),
      });

      if (res.status === 402) {
        const body = (await res.json()) as ApiError;
        if (body.code === 'quota_exceeded') {
          setPaywallOpen(true);
          return;
        }
        toast(body.error);
        return;
      }
      if (res.status === 409) {
        const body = (await res.json()) as ApiError;
        if (body.code === 'no_voice_profile') {
          // Surfaced inline below too; nudge the user to onboarding.
          toast('Set up your voice profile first');
          return;
        }
        toast(body.error);
        return;
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => ({ error: 'Something went wrong.' }))) as ApiError;
        toast(body.error ?? 'Something went wrong.');
        return;
      }

      const result = (await res.json()) as GenerateResult;
      setPosts(result.posts);
      const next = count + 1;
      setCount(next);
      setLangHint(
        `Detected: ${LANG_LABEL[result.detectedLang]} → ${outputNote}`,
      );
      const limitLabel = q.unlimited ? '∞' : String(q.limit);
      toast(`3 drafts ready (${next}/${limitLabel} this month)`);
    } catch {
      toast('Network error — please try again');
    } finally {
      setGenerating(false);
    }
  }

  async function startRecording() {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      toast('Voice recording is not supported in this browser');
      return;
    }
    if (typeof MediaRecorder === 'undefined') {
      toast('Voice recording is not supported in this browser');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || 'audio/webm',
        });
        void uploadVoiceNote(blob);
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      toast('Recording… tap again to stop');
    } catch {
      toast('Microphone permission denied');
    }
  }

  function stopRecording() {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
  }

  function toggleRecording() {
    if (recording) stopRecording();
    else void startRecording();
  }

  async function uploadVoiceNote(blob: Blob) {
    setTranscribing(true);
    try {
      const form = new FormData();
      const ext = blob.type.includes('ogg') ? 'ogg' : 'webm';
      form.append('file', blob, `voice-note.${ext}`);
      const res = await fetch('/api/post/transcribe', { method: 'POST', body: form });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({ error: 'Transcription failed.' }))) as ApiError;
        toast(body.error ?? 'Transcription failed.');
        return;
      }
      const data = (await res.json()) as { text: string; detectedLang: DetectedLang };
      onInput(data.text);
      toast('Voice note transcribed ✓');
    } catch {
      toast('Could not transcribe — please try again');
    } finally {
      setTranscribing(false);
    }
  }

  const micLabel = recording ? '⏹ Stop recording' : transcribing ? 'Transcribing…' : '🎙️ Record voice note';

  return (
    <>
      <section>
        <div className="card">
          <h1>Voice-to-Post Engine</h1>
          <p className="sub">
            Describe your week — by voice note or text, in English, Hindi or Hinglish. Get 3 post
            angles in your voice.
          </p>

          {/* Voice-profile badge (assume present; link to onboarding if not). */}
          <div className="badge-voice" style={{ marginBottom: 12 }}>
            🎯 Writing in your voice ·{' '}
            <Link href="/post/onboarding">edit voice profile</Link>
          </div>

          <label htmlFor="genInput">What happened this week worth sharing?</label>
          <textarea
            id="genInput"
            value={input}
            onChange={(e) => onInput(e.target.value)}
            placeholder="e.g. Closed our first enterprise client after 4 months of no's. Hinglish bhi chalega — bas bata do kya hua."
          />

          <div className="row" style={{ marginTop: 8, alignItems: 'center' }}>
            <button className="btn" onClick={generate} disabled={generating || transcribing}>
              {generating ? (
                <>
                  <Spinner /> Generating in your voice…
                </>
              ) : (
                '✨ Generate 3 posts'
              )}
            </button>
            <button
              className="btn ghost sm"
              onClick={toggleRecording}
              disabled={generating || transcribing}
              title="Record a voice note"
            >
              {transcribing ? (
                <>
                  <Spinner /> Transcribing…
                </>
              ) : (
                micLabel
              )}
            </button>
            <span className="hint">{langHint}</span>
          </div>

          <div className="row" style={{ marginTop: 8 }}>
            <span className="hint">Try:</span>
            {EXAMPLES.map((e) => (
              <span
                key={e.label}
                className="chip sm"
                role="button"
                tabIndex={0}
                onClick={() => applyExample(e.ex)}
                onKeyDown={(ev) => {
                  if (ev.key === 'Enter' || ev.key === ' ') applyExample(e.ex);
                }}
              >
                {e.label}
              </span>
            ))}
          </div>
        </div>

        {posts && (
          <div className="card">
            <h2>Your 3 angles</h2>
            <p className="muted" style={{ marginTop: -8 }}>
              Same week, three ways to tell it. Edit any one and save to drafts.
            </p>
            <div className="grid3">
              {posts.map((p) => (
                <VariantCard key={p.angle} angle={p.angle} body={p.body} />
              ))}
            </div>
          </div>
        )}
      </section>

      <Paywall
        open={paywallOpen}
        title="Upgrade for more posts"
        message={`You've hit your ${plan} limit of ${q.limit} posts this month.`}
        onClose={() => setPaywallOpen(false)}
      />
    </>
  );
}
