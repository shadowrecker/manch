'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { initials } from '@/lib/utils';
import { PLAN_LABEL, type Plan } from '@/lib/plans';

export interface Account {
  name: string | null;
  email: string | null;
  plan: Plan;
  /** Profile picture (Supabase Storage), or null to show initials. */
  avatarUrl?: string | null;
}

const LINKS = [
  { href: '/settings/profile', label: 'Profile' },
  { href: '/settings/billing', label: 'Plans & Billing' },
  { href: '/settings/team', label: 'Team' },
];

// The avatar button in the top bar → who you're signed in as, account links and
// Sign out. Closes on outside click, Escape, or choosing an item. Sign out is a
// form POST to /auth/signout (never a GET link, so prefetching can't log you out).
export function AccountMenu({ account }: { account: Account }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const display = account.name || account.email || 'Your account';

  return (
    <div className="account" ref={ref}>
      <button
        type="button"
        className="avatar"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        onClick={() => setOpen((o) => !o)}
      >
        {account.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- Supabase Storage URL, already 256px
          <img src={account.avatarUrl} alt="" width={34} height={34} />
        ) : (
          initials(account.name || account.email?.split('@')[0])
        )}
      </button>
      {open && (
        <div className="account-menu" role="menu">
          <div className="who">
            <b>{display}</b>
            {account.name && account.email && <span className="muted">{account.email}</span>}
            <span className="pill">{PLAN_LABEL[account.plan]} plan</span>
          </div>
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} role="menuitem" onClick={() => setOpen(false)}>
              {l.label}
            </Link>
          ))}
          <form action="/auth/signout" method="post">
            <button type="submit" role="menuitem" className="signout">
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
