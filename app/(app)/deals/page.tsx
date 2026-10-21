import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getUser } from '@/lib/supabase/server';
import { getProfile } from '@/lib/db/queries';
import { PLAN_LABEL } from '@/lib/plans';
import { getDashboardData } from '@/lib/modules/deals/services/dashboard';
import { planLimits, FAIR_USE_CAP } from '@/lib/modules/deals/entitlements';
import { formatINR } from '@/lib/utils';

// /deals — the Manch Deals dashboard (formerly CreatorStack's /dashboard):
// the wedge (stats + media kit) and the money loop (matches → pitches → paid deals).
export const dynamic = 'force-dynamic';

function quota(used: number, limit: number): string {
  return limit >= FAIR_USE_CAP ? `${used} · unlimited` : `${used} / ${limit}`;
}

export default async function DealsDashboardPage() {
  const user = await getUser();
  if (!user) redirect('/login');

  const [profile, data] = await Promise.all([getProfile(user.id), getDashboardData(user.id)]);
  const limits = planLimits(data.plan);
  const name = profile?.full_name?.split(' ')[0] || 'creator';

  return (
    <>
      <div className="card">
        <h1 style={{ margin: 0 }}>Hi {name} 👋</h1>
        <p className="sub" style={{ margin: '4px 0 0' }}>
          You’re on the <b style={{ color: 'var(--brand)' }}>{PLAN_LABEL[data.plan]}</b> plan. Here’s your creator business at a glance.
        </p>
        <div className="stats" style={{ marginTop: 14 }}>
          <div className="stat">
            <b>{data.followers != null ? data.followers.toLocaleString('en-IN') : '—'}</b>
            <span>Followers</span>
          </div>
          <div className="stat">
            <b>{data.engagementRate != null ? `${data.engagementRate}%` : '—'}</b>
            <span>Engagement</span>
          </div>
          <div className="stat">
            <b>{formatINR(data.deals.gmvPaise)}</b>
            <span>GMV (paid)</span>
          </div>
          <div className="stat">
            <b>{formatINR(data.deals.commissionPaise)}</b>
            <span>Platform fee paid</span>
          </div>
        </div>
      </div>

      <div className="dash-cards">
        <Link href="/deals/media-kit" className="dash-card">
          <span className="dl">Media Kit</span>
          <b>{data.kitShareId ? 'Ready ✓' : data.hasMetrics ? 'Generate now' : 'Connect Instagram'}</b>
          <span className="dh">{quota(data.usage.mediaKits, limits.mediaKitsPerMonth)} this month</span>
        </Link>
        <Link href="/deals/matches" className="dash-card">
          <span className="dl">Brand Matches</span>
          <b>{data.matchesCount > 0 ? `${data.matchesCount} matches` : 'Find brands'}</b>
          <span className="dh">{data.topMatch ? `Top: ${data.topMatch.name} (${data.topMatch.fitScore})` : limits.brandMatch ? 'Run the engine' : 'Plus feature'}</span>
        </Link>
        <Link href="/deals/rates" className="dash-card">
          <span className="dl">Rate Calculator</span>
          <b>{limits.rateCalculator ? 'View rates' : 'Plus feature'}</b>
          <span className="dh">Know what to charge</span>
        </Link>
        <Link href="/deals/pipeline" className="dash-card">
          <span className="dl">Deals</span>
          <b>{data.deals.total > 0 ? `${data.deals.total} deals` : 'Track a deal'}</b>
          <span className="dh">{data.deals.pending > 0 ? `${data.deals.pending} awaiting payment` : `${data.deals.collected} paid`}</span>
        </Link>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Pitches</h2>
        <p className="sub">{quota(data.usage.pitches, limits.pitchesPerMonth)} pitches used this month.</p>
        <div className="row">
          <Link className="btn ghost sm" href="/deals/matches">Find a brand to pitch →</Link>
          {!limits.brandMatch && (
            <Link className="btn ghost sm" href="/settings/billing?plan=plus">Upgrade for brand matches</Link>
          )}
        </div>
      </div>
    </>
  );
}
