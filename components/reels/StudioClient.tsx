'use client';

import { useRef, useState } from 'react';
import posthog from 'posthog-js';
import { LanguagePicker } from '@/components/reels/LanguagePicker';
import { ScriptCard } from '@/components/reels/ScriptCard';
import { CaptionPanel } from '@/components/reels/CaptionPanel';
import { ContentPackLink } from '@/components/reels/ContentPackLink';
import { Paywall } from '@/components/Paywall';
import { Spinner } from '@/components/ui/spinner';
import { toast } from '@/components/ui/toast';
import { EVENTS } from '@/lib/events';
import { needsWatermark } from '@/lib/modules/reels/entitlements';
import type { Plan } from '@/lib/plans';
import type { ApiError, LanguageCode, Platform, ScriptOutput, Style, ThreeStyleScript } from '@/lib/modules/reels/types';

const STYLE_ORDER: Style[] = ['educational', 'entertainment', 'emotional'];
const PLATFORM_CHIPS: Platform[] = ['instagram', 'moj', 'josh', 'sharechat'];
const EXAMPLES = [
  'My morning routine as a college student',
  '5 budget travel tips for India',
  'A day running my street-food cart',
];

export function StudioClient({
  plan,
  credits,
  defaultLanguage,
  handle,
}: {
  plan: Plan;
  credits: number;
  defaultLanguage: LanguageCode;
  handle: string | null;
}) {
  const [language, setLanguage] = useState<LanguageCode>(defaultLanguage);
  const [platform, setPlatform] = useState<Platform>('instagram');
  const [idea, setIdea] = useState('');
  const [result, setResult] = useState<ThreeStyleScript | null>(null);
  const [loading, setLoading] = useState(false);
  const [paywall, setPaywall] = useState(false);
  const [recording, setRecording] = useState(false);
  // Caption requested for a given style (Section D panel).
  const [caption, setCaption] = useState<{ style: Style; context: string } | null>(null);

  const watermark = needsWatermark(plan);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  async function generate() {
    if (!idea.trim()) {
      toast('Tell us your idea');
      return;
    }
    setLoading(true);
    setResult(null);
    setCaption(null);
    try {
      const res = await fetch('/api/reels/script', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ languageCode: language, platform, ideaText: idea }),
      });
      if (res.status === 402) {
        setPaywall(true);
        return;
      }
      if (!res.ok) {
        const e = (await res.json().catch(() => ({}))) as ApiError;
        toast(e.error || 'Something went wrong');
        return;
      }
      const data = (await res.json()) as { styles: ThreeStyleScript };
      setResult(data.styles);
      const ph = posthog as unknown as { __loaded?: boolean };
      if (ph.__loaded) posthog.capture(EVENTS.languageSelected, { language_code: language });
      toast('3 scripts ready ✨');
    } finally {
      setLoading(false);
    }
  }

  async function record() {
    if (recording) {
      recRef.current?.stop();
      return;
    }
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      toast('Voice notes are not supported in this browser');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      recRef.current = mr;
      chunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data);
      };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const fd = new FormData();
        fd.append('file', blob, 'note.webm');
        const r = await fetch('/api/reels/transcribe', { method: 'POST', body: fd });
        if (r.ok) {
          const d = (await r.json()) as { text: string };
          setIdea(d.text);
          toast('Transcribed ✓');
        } else {
          toast('Could not transcribe');
        }
      };
      mr.start();
      setRecording(true);
    } catch {
      toast('Microphone permission denied');
    }
  }

  function onCaption(script: ScriptOutput, style: Style) {
    setCaption({ style, context: `${script.hook}\n${script.body}\n${script.cta}` });
  }

  return (
    <>
      <div className="card">
        <h1>Studio</h1>
        <p className="sub">Say your idea — get a Reel script in your language, in 3 styles.</p>

        <label>Language</label>
        <LanguagePicker value={language} onChange={setLanguage} />

        <label>Platform</label>
        <div className="chips">
          {PLATFORM_CHIPS.map((p) => (
            <span key={p} className={`chip${platform === p ? ' on' : ''}`} onClick={() => setPlatform(p)}>
              {p}
            </span>
          ))}
        </div>

        <label>Your idea</label>
        <textarea
          value={idea}
          onChange={(e) => setIdea(e.target.value)}
          placeholder="e.g. My morning routine as a college student. English/Hinglish bhi chalega — we write it in your language & script."
        />
        <div className="row" style={{ marginTop: 8, alignItems: 'center' }}>
          <button className="btn" onClick={generate} disabled={loading}>
            {loading ? (
              <>
                <Spinner /> Writing…
              </>
            ) : (
              '✨ Generate 3 scripts'
            )}
          </button>
          <button className="btn ghost sm" onClick={record}>
            {recording ? '⏹ Stop' : '🎙️ Voice note'}
          </button>
          {credits > 0 && <span className="hint">🎟️ {credits} credits</span>}
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <span className="hint">Try:</span>
          {EXAMPLES.map((ex) => (
            <span key={ex} className="chip sm" onClick={() => setIdea(ex)}>
              {ex}
            </span>
          ))}
        </div>
      </div>

      {result && (
        <div className="card">
          <h2>Your 3 scripts</h2>
          <p className="muted" style={{ marginTop: -8 }}>
            Same idea, three ways to tell it. Tap “Make caption” for a ready-to-post caption.
          </p>
          <div className="grid3">
            {STYLE_ORDER.map((s) => (
              <ScriptCard key={s} style={s} script={result[s]} watermark={watermark} onCaption={onCaption} />
            ))}
          </div>
        </div>
      )}

      {caption && (
        <CaptionPanel
          languageCode={language}
          platform={platform}
          context={caption.context}
          handle={handle}
          onClose={() => setCaption(null)}
        />
      )}

      <Paywall
        open={paywall}
        title="Keep creating"
        message="You’ve used your pieces for this month. Grab a ₹49 pack or upgrade."
        onClose={() => setPaywall(false)}
        extra={<ContentPackLink onClick={() => setPaywall(false)} />}
      />
    </>
  );
}
