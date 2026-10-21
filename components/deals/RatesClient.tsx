'use client';

import { useState } from 'react';
import { Paywall } from '@/components/Paywall';
import { Spinner } from '@/components/ui/spinner';
import { toast } from '@/components/ui/toast';
import { formatINR } from '@/lib/utils';
import type { ApiError, Deliverable, RateBenchmark } from '@/lib/modules/deals/types';

interface Card {
  niche: string;
  band: string;
  rates: RateBenchmark[];
  suggestedRatePaise: number | null;
}

const LABELS: Record<Deliverable, string> = {
  reel: 'Reel',
  story: 'Story',
  post: 'Feed post',
  bundle: 'Bundle',
};

export function RatesClient({ canRate, card }: { canRate: boolean; card: Card | null }) {
  const [rationale, setRationale] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [paywall, setPaywall] = useState(false);

  const hasRates = !!card && card.rates.length > 0;

  async function getTips() {
    if (!canRate) {
      setPaywall(true);
      return;
    }
    setLoading(true);
    try {
      const r = await fetch('/api/deals/rates', { method: 'POST' });
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
        toast(e.error || 'Could not load tips');
        return;
      }
      const d = (await r.json()) as { rationale: string | null };
      setRationale(d.rationale ?? 'No benchmark data for your niche yet.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="card">
        <h1 style={{ margin: 0 }}>Rate Calculator</h1>
        <p className="sub" style={{ margin: '4px 0 0' }}>
          What creators like you charge brands — market data for {card?.niche ?? 'your niche'} · {card?.band ?? 'your size'}.
        </p>
        {card?.suggestedRatePaise != null && (
          <div className="rate-hero" style={{ marginTop: 14 }}>
            <span className="muted">Suggested starting rate (per reel)</span>
            <b>{formatINR(card.suggestedRatePaise)}</b>
          </div>
        )}
      </div>

      {!hasRates ? (
        <div className="card empty">
          <p>No benchmark for your niche and audience size yet. We add new data continuously — check back soon.</p>
        </div>
      ) : (
        <div className="card">
          <div className="rate-list">
            <div className="rate-row">
              <span className="h">Deliverable</span>
              <span className="h">Low (p25)</span>
              <span className="h">Market (p50)</span>
              <span className="h">High (p75)</span>
            </div>
            {card!.rates.map((r) => (
              <div className="rate-row" key={r.deliverable}>
                <span>{LABELS[r.deliverable] ?? r.deliverable}</span>
                <span>{formatINR(r.p25Paise)}</span>
                <span><b>{formatINR(r.p50Paise)}</b></span>
                <span>{formatINR(r.p75Paise)}</span>
              </div>
            ))}
          </div>

          <div className="row" style={{ marginTop: 14 }}>
            <button className="btn" onClick={getTips} disabled={loading}>
              {loading ? <><Spinner /> Thinking…</> : '💡 Get negotiation tips'}
            </button>
          </div>
          {rationale && (
            <div className="rationale" style={{ marginTop: 12 }}>
              <div className="lbl">How to negotiate</div>
              <p>{rationale}</p>
            </div>
          )}
        </div>
      )}

      <Paywall
        open={paywall}
        title="Unlock the Rate Calculator"
        message="See exactly what creators in your niche charge, with AI negotiation tips. Upgrade to Plus."
        plans={['plus', 'pro']}
        onClose={() => setPaywall(false)}
      />
    </>
  );
}
