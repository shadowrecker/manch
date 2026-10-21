'use client';

import { useRef, useState } from 'react';
import { toPng } from 'html-to-image';
import { MediaKitCard } from '@/components/deals/MediaKitCard';
import { Paywall } from '@/components/Paywall';
import { Spinner } from '@/components/ui/spinner';
import { toast } from '@/components/ui/toast';
import type { ApiError, IgMetrics, MediaKitData } from '@/lib/modules/deals/types';

export function MediaKitClient({
  appUrl,
  name,
  metrics: initialMetrics,
  kit: initialKit,
  shareId: initialShareId,
}: {
  appUrl: string;
  name: string | null;
  metrics: IgMetrics | null;
  kit: MediaKitData | null;
  shareId: string | null;
}) {
  const [metrics, setMetrics] = useState<IgMetrics | null>(initialMetrics);
  const [kit, setKit] = useState<MediaKitData | null>(initialKit);
  const [shareId, setShareId] = useState<string | null>(initialShareId);
  const [loading, setLoading] = useState(false);
  const [paywall, setPaywall] = useState(false);
  const [showManual, setShowManual] = useState(!initialMetrics);

  const [followers, setFollowers] = useState('');
  const [niche, setNiche] = useState('');
  const [city, setCity] = useState('');
  const [style, setStyle] = useState('');
  const cardRef = useRef<HTMLDivElement>(null);

  async function saveManual() {
    const f = Number(followers);
    if (!Number.isFinite(f) || f <= 0) {
      toast('Enter your follower count');
      return;
    }
    setLoading(true);
    try {
      const niches = niche.split(',').map((s) => s.trim()).filter(Boolean);
      const r = await fetch('/api/deals/instagram/manual', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ followers: f, niche: niches, city, contentStyle: style }),
      });
      if (!r.ok) {
        toast('Could not save');
        return;
      }
      setMetrics({ followers: f, engagementRate: null, avgLikes: null, avgComments: null, topCategories: niches, audience: null });
      setShowManual(false);
      toast('Stats saved ✓');
    } finally {
      setLoading(false);
    }
  }

  async function generate() {
    setLoading(true);
    try {
      const r = await fetch('/api/deals/media-kit/generate', { method: 'POST' });
      if (r.status === 402) {
        setPaywall(true);
        return;
      }
      if (r.status === 409) {
        toast('Add your stats first');
        setShowManual(true);
        return;
      }
      if (!r.ok) {
        const e = (await r.json().catch(() => ({}))) as ApiError;
        toast(e.error || 'Something went wrong');
        return;
      }
      const d = (await r.json()) as { kit: MediaKitData; metrics: IgMetrics; shareId: string };
      setKit(d.kit);
      setMetrics(d.metrics);
      setShareId(d.shareId);
      toast('Media kit ready ✨');
    } finally {
      setLoading(false);
    }
  }

  async function downloadImage() {
    if (!cardRef.current) return;
    try {
      const url = await toPng(cardRef.current, { pixelRatio: 2, backgroundColor: '#0c1822' });
      const a = document.createElement('a');
      a.href = url;
      a.download = 'media-kit.png';
      a.click();
      toast('Downloaded');
    } catch {
      toast('Could not export');
    }
  }

  function copyShare() {
    if (!shareId) return;
    navigator.clipboard?.writeText(`${appUrl}/kit/${shareId}`);
    toast('Share link copied');
  }

  return (
    <>
      <div className="card">
        <h1>Your Media Kit</h1>
        <p className="sub">Connect Instagram (or enter your stats) → a professional media kit in 2 minutes.</p>

        {showManual ? (
          <>
            <div className="row" style={{ marginBottom: 8 }}>
              <a className="btn ghost sm" href="/api/deals/instagram/connect">📷 Connect Instagram</a>
              <span className="hint">or enter your stats manually below</span>
            </div>
            <label>Followers</label>
            <input value={followers} onChange={(e) => setFollowers(e.target.value)} placeholder="e.g. 8500" inputMode="numeric" />
            <label>Niche (comma-separated)</label>
            <input value={niche} onChange={(e) => setNiche(e.target.value)} placeholder="e.g. home cooking, recipes" />
            <div className="grid2">
              <div>
                <label>City</label>
                <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g. Lucknow" />
              </div>
              <div>
                <label>Content style</label>
                <input value={style} onChange={(e) => setStyle(e.target.value)} placeholder="e.g. warm, practical" />
              </div>
            </div>
            <div className="row" style={{ marginTop: 12 }}>
              <button className="btn" onClick={saveManual} disabled={loading}>
                {loading ? <Spinner /> : 'Save my stats'}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="badge">
              📷 {metrics?.followers?.toLocaleString('en-IN') ?? '—'} followers
              {metrics?.engagementRate != null ? ` · ${metrics.engagementRate}% engagement` : ''}
              <a href="#" onClick={(e) => { e.preventDefault(); setShowManual(true); }} style={{ marginLeft: 8 }}>edit</a>
            </div>
            <div className="row" style={{ marginTop: 12 }}>
              <button className="btn" onClick={generate} disabled={loading}>
                {loading ? <><Spinner /> Building…</> : kit ? 'Regenerate media kit' : '✨ Generate my media kit'}
              </button>
            </div>
          </>
        )}
      </div>

      {kit && metrics && (
        <div className="card">
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ margin: 0 }}>Ready to send</h2>
            <div className="row">
              <button className="btn ghost sm" onClick={downloadImage}>⬇️ Download</button>
              {shareId && <button className="btn ghost sm" onClick={copyShare}>🔗 Share link</button>}
            </div>
          </div>
          <div ref={cardRef} style={{ marginTop: 12 }}>
            <MediaKitCard kit={kit} metrics={metrics} name={name} />
          </div>
        </div>
      )}

      <Paywall
        open={paywall}
        title="Unlimited media kits"
        message="Free includes 1 media kit. Upgrade to Plus for unlimited."
        plans={['plus', 'pro']}
        onClose={() => setPaywall(false)}
      />
    </>
  );
}
