import { NextResponse } from 'next/server';
import { verifyWebhookSignature } from '@/lib/payments/razorpay';
import {
  activateSubscription,
  completeOneTimePurchase,
  endSubscription,
  haltSubscription,
  isoFromUnix,
} from '@/lib/billing';
import { recordPaymentCaptured } from '@/lib/modules/deals/services/deals';
import { log, captureException } from '@/lib/observability';

export const runtime = 'nodejs';

// POST /api/razorpay/webhook — THE single source of truth for entitlements,
// credits and deal commissions across every module.
//
// Verify the X-Razorpay-Signature HMAC over the RAW body before trusting
// anything, then dispatch:
//   subscription.*          → plan lifecycle (lib/billing.ts)
//   payment.captured        → one-time orders (makeover / content pack) and,
//                             when notes.deal_id is set, a Deals settlement
//   payment_link.paid       → Deals settlement (5% commission)
// Every handler is idempotent, so on failure we return 500 and let Razorpay retry.

interface RzpEntity {
  id?: string;
  plan_id?: string;
  current_end?: number | null;
  order_id?: string | null;
  notes?: Record<string, unknown> | null;
}

interface RzpBody {
  event?: string;
  payload?: {
    subscription?: { entity?: RzpEntity };
    payment?: { entity?: RzpEntity };
    payment_link?: { entity?: RzpEntity };
  };
}

function dealIdFrom(body: RzpBody): string | undefined {
  const fromLink = body.payload?.payment_link?.entity?.notes?.deal_id;
  const fromPayment = body.payload?.payment?.entity?.notes?.deal_id;
  const id = fromLink ?? fromPayment;
  return typeof id === 'string' && id ? id : undefined;
}

export async function POST(req: Request) {
  const rawBody = await req.text();
  const signature = req.headers.get('x-razorpay-signature');
  if (!verifyWebhookSignature(rawBody, signature)) {
    log.warn('razorpay webhook: invalid signature');
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  }

  let body: RzpBody;
  try {
    body = JSON.parse(rawBody) as RzpBody;
  } catch {
    // Signed but unparseable — ack so Razorpay stops retrying.
    log.warn('razorpay webhook: unparseable body');
    return NextResponse.json({ ok: true });
  }

  const event = body.event ?? '';
  const sub = body.payload?.subscription?.entity;
  const pay = body.payload?.payment?.entity;

  try {
    switch (event) {
      case 'subscription.activated':
      case 'subscription.charged':
        if (sub?.id) await activateSubscription(sub.id, sub.plan_id, isoFromUnix(sub.current_end));
        break;

      case 'subscription.halted':
        if (sub?.id) await haltSubscription(sub.id);
        break;

      case 'subscription.cancelled':
      case 'subscription.completed':
        if (sub?.id) {
          await endSubscription(
            sub.id,
            event === 'subscription.cancelled' ? 'cancelled' : 'completed',
            isoFromUnix(sub.current_end),
          );
        }
        break;

      case 'payment.captured':
      case 'payment_link.paid': {
        const dealId = dealIdFrom(body);
        if (dealId) {
          const result = await recordPaymentCaptured(dealId, pay?.id ?? null);
          log.info('razorpay webhook: deal payment', { event, dealId, result: result.status });
        } else if (event === 'payment.captured' && pay?.order_id) {
          const result = await completeOneTimePurchase(pay.order_id, pay.id ?? null);
          log.info('razorpay webhook: one-time purchase', { orderId: pay.order_id, result });
        }
        break;
      }

      default:
        log.info('razorpay webhook: ignored event', { event });
    }
  } catch (e) {
    captureException(e, { route: 'POST /api/razorpay/webhook', event });
    log.error('razorpay webhook handler failed', { event, error: String(e) });
    return NextResponse.json({ error: 'processing failed' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
