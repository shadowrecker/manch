import { describe, it, expect, vi, beforeEach } from 'vitest';
import { rawRequest, readJson } from '../../helpers/mocks';

// The ONE Razorpay webhook: signature first, then dispatch to lib/billing or
// the Deals settlement. Handlers are mocked here; lib/billing has its own tests.

vi.mock('@/lib/payments/razorpay', () => ({ verifyWebhookSignature: vi.fn() }));
vi.mock('@/lib/billing', () => ({
  activateSubscription: vi.fn(),
  haltSubscription: vi.fn(),
  endSubscription: vi.fn(),
  completeOneTimePurchase: vi.fn(),
  isoFromUnix: (s?: number | null) => (s ? new Date(s * 1000).toISOString() : null),
}));
vi.mock('@/lib/modules/deals/services/deals', () => ({ recordPaymentCaptured: vi.fn() }));
vi.mock('@/lib/observability', () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  captureException: vi.fn(),
}));

import { POST } from '@/app/api/razorpay/webhook/route';
import { verifyWebhookSignature } from '@/lib/payments/razorpay';
import * as billing from '@/lib/billing';
import { recordPaymentCaptured } from '@/lib/modules/deals/services/deals';

const mVerify = vi.mocked(verifyWebhookSignature);
const mDeal = vi.mocked(recordPaymentCaptured);

const hook = (payload: unknown, raw?: string) =>
  rawRequest('http://test/api/razorpay/webhook', raw ?? JSON.stringify(payload), { 'x-razorpay-signature': 'sig' });

beforeEach(() => {
  mVerify.mockReturnValue(true);
  mDeal.mockResolvedValue({ status: 'collected' } as never);
});

describe('POST /api/razorpay/webhook', () => {
  it('401s and touches nothing when the signature is invalid', async () => {
    mVerify.mockReturnValue(false);
    const { status } = await readJson(await POST(hook({ event: 'subscription.activated' })));
    expect(status).toBe(401);
    expect(billing.activateSubscription).not.toHaveBeenCalled();
  });

  it('acks a signed but unparseable body', async () => {
    expect((await POST(hook(null, '{not json'))).status).toBe(200);
  });

  it('activates on subscription.activated / charged with the verified plan_id', async () => {
    for (const event of ['subscription.activated', 'subscription.charged']) {
      await POST(hook({ event, payload: { subscription: { entity: { id: 'sub_1', plan_id: 'plan_x', current_end: 1_900_000_000 } } } }));
    }
    expect(billing.activateSubscription).toHaveBeenCalledTimes(2);
    expect(billing.activateSubscription).toHaveBeenCalledWith('sub_1', 'plan_x', new Date(1_900_000_000_000).toISOString());
  });

  it('halts, cancels and completes subscriptions', async () => {
    await POST(hook({ event: 'subscription.halted', payload: { subscription: { entity: { id: 's' } } } }));
    await POST(hook({ event: 'subscription.cancelled', payload: { subscription: { entity: { id: 's', current_end: null } } } }));
    await POST(hook({ event: 'subscription.completed', payload: { subscription: { entity: { id: 's' } } } }));
    expect(billing.haltSubscription).toHaveBeenCalledWith('s');
    expect(billing.endSubscription).toHaveBeenCalledWith('s', 'cancelled', null);
    expect(billing.endSubscription).toHaveBeenCalledWith('s', 'completed', null);
  });

  it('settles a Deals payment link (notes.deal_id) instead of a one-time purchase', async () => {
    await POST(hook({ event: 'payment_link.paid', payload: { payment_link: { entity: { notes: { deal_id: 'deal-1' } } }, payment: { entity: { id: 'pay_1' } } } }));
    await POST(hook({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_2', order_id: 'o', notes: { deal_id: 'deal-2' } } } } }));
    expect(mDeal).toHaveBeenCalledWith('deal-1', 'pay_1');
    expect(mDeal).toHaveBeenCalledWith('deal-2', 'pay_2');
    expect(billing.completeOneTimePurchase).not.toHaveBeenCalled();
  });

  it('completes a one-time order on payment.captured', async () => {
    await POST(hook({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_3', order_id: 'order_3' } } } }));
    expect(billing.completeOneTimePurchase).toHaveBeenCalledWith('order_3', 'pay_3');
  });

  it('ignores unknown events and malformed payloads with 200', async () => {
    expect((await POST(hook({ event: 'refund.created' }))).status).toBe(200);
    expect((await POST(hook({ event: 'subscription.activated', payload: {} }))).status).toBe(200);
    expect(billing.activateSubscription).not.toHaveBeenCalled();
  });

  it('500s on handler failure so Razorpay retries (handlers are idempotent)', async () => {
    vi.mocked(billing.activateSubscription).mockRejectedValueOnce(new Error('db down'));
    const res = await POST(hook({ event: 'subscription.activated', payload: { subscription: { entity: { id: 's' } } } }));
    expect(res.status).toBe(500);
  });
});
