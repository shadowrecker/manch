import { env, requireEnv } from '@/lib/env';

// Upstash QStash — the reliable HTTP job queue that decouples the fast
// WhatsApp webhook ack from the slow AI pipeline (PRD §3.3). enqueue() publishes
// a job that QStash will POST to `${appUrl}${path}`; the worker route verifies
// the signature with verifyQstashSignature().

export interface EnqueueOptions {
  /** Delay before delivery, in seconds (used for scheduled LinkedIn posts). */
  delaySeconds?: number;
  /** Idempotency key — QStash deduplicates messages with the same id. */
  deduplicationId?: string;
}

export async function enqueue(
  path: string,
  body: unknown,
  opts: EnqueueOptions = {},
): Promise<{ messageId: string }> {
  const token = requireEnv(env.qstashToken, 'QSTASH_TOKEN');
  const { Client } = await import('@upstash/qstash');
  const client = new Client({ token });
  const res = await client.publishJSON({
    url: `${env.appUrl}${path}`,
    body,
    delay: opts.delaySeconds,
    deduplicationId: opts.deduplicationId,
  });
  return { messageId: (res as { messageId: string }).messageId };
}

/** Verify an inbound QStash request signature. Returns false if invalid/unsigned. */
export async function verifyQstashSignature(
  signature: string | null,
  body: string,
): Promise<boolean> {
  if (!signature) return false;
  if (!env.qstashCurrentSigningKey) return false;
  try {
    const { Receiver } = await import('@upstash/qstash');
    const receiver = new Receiver({
      currentSigningKey: env.qstashCurrentSigningKey,
      nextSigningKey: env.qstashNextSigningKey,
    });
    return await receiver.verify({ signature, body });
  } catch {
    return false;
  }
}
