import { razorpay } from '@/lib/payments/razorpay';
import { computeSplit, type CommissionSplit } from '@/lib/modules/deals/payments/commission';
import { env } from '@/lib/env';

// Razorpay Route payment link (PRD §8.6). When Route is enabled AND the creator
// has a Linked Account, the settlement auto-splits 95% → creator, 5% → platform.
// Otherwise a plain payment link is created (platform collects; manual payout) —
// same economics, more ops. The `routed` flag records which path was used.

export interface DealPaymentParams {
  dealId: string;
  valuePaise: number;
  brandName: string | null;
  creatorAccountId: string | null;
}

export interface DealPaymentLink {
  id: string;
  url: string;
  routed: boolean;
  split: CommissionSplit;
}

export async function createDealPaymentLink(params: DealPaymentParams): Promise<DealPaymentLink> {
  const split = computeSplit(params.valuePaise);
  const routed = env.razorpayRouteEnabled && !!params.creatorAccountId;

  const payload: Record<string, unknown> = {
    amount: params.valuePaise,
    currency: 'INR',
    accept_partial: false,
    description: `Collaboration${params.brandName ? ` with ${params.brandName}` : ''}`,
    reference_id: params.dealId,
    // notes propagate to the payment entity → the webhook maps back to the deal.
    notes: { deal_id: params.dealId, kind: 'deal_commission' },
    reminder_enable: true,
  };

  if (routed) {
    // Route: transfer the creator's 95% to their Linked Account; platform keeps 5%.
    payload.transfers = [
      {
        account: params.creatorAccountId,
        amount: split.creatorPaise,
        currency: 'INR',
        notes: { deal_id: params.dealId },
        on_hold: false,
      },
    ];
  }

  const link = (await razorpay().paymentLink.create(
    payload as unknown as Parameters<ReturnType<typeof razorpay>['paymentLink']['create']>[0],
  )) as { id: string; short_url: string };

  return { id: link.id, url: link.short_url, routed, split };
}
