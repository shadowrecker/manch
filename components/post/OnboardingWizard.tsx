'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from '@/components/ui/toast';
import { Spinner } from '@/components/ui/spinner';
import type { VoiceProfileInput } from '@/lib/modules/post/types';

// 5-step voice-profile wizard, ported from the demo (PRD F-06). On finish it
// POSTs to /api/post/voice-profile and routes to /post/generate. Chip lists/labels match
// the demo exactly.
const SENIORITY = [
  'Founder / CEO',
  'Co-founder',
  'C-suite / VP',
  'Senior IC / Lead',
  'Mid-level',
  'Consultant / Freelancer',
];
const TOPICS = [
  'Building in public',
  'Fundraising',
  'Product',
  'Engineering',
  'Go-to-market',
  'Hiring & culture',
  'Leadership',
  'Personal growth',
  'Marketing',
  'Design',
  'Career advice',
  'AI & tech trends',
];
const TONES = [
  'Warm & personal',
  'Direct & punchy',
  'Analytical & data-led',
  'Inspirational',
  'Witty / playful',
  'Calm & thoughtful',
];

const TOTAL_STEPS = 5;

export function OnboardingWizard({ initial }: { initial: VoiceProfileInput | null }) {
  const router = useRouter();

  const [step, setStep] = useState(0);
  const [industry, setIndustry] = useState(initial?.industry ?? '');
  const [seniority, setSeniority] = useState(initial?.seniority ?? '');
  const [topics, setTopics] = useState<string[]>(initial?.topics ?? []);
  const [tone, setTone] = useState(initial?.tone ?? '');
  const [sample, setSample] = useState(initial?.writingSample ?? '');
  const [building, setBuilding] = useState(false);

  function toggleTopic(t: string) {
    setTopics((prev) => {
      if (prev.includes(t)) return prev.filter((x) => x !== t);
      if (prev.length >= 3) {
        toast('Pick up to 3');
        return prev;
      }
      return [...prev, t];
    });
  }

  async function finish() {
    setBuilding(true);
    try {
      const res = await fetch('/api/post/voice-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          industry: industry.trim(),
          seniority,
          topics,
          tone,
          writingSample: sample.trim(),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        toast(data.error ?? 'Could not build your voice profile');
        setBuilding(false);
        return;
      }
      toast('Voice profile built ✓');
      router.push('/post/generate');
    } catch {
      toast('Network error — please try again');
      setBuilding(false);
    }
  }

  function next() {
    if (step === 0 && !industry.trim()) return toast('Tell us your industry');
    if (step === 1 && !seniority) return toast('Pick your seniority');
    if (step === 2 && topics.length === 0) return toast('Pick at least 1 topic');
    if (step === 3 && !tone) return toast('Pick a tone');
    if (step === 4) return void finish();
    setStep((s) => s + 1);
  }

  function back() {
    if (step > 0) setStep((s) => s - 1);
  }

  return (
    <div className="card">
      <div className="steps">
        {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
          <div key={i} className={`dot${i <= step ? ' on' : ''}`} />
        ))}
      </div>

      {step === 0 && (
        <div>
          <h2>1 · What&apos;s your industry?</h2>
          <p className="muted" style={{ marginTop: -6 }}>
            We tune tone, examples and jargon to your world.
          </p>
          <input
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            placeholder="e.g. SaaS / fintech, D2C brand, management consulting…"
            autoFocus
          />
        </div>
      )}

      {step === 1 && (
        <div>
          <h2>2 · What&apos;s your seniority?</h2>
          <div className="chips">
            {SENIORITY.map((t) => (
              <span
                key={t}
                role="button"
                tabIndex={0}
                className={`chip${seniority === t ? ' on' : ''}`}
                onClick={() => setSeniority(t)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') setSeniority(t);
                }}
              >
                {t}
              </span>
            ))}
          </div>
        </div>
      )}

      {step === 2 && (
        <div>
          <h2>3 · Pick up to 3 topics you want to be known for</h2>
          <div className="chips">
            {TOPICS.map((t) => (
              <span
                key={t}
                role="button"
                tabIndex={0}
                className={`chip${topics.includes(t) ? ' on' : ''}`}
                onClick={() => toggleTopic(t)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') toggleTopic(t);
                }}
              >
                {t}
              </span>
            ))}
          </div>
          <p className="hint">Selected: {topics.length}/3</p>
        </div>
      )}

      {step === 3 && (
        <div>
          <h2>4 · How do you want to sound?</h2>
          <div className="chips">
            {TONES.map((t) => (
              <span
                key={t}
                role="button"
                tabIndex={0}
                className={`chip${tone === t ? ' on' : ''}`}
                onClick={() => setTone(t)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') setTone(t);
                }}
              >
                {t}
              </span>
            ))}
          </div>
        </div>
      )}

      {step === 4 && (
        <div>
          <h2>5 · Give me a writing sample</h2>
          <p className="muted" style={{ marginTop: -6 }}>
            Paste an existing post, or just describe how you talk. Claude learns your rhythm from this.
          </p>
          <textarea
            value={sample}
            onChange={(e) => setSample(e.target.value)}
            placeholder="Paste a LinkedIn post you've written, or type a few sentences the way you'd actually say them…"
          />
          <p className="hint">
            In the real product you&apos;d send a WhatsApp voice note here — we transcribe it via Whisper.
          </p>
        </div>
      )}

      <div className="row" style={{ marginTop: 18, justifyContent: 'space-between' }}>
        <button
          className="btn ghost sm"
          onClick={back}
          style={{ visibility: step > 0 ? 'visible' : 'hidden' }}
          disabled={building}
        >
          ← Back
        </button>
        <button className="btn" onClick={next} disabled={building}>
          {building ? (
            <>
              <Spinner /> Building your voice…
            </>
          ) : step === 4 ? (
            '✓ Build my voice profile'
          ) : (
            'Continue →'
          )}
        </button>
      </div>
    </div>
  );
}
