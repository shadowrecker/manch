'use client';

import { useState } from 'react';
import { Paywall } from '@/components/Paywall';
import { Spinner } from '@/components/ui/spinner';
import { toast } from '@/components/ui/toast';
import { formatINR } from '@/lib/utils';
import type { ApiError, Deliverable } from '@/lib/modules/deals/types';

const DELIVERABLES: { key: Deliverable; label: string }[] = [
  { key: 'reel', label: 'Reel' },
  { key: 'story', label: 'Story' },
  { key: 'post', label: 'Feed post' },
  { key: 'bundle', label: 'Bundle' },
];

interface Result {
  subject: string;
  body: string;
  proposedRatePaise: number | null;
}

export function PitchClient({ brandId, brandName, brandNiche }: { brandId: string; brandName: string; brandNiche: string[] }) {
  const [selected, setSelected] = useState<Deliverable[]>(['reel']);
  const [result, setResult] = useState<Result | null>(null);
  const [subject, setSubject] = useState('');
  const [bodyText, setBodyText] = useState('');
  const [loading, setLoading] = useState(false);
  const [paywall, setPaywall] = useState(false);

  function toggle(d: Deliverable) {
    setSelected((s) => (s.includes(d) ? s.filter((x) => x !== d) : [...s, d]));
  }

  async function generate() {
    setLoading(true);
    try {
      const r = await fetch('/api/deals/pitch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ brandId, deliverables: selected.length ? selected : ['reel'] }),
      });
      if (r.status === 402) {
        setPaywall(true);
        return;
      }
      if (r.status === 409) {
        toast('Add your stats first — head to Media Kit');
        return;
      }
      if (!r.ok) {
        const e = (await r.json().catch(() => ({}))) as ApiError;
        toast(e.error || 'Could not write your pitch');
        return;
      }
      const d = (await r.json()) as Result;
      setResult(d);
      setSubject(d.subject);
      setBodyText(d.body);
      toast('Pitch ready ✍️');
    } finally {
      setLoading(false);
    }
  }

  function copyAll() {
    navigator.clipboard?.writeText(`Subject: ${subject}\n\n${bodyText}`);
    toast('Pitch copied');
  }

  return (
    <>
      <div className="card">
        <h1 style={{ margin: 0 }}>Pitch {brandName}</h1>
        {brandNiche.length > 0 && <p className="sub" style={{ margin: '4px 0 0' }}>{brandNiche.slice(0, 4).join(' · ')}</p>}

        <label style={{ marginTop: 14, display: 'block' }}>Deliverables</label>
        <div className="chips">
          {DELIVERABLES.map((d) => (
            <button
              key={d.key}
              type="button"
              className={`chip${selected.includes(d.key) ? ' on' : ''}`}
              onClick={() => toggle(d.key)}
            >
              {d.label}
            </button>
          ))}
        </div>

        <div className="row" style={{ marginTop: 14 }}>
          <button className="btn" onClick={generate} disabled={loading}>
            {loading ? <><Spinner /> Writing…</> : result ? 'Rewrite pitch' : '✍️ Write my pitch'}
          </button>
        </div>
      </div>

      {result && (
        <div className="card">
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ margin: 0 }}>Your pitch</h2>
            <button className="btn ghost sm" onClick={copyAll}>📋 Copy</button>
          </div>
          {result.proposedRatePaise != null && (
            <div className="badge" style={{ marginTop: 8 }}>Suggested rate: {formatINR(result.proposedRatePaise)}</div>
          )}
          <label style={{ marginTop: 12 }}>Subject</label>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} />
          <label style={{ marginTop: 10 }}>Body</label>
          <textarea value={bodyText} onChange={(e) => setBodyText(e.target.value)} rows={12} />
          <p className="hint" style={{ marginTop: 8 }}>AI-assisted — review and personalise before sending.</p>
        </div>
      )}

      <Paywall
        open={paywall}
        title="You’ve used your pitches"
        message="Upgrade to Plus for 10 pitches a month (Pro for unlimited)."
        plans={['plus', 'pro']}
        onClose={() => setPaywall(false)}
      />
    </>
  );
}
