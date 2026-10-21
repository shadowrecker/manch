import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Env-dependent lib: lib/env reads process.env AT IMPORT (the const `env` is
// frozen at import time), so we reset the module registry and stub env per test,
// then dynamically import. @upstash/qstash is mocked so no network/SDK runs.

const publishJSON = vi.fn();
const verify = vi.fn();
const ClientCtor = vi.fn();
const ReceiverCtor = vi.fn();

vi.mock('@upstash/qstash', () => {
  class Client {
    constructor(opts: unknown) {
      ClientCtor(opts);
    }
    publishJSON = publishJSON;
  }
  class Receiver {
    constructor(opts: unknown) {
      ReceiverCtor(opts);
    }
    verify = verify;
  }
  return { Client, Receiver };
});

async function load(envOverrides: Record<string, string> = {}) {
  vi.resetModules();
  for (const [k, v] of Object.entries(envOverrides)) vi.stubEnv(k, v);
  return import('@/lib/queue');
}

beforeEach(() => {
  publishJSON.mockReset();
  verify.mockReset();
  ClientCtor.mockReset();
  ReceiverCtor.mockReset();
});

afterEach(() => vi.unstubAllEnvs());

describe('enqueue', () => {
  it('publishes to appUrl + path and returns the messageId', async () => {
    publishJSON.mockResolvedValue({ messageId: 'm1' });
    const { enqueue } = await load({
      QSTASH_TOKEN: 'qstash_tok',
      NEXT_PUBLIC_APP_URL: 'https://manch.example',
    });

    const result = await enqueue('/api/worker/generate', { jobId: 'j1' });

    expect(result).toEqual({ messageId: 'm1' });
    expect(ClientCtor).toHaveBeenCalledWith({ token: 'qstash_tok' });
    expect(publishJSON).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://manch.example/api/worker/generate',
        body: { jobId: 'j1' },
      }),
    );
  });

  it('forwards delaySeconds and deduplicationId to publishJSON', async () => {
    publishJSON.mockResolvedValue({ messageId: 'm2' });
    const { enqueue } = await load({
      QSTASH_TOKEN: 'qstash_tok',
      NEXT_PUBLIC_APP_URL: 'https://manch.example',
    });

    await enqueue('/api/worker/post', { postId: 'p1' }, {
      delaySeconds: 120,
      deduplicationId: 'dedup-1',
    });

    expect(publishJSON).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://manch.example/api/worker/post',
        body: { postId: 'p1' },
        delay: 120,
        deduplicationId: 'dedup-1',
      }),
    );
  });

  it('falls back to the default appUrl when NEXT_PUBLIC_APP_URL is unset', async () => {
    publishJSON.mockResolvedValue({ messageId: 'm3' });
    const { enqueue } = await load({
      QSTASH_TOKEN: 'qstash_tok',
      NEXT_PUBLIC_APP_URL: '',
    });

    await enqueue('/api/worker/x', { a: 1 });

    expect(publishJSON).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'http://localhost:3000/api/worker/x' }),
    );
  });

  it('throws when QSTASH_TOKEN is missing and never constructs the client', async () => {
    const { enqueue } = await load({ QSTASH_TOKEN: '' });

    await expect(enqueue('/api/worker/x', {})).rejects.toThrow(/QSTASH_TOKEN/);
    expect(ClientCtor).not.toHaveBeenCalled();
    expect(publishJSON).not.toHaveBeenCalled();
  });
});

describe('verifyQstashSignature', () => {
  it('returns false when the signature is null (does not construct Receiver)', async () => {
    const { verifyQstashSignature } = await load({
      QSTASH_CURRENT_SIGNING_KEY: 'sig_current',
    });

    expect(await verifyQstashSignature(null, 'body')).toBe(false);
    expect(ReceiverCtor).not.toHaveBeenCalled();
    expect(verify).not.toHaveBeenCalled();
  });

  it('returns false when the current signing key is absent', async () => {
    const { verifyQstashSignature } = await load({
      QSTASH_CURRENT_SIGNING_KEY: '',
    });

    expect(await verifyQstashSignature('sig', 'body')).toBe(false);
    expect(ReceiverCtor).not.toHaveBeenCalled();
    expect(verify).not.toHaveBeenCalled();
  });

  it('returns true when the receiver verifies the signature', async () => {
    verify.mockResolvedValue(true);
    const { verifyQstashSignature } = await load({
      QSTASH_CURRENT_SIGNING_KEY: 'sig_current',
      QSTASH_NEXT_SIGNING_KEY: 'sig_next',
    });

    expect(await verifyQstashSignature('the-sig', 'the-body')).toBe(true);
    expect(ReceiverCtor).toHaveBeenCalledWith({
      currentSigningKey: 'sig_current',
      nextSigningKey: 'sig_next',
    });
    expect(verify).toHaveBeenCalledWith({ signature: 'the-sig', body: 'the-body' });
  });

  it('returns false when the receiver rejects the signature', async () => {
    verify.mockResolvedValue(false);
    const { verifyQstashSignature } = await load({
      QSTASH_CURRENT_SIGNING_KEY: 'sig_current',
    });

    expect(await verifyQstashSignature('bad-sig', 'body')).toBe(false);
  });

  it('returns false (fail-closed) when receiver.verify throws', async () => {
    verify.mockRejectedValue(new Error('boom'));
    const { verifyQstashSignature } = await load({
      QSTASH_CURRENT_SIGNING_KEY: 'sig_current',
    });

    expect(await verifyQstashSignature('sig', 'body')).toBe(false);
  });
});
