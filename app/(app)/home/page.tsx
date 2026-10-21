import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getUser } from '@/lib/supabase/server';
import { getProfile, getUsage } from '@/lib/db/queries';
import { MODULE_NAV } from '@/lib/nav';
import { PLAN_LABEL, moduleTiers, normalisePlan, type ModuleKey } from '@/lib/plans';
import { quotaState as postQuota } from '@/lib/modules/post/entitlements';
import { quotaState as reelsQuota } from '@/lib/modules/reels/entitlements';
import { pitchQuota } from '@/lib/modules/deals/entitlements';
import type { QuotaState } from '@/lib/modules/post/entitlements';

// Home — the one dashboard across the four modules: this month's usage, what
// the current plan unlocks in each module, and where to go next.
export const dynamic = 'force-dynamic';

function meter(label: string, q: QuotaState): string {
  return q.unlimited ? `${q.used} ${label} this month · unlimited` : `${q.used} / ${q.limit} ${label} this month`;
}

export default async function HomePage() {
  const user = await getUser();
  if (!user) redirect('/login');

  const profile = await getProfile(user.id);
  const plan = normalisePlan(profile?.plan);
  const [posts, pieces, pitches] = await Promise.all([
    getUsage(user.id, 'posts'),
    getUsage(user.id, 'pieces'),
    getUsage(user.id, 'pitches'),
  ]);

  const tiers = moduleTiers(plan);
  const meters: Record<ModuleKey, string> = {
    post: meter('posts', postQuota(plan, posts)),
    reels: meter('Reel pieces', reelsQuota(plan, pieces)),
    deals: meter('pitches', pitchQuota(plan, pitches)),
    check: tiers.check === 'free' ? '10 free checks a month on WhatsApp' : 'Unlimited checks · photos & videos',
  };
  const firstName = profile?.full_name?.split(' ')[0];

  return (
    <>
      <div className="card">
        <h1>{firstName ? `Namaste, ${firstName} 🙏` : 'Namaste 🙏'}</h1>
        <p className="sub">
          You’re on the <b>{PLAN_LABEL[plan]}</b> plan. One account, four tools — create, grow, earn and
          stay credible.
        </p>
        <div className="journey">
          <b>Create</b> a post or Reel → <b>Grow</b> your audience → <b>Earn</b> from brand deals →{' '}
          <b>Check</b> before you share
        </div>
      </div>

      <div className="module-cards">
        {MODULE_NAV.map((m) => (
          <Link key={m.key} href={m.home} className="module-card" data-module={m.key}>
            <span className="icon" aria-hidden>
              {m.icon}
            </span>
            <h2 style={{ margin: 0 }}>Manch {m.label}</h2>
            <p className="muted" style={{ margin: 0 }}>
              {m.pitch}
            </p>
            <span className="meter">{meters[m.key]}</span>
            <span className="hint">{m.channel}</span>
          </Link>
        ))}
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <h2>One WhatsApp number for everything</h2>
        <p className="muted">
          Save the Manch number and send a voice note for LinkedIn posts or Reel scripts — or forward any
          suspicious message to fact-check it. Type <b>menu</b> to switch.
        </p>
        <div className="row">
          {!profile?.whatsapp_e164 && (
            <Link href="/settings/profile" className="btn sm">
              Link your WhatsApp number
            </Link>
          )}
          <Link href="/settings/billing" className="btn ghost sm">
            See plans
          </Link>
        </div>
      </div>
    </>
  );
}
