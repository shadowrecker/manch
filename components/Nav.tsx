'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MODULE_NAV, SETTINGS_TABS, isTabActive, moduleForPath } from '@/lib/nav';
import { PLAN_LABEL } from '@/lib/plans';
import { AccountMenu, type Account } from '@/components/AccountMenu';

// The one top bar for all of Manch: logo → Home, the module switcher
// (Post · Reels · Deals · Check), the plan badge, the account menu, and the
// active module's sub-tabs underneath.
export function Nav({ account }: { account: Account }) {
  const { plan } = account;
  const pathname = usePathname() ?? '';
  const active = moduleForPath(pathname);
  const subtabs = active ? MODULE_NAV.find((m) => m.key === active)!.tabs : SETTINGS_TABS;

  return (
    <>
      <header className="top">
        <Link href="/home" className="logo">
          <span className="mark">म</span> Manch
        </Link>
        <nav className="modules" aria-label="Modules">
          {MODULE_NAV.map((m) => (
            <Link key={m.key} href={m.home} className={active === m.key ? 'active' : ''}>
              <span aria-hidden>{m.icon}</span> {m.label}
            </Link>
          ))}
        </nav>
        <div className="top-right">
          <Link href="/settings/billing" className="planbadge">
            {PLAN_LABEL[plan]} plan
          </Link>
          <AccountMenu account={account} />
        </div>
      </header>
      <nav className="subtabs" aria-label="Sections">
        {subtabs.map((t) => (
          <Link key={t.href} href={t.href} className={isTabActive(pathname, t) ? 'active' : ''}>
            {t.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
