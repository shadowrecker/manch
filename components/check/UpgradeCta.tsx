'use client';

import { useState } from 'react';
import { Paywall } from '@/components/Paywall';

// Free → Plus upsell for Check (media checks + every language + unlimited).
// Uses the shared Manch paywall, which deep-links to /settings/billing.
export function UpgradeCta({ label = 'Unlock photos, videos & every language' }: { label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn ghost" onClick={() => setOpen(true)}>
        ⭐ {label}
      </button>
      <Paywall
        open={open}
        onClose={() => setOpen(false)}
        plans={['plus', 'pro']}
        title="Check everything, in your language"
        message="Free covers 10 text checks a month in English & Hindi. Manch Plus unlocks unlimited checks, photo + video checks and all 8 languages."
      />
    </>
  );
}
