import { createAdminClient } from '@/lib/supabase/admin';

// Content-pack credit wallet (PRD §12). All mutations go through the atomic
// Postgres RPCs (consume_credit / grant_credits) — never client-trusted. The
// core Razorpay webhook (lib/billing.ts) calls grantCredits() for content packs.

/** Atomically consume `amount` credits. Returns the new balance, or -1 if insufficient. */
export async function consumeCredit(userId: string, ref: string, amount = 1): Promise<number> {
  const sb = createAdminClient();
  const { data, error } = await sb.rpc('consume_credit', {
    p_user_id: userId,
    p_amount: amount,
    p_ref: ref,
  });
  if (error) throw error;
  return data ?? -1;
}

/** Grant `amount` credits (content-pack purchase / refund). Returns the new balance. */
export async function grantCredits(
  userId: string,
  amount: number,
  reason: string,
  ref: string,
): Promise<number> {
  const sb = createAdminClient();
  const { data, error } = await sb.rpc('grant_credits', {
    p_user_id: userId,
    p_amount: amount,
    p_reason: reason,
    p_ref: ref,
  });
  if (error) throw error;
  return data ?? 0;
}
