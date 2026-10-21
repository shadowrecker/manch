import { redirect } from 'next/navigation';
import { getUser } from '@/lib/supabase/server';
import { getPlan } from '@/lib/db/queries';
import { getCreditBalance } from '@/lib/modules/reels/queries';
import { env } from '@/lib/env';
import { isSelfServe } from '@/lib/plans';
import { BillingClient } from '@/components/BillingClient';

// Plans & billing for all of Manch. Server component: loads the
// server-authoritative plan + Reels credit balance, then hands the public
// Razorpay key (safe in the browser) and an optional ?plan preselect to the
// client. Checkout + entitlement flip happen server-side
// (POST /api/billing/checkout + the verified webhook).
export default async function BillingPage({ searchParams }: { searchParams: { plan?: string } }) {
  const user = await getUser();
  if (!user) redirect('/login');

  const [plan, credits] = await Promise.all([getPlan(user.id), getCreditBalance(user.id)]);
  const preselect = searchParams.plan && isSelfServe(searchParams.plan) ? searchParams.plan : undefined;

  return <BillingClient currentPlan={plan} preselect={preselect} keyId={env.razorpayKeyIdPublic} credits={credits} />;
}
