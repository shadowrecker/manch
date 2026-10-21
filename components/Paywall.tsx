'use client';

import Link from 'next/link';
import { TIERS } from '@/lib/pricing';
import type { Plan } from '@/lib/plans';

// Reusable upgrade modal for every module. Presentational only — each option
// deep-links to /settings/billing where Razorpay checkout happens, so no page
// needs to embed payment logic. `plans` narrows the offered tiers (default:
// the consumer ladder) and `extra` lets a module add its own option (e.g. the
// Reels content pack).
export function Paywall({
  open,
  title,
  message,
  onClose,
  plans = ['plus', 'pro', 'team'],
  extra,
}: {
  open: boolean;
  title?: string;
  message?: string;
  onClose: () => void;
  plans?: Plan[];
  extra?: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div
      className="modal show"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="box">
        <h2>{title ?? 'Upgrade your plan'}</h2>
        {message && <p className="muted">{message}</p>}
        <p className="hint">One Manch plan unlocks Post, Reels, Deals and Check.</p>
        <div style={{ margin: '16px 0', textAlign: 'left' }}>
          {TIERS.filter((t) => plans.includes(t.plan)).map((t) => (
            <Link
              key={t.plan}
              href={`/settings/billing?plan=${t.plan}`}
              className="btn ghost sm"
              style={{ width: '100%', justifyContent: 'space-between', marginBottom: 8 }}
              onClick={onClose}
            >
              <span>
                <b>{t.name}</b> — {t.priceMonthly}
                <span className="muted" style={{ fontWeight: 400 }}>
                  {' '}
                  {t.sub}
                </span>
              </span>
              <span>Choose →</span>
            </Link>
          ))}
          {extra}
        </div>
        <button className="btn" style={{ width: '100%' }} onClick={onClose}>
          Maybe later
        </button>
      </div>
    </div>
  );
}
