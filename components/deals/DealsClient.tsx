'use client';

import { useState } from 'react';
import { Paywall } from '@/components/Paywall';
import { Spinner } from '@/components/ui/spinner';
import { toast } from '@/components/ui/toast';
import { formatINR } from '@/lib/utils';
import type { ApiError, CommissionStatus, DealStatus } from '@/lib/modules/deals/types';

export interface DealView {
  id: string;
  brandName: string | null;
  title: string | null;
  valuePaise: number | null;
  status: DealStatus;
  commissionStatus: CommissionStatus;
  commissionPaise: number | null;
}

const STATUS_LABEL: Record<CommissionStatus, string> = {
  none: 'Not collected',
  pending: 'Awaiting payment',
  collected: 'Commission paid ✓',
  waived: 'Waived',
};

export function DealsClient({ canTrackDeals, initialDeals }: { canTrackDeals: boolean; initialDeals: DealView[] }) {
  const [deals, setDeals] = useState<DealView[]>(initialDeals);
  const [brandName, setBrandName] = useState('');
  const [value, setValue] = useState('');
  const [adding, setAdding] = useState(false);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [paywall, setPaywall] = useState(false);

  async function addDeal() {
    if (!canTrackDeals) {
      setPaywall(true);
      return;
    }
    if (!brandName.trim()) {
      toast('Add a brand name');
      return;
    }
    setAdding(true);
    try {
      const valueRupees = Number(value);
      const r = await fetch('/api/deals/pipeline', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ brandName, valueRupees: Number.isFinite(valueRupees) && valueRupees > 0 ? valueRupees : undefined }),
      });
      if (r.status === 402) {
        setPaywall(true);
        return;
      }
      if (!r.ok) {
        toast('Could not add the deal');
        return;
      }
      const { deal } = (await r.json()) as { deal: { id: string; brand_name: string | null; value_paise: number | null; status: DealStatus; commission_status: CommissionStatus; commission_paise: number | null } };
      setDeals((d) => [
        { id: deal.id, brandName: deal.brand_name, title: null, valuePaise: deal.value_paise, status: deal.status, commissionStatus: deal.commission_status, commissionPaise: deal.commission_paise },
        ...d,
      ]);
      setBrandName('');
      setValue('');
      toast('Deal added');
    } finally {
      setAdding(false);
    }
  }

  async function collect(id: string) {
    setPayingId(id);
    try {
      const r = await fetch(`/api/deals/pipeline/${id}/payment`, { method: 'POST' });
      if (r.status === 409) {
        toast('Add the deal value first');
        return;
      }
      if (!r.ok) {
        const e = (await r.json().catch(() => ({}))) as ApiError;
        toast(e.error || 'Could not generate payment link');
        return;
      }
      const d = (await r.json()) as { url: string; needsKyc: boolean };
      setDeals((list) => list.map((x) => (x.id === id ? { ...x, commissionStatus: 'pending' } : x)));
      if (d.needsKyc) toast('Tip: complete payout KYC to auto-split your 95%.');
      window.open(d.url, '_blank', 'noopener');
    } finally {
      setPayingId(null);
    }
  }

  return (
    <>
      <div className="card">
        <h1 style={{ margin: 0 }}>Deals</h1>
        <p className="sub" style={{ margin: '4px 0 0' }}>Track closed deals and collect payment. We take 5% only when you get paid.</p>

        <div className="grid2" style={{ marginTop: 14 }}>
          <div>
            <label>Brand</label>
            <input value={brandName} onChange={(e) => setBrandName(e.target.value)} placeholder="e.g. Mamaearth" />
          </div>
          <div>
            <label>Deal value (₹)</label>
            <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="e.g. 25000" inputMode="numeric" />
          </div>
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn" onClick={addDeal} disabled={adding}>
            {adding ? <Spinner /> : '+ Add deal'}
          </button>
        </div>
      </div>

      {deals.length === 0 ? (
        <div className="card empty">
          <p>No deals yet. When you close one, add it here to collect payment and track your commission.</p>
        </div>
      ) : (
        <div className="card">
          {deals.map((d) => (
            <div className="deal-card" key={d.id}>
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <b>{d.brandName ?? 'Untitled deal'}</b>
                  <div className="hint">{d.valuePaise != null ? formatINR(d.valuePaise) : 'No value set'}</div>
                </div>
                <span className={`status-tag ${d.commissionStatus}`}>{STATUS_LABEL[d.commissionStatus]}</span>
              </div>
              <div className="row" style={{ marginTop: 10, justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="hint">
                  {d.commissionPaise != null ? `Platform fee (5%): ${formatINR(d.commissionPaise)}` : ''}
                </span>
                {d.commissionStatus !== 'collected' && (
                  <button className="btn ghost sm" onClick={() => collect(d.id)} disabled={payingId === d.id}>
                    {payingId === d.id ? <Spinner /> : '💸 Collect payment'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Paywall
        open={paywall}
        title="Track deals & collect payment"
        message="Deal tracking and platform-collected payments are a Plus feature. Upgrade to unlock."
        plans={['plus', 'pro']}
        onClose={() => setPaywall(false)}
      />
    </>
  );
}
