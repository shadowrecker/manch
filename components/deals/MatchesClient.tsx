'use client';

import { useState } from 'react';
import { Paywall } from '@/components/Paywall';
import { Spinner } from '@/components/ui/spinner';
import { toast } from '@/components/ui/toast';
import type { ApiError, BrandMatch } from '@/lib/modules/deals/types';

function fitClass(score: number): string {
  if (score >= 80) return 'fit strong';
  if (score >= 50) return 'fit ok';
  return 'fit weak';
}

export function MatchesClient({ canMatch, initialMatches }: { canMatch: boolean; initialMatches: BrandMatch[] }) {
  const [matches, setMatches] = useState<BrandMatch[]>(initialMatches);
  const [loading, setLoading] = useState(false);
  const [paywall, setPaywall] = useState(false);

  async function run() {
    if (!canMatch) {
      setPaywall(true);
      return;
    }
    setLoading(true);
    try {
      const r = await fetch('/api/deals/matches', { method: 'POST' });
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
        toast(e.error || 'Could not run matches');
        return;
      }
      const d = (await r.json()) as { matches: BrandMatch[] };
      setMatches(d.matches);
      toast(d.matches.length ? `Found ${d.matches.length} brand matches` : 'No matches yet — try again soon');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ margin: 0 }}>Brand Matches</h1>
            <p className="sub" style={{ margin: '4px 0 0' }}>Brands that fit your niche, audience and size — ranked, with reasons.</p>
          </div>
          <button className="btn" onClick={run} disabled={loading}>
            {loading ? <><Spinner /> Matching…</> : matches.length ? 'Refresh matches' : '✨ Find my matches'}
          </button>
        </div>
      </div>

      {matches.length === 0 ? (
        <div className="card empty">
          <p>No matches yet. Hit <b>Find my matches</b> and we’ll surface brands that fit you.</p>
        </div>
      ) : (
        <div className="card">
          {matches.map((m) => (
            <div className="match-row" key={m.brandId}>
              <div className={fitClass(m.fitScore)}>{m.fitScore}</div>
              <div style={{ flex: 1 }}>
                <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                  <b>{m.name}</b>
                  {m.niche && m.niche.length > 0 && <span className="hint">{m.niche.slice(0, 3).join(' · ')}</span>}
                </div>
                {m.reasons.length > 0 && <div className="reasons">{m.reasons.join(' · ')}</div>}
                <div className="row" style={{ marginTop: 6 }}>
                  <a className="btn ghost sm" href={`/deals/pitch/${encodeURIComponent(m.brandId)}`}>✍️ Write pitch</a>
                  {m.website && (
                    <a className="btn ghost sm" href={m.website} target="_blank" rel="noreferrer">Visit ↗</a>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Paywall
        open={paywall}
        title="Unlock brand matches"
        message="The match engine finds brands that fit your niche and audience. Upgrade to Plus to unlock."
        plans={['plus', 'pro']}
        onClose={() => setPaywall(false)}
      />
    </>
  );
}
