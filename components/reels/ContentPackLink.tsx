'use client';

import Link from 'next/link';
import { CONTENT_PACK_CREDITS, CONTENT_PACK_PRICE_PAISE } from '@/lib/pricing';
import { formatINR } from '@/lib/utils';

// The Reels "entry drug" (PRD §12): a one-time ₹49 content pack, offered inside
// the core <Paywall> via its `extra` slot. Bought on the core billing page.
export function ContentPackLink({ onClick }: { onClick?: () => void }) {
  return (
    <Link
      href="/settings/billing"
      className="btn ghost sm"
      style={{ width: '100%', justifyContent: 'space-between', marginBottom: 8 }}
      onClick={onClick}
    >
      <span>
        🎟️ Buy a {formatINR(CONTENT_PACK_PRICE_PAISE)} content pack — <b>{CONTENT_PACK_CREDITS} credits</b>{' '}
        <span className="muted">one-time</span>
      </span>
      <span>Buy →</span>
    </Link>
  );
}
