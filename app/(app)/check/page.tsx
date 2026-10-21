import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getUser } from '@/lib/supabase/server';
import { getProfile } from '@/lib/db/queries';
import { getRecentChecksForUser } from '@/lib/modules/check/queries';
import { planLimits } from '@/lib/modules/check/entitlements';
import { PLAN_LABEL, checkTier, normalisePlan } from '@/lib/plans';
import { env } from '@/lib/env';
import { UpgradeCta } from '@/components/check/UpgradeCta';

export const dynamic = 'force-dynamic';

// /check — Manch Check home (formerly TrustCheck's dashboard).
export default async function CheckDashboardPage() {
  const user = await getUser();
  if (!user) redirect('/login');

  const [profile, checks] = await Promise.all([getProfile(user.id), getRecentChecksForUser(user.id, 5)]);
  const plan = normalisePlan(profile?.plan);
  const limits = planLimits(plan);
  const waNumber = env.whatsappBotNumber;
  const waLink = waNumber ? `https://wa.me/${waNumber.replace(/[^0-9]/g, '')}?text=check` : '#';

  return (
    <>
      <div className="card">
        <h1 style={{ margin: 0 }}>Check before you share ✅</h1>
        <p className="sub" style={{ margin: '4px 0 0' }}>
          You’re on the <b style={{ color: 'var(--brand)' }}>{PLAN_LABEL[plan]}</b> plan. Manch Check works on WhatsApp — forward anything suspicious to verify it.
        </p>
        {!profile?.whatsapp_e164 && (
          <p className="hint" style={{ margin: '8px 0 0' }}>
            <Link href="/settings/profile">Link your WhatsApp number</Link> so checks you run on WhatsApp use your plan and show up here.
          </p>
        )}
        <div className="row" style={{ marginTop: 14 }}>
          <a className="btn" href={waLink}>💬 Open Manch on WhatsApp</a>
          <Link className="btn ghost" href="/settings/billing">Plans</Link>
          {checkTier(plan) === 'free' && <UpgradeCta />}
        </div>
      </div>

      <div className="card">
        <h2>What you get</h2>
        <ul className="hint" style={{ lineHeight: 1.9 }}>
          <li>{limits.checksPerMonth >= 2000 ? 'Unlimited' : `${limits.checksPerMonth}`} checks / month</li>
          <li>{limits.media ? 'Text, image and video' : 'Text only (upgrade for media)'}</li>
          <li>{limits.allLanguages ? 'All languages' : 'English & Hindi (upgrade for all languages)'}</li>
          {limits.apiAccess && <li>Newsroom JSON API — <Link href="/check/api-console">manage keys</Link></li>}
        </ul>
      </div>

      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0 }}>Recent checks</h2>
          <Link className="btn ghost sm" href="/check/history">See all →</Link>
        </div>
        {checks.length === 0 ? (
          <p className="empty">No checks yet. Forward a message to Manch on WhatsApp to get started.</p>
        ) : (
          <div style={{ marginTop: 10 }}>
            {checks.map((c) => (
              <div key={c.id} className="claim-row">
                <span className={`vlabel ${c.verdict_label ?? 'unverified'}`}>{c.verdict_label ?? 'pending'}</span>{' '}
                <span className="hint">{c.trust_score != null ? `${c.trust_score}/10` : ''} · {c.input_type}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
