'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Spinner } from '@/components/ui/spinner';
import { toast } from '@/components/ui/toast';
import {
  B2B_TIERS,
  CONSUMER_TIERS,
  CONTENT_PACK_CREDITS,
  CONTENT_PACK_PRICE_PAISE,
  MAKEOVER_PRICE_PAISE,
  TIERS,
  type Tier,
} from '@/lib/pricing';
import { PLAN_LABEL, type Plan, type SelfServePlan } from '@/lib/plans';

// One pricing page for every module. Real behaviour:
//  - Choose a plan -> POST /api/billing/checkout -> open Razorpay Checkout with
//    the returned subscription_id/order_id.
//  - On payment success the *webhook* flips the plan; we just toast + refresh so
//    the new server-authoritative plan is reflected. Entitlements are never set
//    from the client.
//  - One-time orders: Post "Profile Makeover" (kind:"makeover") and the Reels
//    content pack (kind:"content_pack", +credits).

const CHECKOUT_SCRIPT = 'https://checkout.razorpay.com/v1/checkout.js';

type Billing = 'monthly' | 'yearly';

// Minimal shape of the global Razorpay constructor injected by checkout.js.
interface RazorpayCheckoutOptions {
  key: string;
  subscription_id?: string;
  order_id?: string;
  amount?: number;
  currency?: string;
  name: string;
  description?: string;
  handler?: (response: Record<string, string>) => void;
  modal?: { ondismiss?: () => void };
  theme?: { color?: string };
}
interface RazorpayInstance {
  open(): void;
  on(event: string, handler: (response: { error?: { description?: string } }) => void): void;
}
type RazorpayConstructor = new (options: RazorpayCheckoutOptions) => RazorpayInstance;

/** Inject the Razorpay Checkout script once; resolve when it is ready. */
function loadCheckoutScript(): Promise<RazorpayConstructor> {
  return new Promise((resolve, reject) => {
    const w = window as unknown as { Razorpay?: RazorpayConstructor };
    if (w.Razorpay) {
      resolve(w.Razorpay);
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${CHECKOUT_SCRIPT}"]`,
    );
    const onReady = () => {
      if (w.Razorpay) resolve(w.Razorpay);
      else reject(new Error('Razorpay failed to load'));
    };
    if (existing) {
      existing.addEventListener('load', onReady, { once: true });
      existing.addEventListener('error', () => reject(new Error('Razorpay failed to load')), {
        once: true,
      });
      return;
    }
    const script = document.createElement('script');
    script.src = CHECKOUT_SCRIPT;
    script.async = true;
    script.onload = onReady;
    script.onerror = () => reject(new Error('Razorpay failed to load'));
    document.body.appendChild(script);
  });
}

type CheckoutResponse =
  | { type: 'subscription'; subscriptionId: string; keyId: string }
  | { type: 'order'; orderId: string; amount: number; keyId: string };

type OneTimeKind = 'makeover' | 'content_pack';

export function BillingClient({
  currentPlan,
  preselect,
  keyId,
  credits = 0,
}: {
  currentPlan: Plan;
  preselect?: Plan;
  keyId: string;
  /** Reels content-pack credit balance. */
  credits?: number;
}) {
  const router = useRouter();
  const [billing, setBilling] = useState<Billing>('monthly');
  // Tracks which action is in flight so only that button shows a spinner.
  const [busy, setBusy] = useState<string | null>(null);
  const preselectRef = useRef(preselect);

  // If the user arrived via ?plan=… (e.g. from the Paywall), nudge them toward
  // that tier once on mount.
  useEffect(() => {
    if (preselectRef.current) {
      const t = TIERS.find((x) => x.plan === preselectRef.current);
      if (t) toast(`Choose ${t.name} to upgrade`);
    }
  }, []);

  function notConfigured(): boolean {
    if (!keyId) {
      toast('Payments are not configured yet. Please try again later.');
      return true;
    }
    return false;
  }

  async function startCheckout(body: {
    plan?: SelfServePlan;
    billing?: Billing;
    kind?: OneTimeKind;
  }): Promise<void> {
    if (notConfigured()) return;
    const busyKey = body.kind ?? (body.plan as string);
    setBusy(busyKey);
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as CheckoutResponse & { error?: string };
      if (!res.ok) {
        toast(data.error ?? 'Could not start checkout.');
        return;
      }

      const Razorpay = await loadCheckoutScript();

      const options: RazorpayCheckoutOptions = {
        key: data.keyId || keyId,
        name: 'Manch',
        theme: { color: '#8b5cf6' },
        // The webhook is authoritative; the handler only updates the UI.
        handler: () => {
          toast('Payment received ✓ Updating your plan…');
          router.refresh();
        },
        modal: {
          ondismiss: () => toast('Checkout cancelled'),
        },
      };

      if (data.type === 'subscription') {
        options.subscription_id = data.subscriptionId;
        options.description = `${labelForPlan(body.plan)} plan`;
      } else {
        options.order_id = data.orderId;
        options.amount = data.amount;
        options.currency = 'INR';
        options.description = body.kind === 'content_pack' ? `${CONTENT_PACK_CREDITS} Reels credits` : 'Profile Makeover';
      }

      const rzp = new Razorpay(options);
      rzp.on('payment.failed', (response) => {
        toast(response.error?.description ?? 'Payment failed. Please try again.');
      });
      rzp.open();
    } catch (e) {
      toast('Could not open checkout. Please try again.');
      // Surfaced to the console for debugging; user already saw a toast.
      console.error('checkout error', e);
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div className="card">
        <h1>One plan. Every tool on the stage.</h1>
        <p className="sub">
          Post, Reels, Deals and Check — one subscription unlocks all four. UPI-native via
          Razorpay. Annual plans save up to 20%.
        </p>

        {/* Monthly / yearly toggle. */}
        <div className="chips" role="tablist" aria-label="Billing period">
          <button
            type="button"
            className={`chip${billing === 'monthly' ? ' on' : ''}`}
            aria-pressed={billing === 'monthly'}
            onClick={() => setBilling('monthly')}
          >
            Monthly
          </button>
          <button
            type="button"
            className={`chip${billing === 'yearly' ? ' on' : ''}`}
            aria-pressed={billing === 'yearly'}
            onClick={() => setBilling('yearly')}
          >
            Yearly · save up to 20%
          </button>
        </div>

        <div className="tiers" style={{ marginTop: 16 }}>
          {CONSUMER_TIERS.map((t) => {
            const isCurrent = t.plan === currentPlan;
            const isFree = t.plan === 'free';
            const price =
              billing === 'yearly' && t.priceYearly ? t.priceYearly : t.priceMonthly;
            const sub = billing === 'yearly' && t.priceYearly ? '/year' : t.sub;
            return (
              <div key={t.plan} className={`tier${t.featured ? ' featured' : ''}`}>
                {t.featured && <div className="ribbon">MOST POPULAR</div>}
                <h3>{t.name}</h3>
                <div className="price">
                  {price} <small>{sub}</small>
                </div>
                <ul>
                  {t.feats.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
                <button
                  type="button"
                  className={`btn sm${isCurrent || isFree ? ' ghost' : ''}`}
                  style={{ marginTop: 'auto' }}
                  disabled={isCurrent || isFree || busy !== null}
                  onClick={() => startCheckout({ plan: t.plan as SelfServePlan, billing })}
                >
                  {busy === t.plan ? (
                    <>
                      <Spinner /> Opening Razorpay…
                    </>
                  ) : isCurrent ? (
                    '✓ Active'
                  ) : isFree ? (
                    'Free forever'
                  ) : (
                    `Choose ${t.name}`
                  )}
                </button>
              </div>
            );
          })}
        </div>

      </div>

      <div className="card">
        <h2>One-time boosts</h2>
        <div className="grid2">
          <OneTime
            title="Profile Makeover"
            module="Post"
            price={MAKEOVER_PRICE_PAISE}
            note="Deep 10-point LinkedIn audit + AI rewrite of your headline, about and top 3 posts."
            busy={busy}
            kind="makeover"
            onBuy={(kind) => startCheckout({ kind })}
          />
          <OneTime
            title={`Content pack · ${CONTENT_PACK_CREDITS} credits`}
            module="Reels"
            price={CONTENT_PACK_PRICE_PAISE}
            note={`Extra Reel pieces after your monthly quota. You have ${credits} credit${credits === 1 ? '' : 's'}.`}
            busy={busy}
            kind="content_pack"
            onBuy={(kind) => startCheckout({ kind })}
          />
        </div>
      </div>

      <div className="card">
        <h2>For organisations</h2>
        <p className="sub">Brand campaigns, newsroom fact-checking and telco bundles.</p>
        <div className="tiers">
          {B2B_TIERS.map((t) => (
            <B2BTier
              key={t.plan}
              tier={t}
              isCurrent={t.plan === currentPlan}
              busy={busy}
              onChoose={() => startCheckout({ plan: t.plan as SelfServePlan, billing })}
            />
          ))}
        </div>
      </div>
    </>
  );
}

function labelForPlan(plan?: Plan): string {
  return plan ? TIERS.find((t) => t.plan === plan)?.name ?? PLAN_LABEL[plan] : 'Manch';
}

function OneTime({
  title,
  module,
  price,
  note,
  kind,
  busy,
  onBuy,
}: {
  title: string;
  module: string;
  price: number;
  note: string;
  kind: OneTimeKind;
  busy: string | null;
  onBuy: (kind: OneTimeKind) => void;
}) {
  return (
    <div className="tier">
      <span className="pill" style={{ alignSelf: 'flex-start' }}>
        {module}
      </span>
      <h3>{title}</h3>
      <div className="price">{formatPaise(price)}</div>
      <p className="hint">{note}</p>
      <button
        type="button"
        className="btn ghost sm"
        style={{ marginTop: 'auto' }}
        disabled={busy !== null}
        onClick={() => onBuy(kind)}
      >
        {busy === kind ? (
          <>
            <Spinner /> Opening Razorpay…
          </>
        ) : (
          `Buy · ${formatPaise(price)}`
        )}
      </button>
    </div>
  );
}

function B2BTier({
  tier,
  isCurrent,
  busy,
  onChoose,
}: {
  tier: Tier;
  isCurrent: boolean;
  busy: string | null;
  onChoose: () => void;
}) {
  return (
    <div className="tier">
      <h3>{tier.name}</h3>
      <div className="price">
        {tier.priceMonthly} <small>{tier.sub}</small>
      </div>
      <p className="hint">{tier.tagline}</p>
      <ul>
        {tier.feats.map((f) => (
          <li key={f}>{f}</li>
        ))}
      </ul>
      {isCurrent ? (
        <button type="button" className="btn ghost sm" style={{ marginTop: 'auto' }} disabled>
          ✓ Active
        </button>
      ) : tier.contactSales ? (
        <a className="btn ghost sm" style={{ marginTop: 'auto' }} href={`mailto:sales@manch.app?subject=${encodeURIComponent(tier.name)}`}>
          Talk to us
        </a>
      ) : (
        <button
          type="button"
          className="btn sm"
          style={{ marginTop: 'auto' }}
          disabled={busy !== null}
          onClick={onChoose}
        >
          {busy === tier.plan ? (
            <>
              <Spinner /> Opening Razorpay…
            </>
          ) : (
            `Choose ${tier.name}`
          )}
        </button>
      )}
    </div>
  );
}

/** Render a paise amount as ₹X (whole rupees for round amounts like ₹199). */
function formatPaise(paise: number): string {
  const rupees = paise / 100;
  return `₹${Number.isInteger(rupees) ? rupees : rupees.toFixed(2)}`;
}
