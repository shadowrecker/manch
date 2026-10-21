import { createAdminClient } from '@/lib/supabase/admin';
import { createDealPaymentLink } from '@/lib/modules/deals/payments/route';
import { computeSplit } from '@/lib/modules/deals/payments/commission';
import { captureServer, EVENTS } from '@/lib/analytics';
import { log } from '@/lib/observability';
import type { DealStatus, Deliverable } from '@/lib/modules/deals/types';
import type { DealRow, Json } from '@/lib/db/types';

export class NoDealError extends Error {
  constructor() {
    super('Deal not found');
    this.name = 'NoDealError';
  }
}
export class NoValueError extends Error {
  constructor() {
    super('Deal has no value to collect');
    this.name = 'NoValueError';
  }
}

export interface CreateDealInput {
  brandId?: string | null;
  brandName?: string | null;
  title?: string | null;
  valuePaise?: number | null;
  deliverables?: Deliverable[];
  status?: DealStatus;
}

export async function createDeal(userId: string, input: CreateDealInput): Promise<DealRow> {
  const sb = createAdminClient();
  const { data, error } = await sb
    .from('deals')
    .insert({
      user_id: userId,
      brand_id: input.brandId ?? null,
      brand_name: input.brandName ?? null,
      title: input.title ?? null,
      value_paise: input.valuePaise ?? null,
      deliverables: (input.deliverables ?? []) as unknown as Json,
      status: input.status ?? 'pitched',
      commission_status: 'none',
    })
    .select('*')
    .single();
  if (error) throw error;
  await captureServer(EVENTS.dealCreated, userId, { deal_id: data.id, value_paise: data.value_paise ?? 0 });
  return data;
}

export async function listDeals(userId: string): Promise<DealRow[]> {
  const sb = createAdminClient();
  const { data } = await sb.from('deals').select('*').eq('user_id', userId).order('created_at', { ascending: false });
  return (data as DealRow[] | null) ?? [];
}

export async function getDeal(userId: string, dealId: string): Promise<DealRow | null> {
  const sb = createAdminClient();
  const { data } = await sb.from('deals').select('*').eq('id', dealId).eq('user_id', userId).maybeSingle();
  return data;
}

export async function updateDeal(
  userId: string,
  dealId: string,
  patch: { status?: DealStatus; valuePaise?: number | null; title?: string | null },
): Promise<DealRow> {
  const sb = createAdminClient();
  const update: { status?: DealStatus; value_paise?: number | null; title?: string | null } = {};
  if (patch.status !== undefined) update.status = patch.status;
  if (patch.valuePaise !== undefined) update.value_paise = patch.valuePaise;
  if (patch.title !== undefined) update.title = patch.title;

  const { data, error } = await sb.from('deals').update(update).eq('id', dealId).eq('user_id', userId).select('*').single();
  if (error) throw error;
  return data;
}

export async function getPayoutAccountId(userId: string): Promise<string | null> {
  const sb = createAdminClient();
  const { data } = await sb.from('creator_payout_accounts').select('rzp_account_id').eq('user_id', userId).maybeSingle();
  return data?.rzp_account_id ?? null;
}

export interface DealPaymentResult {
  url: string;
  routed: boolean;
  needsKyc: boolean;
  commissionPaise: number;
  creatorPaise: number;
}

/** Generate a payment link for a won deal and stamp the commission as pending. */
export async function generateDealPayment(userId: string, dealId: string): Promise<DealPaymentResult> {
  const deal = await getDeal(userId, dealId);
  if (!deal) throw new NoDealError();
  if (!deal.value_paise || deal.value_paise <= 0) throw new NoValueError();

  const creatorAccountId = await getPayoutAccountId(userId);
  const link = await createDealPaymentLink({
    dealId: deal.id,
    valuePaise: deal.value_paise,
    brandName: deal.brand_name,
    creatorAccountId,
  });

  const sb = createAdminClient();
  await sb
    .from('deals')
    .update({
      rzp_order_id: link.id,
      commission_paise: link.split.commissionPaise,
      commission_status: 'pending',
      status: 'delivered',
    })
    .eq('id', deal.id)
    .eq('user_id', userId);

  return {
    url: link.url,
    routed: link.routed,
    needsKyc: !link.routed && !creatorAccountId,
    commissionPaise: link.split.commissionPaise,
    creatorPaise: link.split.creatorPaise,
  };
}

export interface CaptureResult {
  status: 'collected' | 'already_collected' | 'unknown_deal';
  dealId?: string;
}

/**
 * Idempotent webhook handler: mark a deal's commission collected on payment.
 * Re-delivery of the same event is a no-op (commission_status already collected).
 */
export async function recordPaymentCaptured(dealId: string, rzpTransferId: string | null): Promise<CaptureResult> {
  const sb = createAdminClient();
  const { data: deal } = await sb.from('deals').select('*').eq('id', dealId).maybeSingle();
  if (!deal) {
    log.warn('webhook: payment for unknown deal', { dealId });
    return { status: 'unknown_deal' };
  }
  if (deal.commission_status === 'collected') {
    return { status: 'already_collected', dealId };
  }

  const split = computeSplit(deal.value_paise ?? 0);
  await sb
    .from('deals')
    .update({
      status: 'paid',
      commission_status: 'collected',
      commission_paise: split.commissionPaise,
      rzp_transfer_id: rzpTransferId,
      closed_at: new Date().toISOString(),
    })
    .eq('id', dealId);

  if (deal.user_id) {
    await captureServer(EVENTS.dealWon, deal.user_id, { deal_id: dealId, value_paise: deal.value_paise ?? 0 });
    await captureServer(EVENTS.commissionCollected, deal.user_id, {
      deal_id: dealId,
      commission_paise: split.commissionPaise,
    });
  }
  return { status: 'collected', dealId };
}
