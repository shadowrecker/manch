import { describe, it, expect, vi, beforeEach } from 'vitest';
import { rawRequest, readJson } from '../../helpers/mocks';

vi.mock('@/lib/whatsapp/verify', () => ({
  verifyWebhookGet: vi.fn(),
  verifySignature: vi.fn(),
  verifyToken: vi.fn(),
}));
vi.mock('@/lib/whatsapp/dispatch', () => ({ dispatchMessage: vi.fn() }));
vi.mock('@/lib/observability', () => ({
  log: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
  captureException: vi.fn(),
}));

import { GET, POST } from '@/app/api/whatsapp/webhook/route';
import { verifySignature, verifyToken, verifyWebhookGet } from '@/lib/whatsapp/verify';
import { dispatchMessage } from '@/lib/whatsapp/dispatch';
import { captureException } from '@/lib/observability';

const payload = {
  entry: [{ changes: [{ value: { messages: [
    { id: 'm1', from: '919800000001', type: 'text', text: { body: 'hi' } },
    { id: 'm2', from: '919800000002', type: 'image', image: { id: 'i' } },
  ] } }] }],
};

beforeEach(() => {
  vi.mocked(verifySignature).mockResolvedValue(true);
  vi.mocked(verifyToken).mockReturnValue(true);
  vi.mocked(dispatchMessage).mockResolvedValue(undefined);
});

describe('GET /api/whatsapp/webhook', () => {
  it('echoes the challenge or 403s', async () => {
    vi.mocked(verifyWebhookGet).mockReturnValueOnce('abc');
    const ok = await GET(new Request('http://test/api/whatsapp/webhook?hub.challenge=abc'));
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe('abc');
    vi.mocked(verifyWebhookGet).mockReturnValueOnce(null);
    expect((await GET(new Request('http://test/api/whatsapp/webhook'))).status).toBe(403);
  });
});

describe('POST /api/whatsapp/webhook', () => {
  it('verifies an HMAC-signed body (Cloud API)', async () => {
    const res = await POST(rawRequest('http://test/w', JSON.stringify(payload), { 'x-hub-signature-256': 'sha256=x' }));
    expect(res.status).toBe(200);
    expect(verifySignature).toHaveBeenCalled();
    expect(verifyToken).not.toHaveBeenCalled();
    expect(dispatchMessage).toHaveBeenCalledTimes(2);
    expect(vi.mocked(dispatchMessage).mock.calls[1][0]).toMatchObject({ messageId: 'm2', type: 'image', waId: '919800000002' });
  });

  it('verifies a shared-secret header or ?token (360Dialog)', async () => {
    await POST(rawRequest('http://test/w', JSON.stringify(payload), { 'x-360dialog-webhook-secret': 's' }));
    expect(verifyToken).toHaveBeenCalledWith('s');
    await POST(rawRequest('http://test/w?token=t', JSON.stringify(payload)));
    expect(verifyToken).toHaveBeenCalledWith('t');
  });

  it('401s and dispatches nothing when verification fails', async () => {
    vi.mocked(verifyToken).mockReturnValue(false);
    const { status } = await readJson(await POST(rawRequest('http://test/w', JSON.stringify(payload))));
    expect(status).toBe(401);
    vi.mocked(verifySignature).mockResolvedValue(false);
    expect((await POST(rawRequest('http://test/w', '{}', { 'x-hub-signature-256': 'bad' }))).status).toBe(401);
    expect(dispatchMessage).not.toHaveBeenCalled();
  });

  it('acks malformed JSON from a verified sender', async () => {
    expect((await POST(rawRequest('http://test/w', '{oops', { 'x-360dialog-webhook-secret': 's' }))).status).toBe(200);
  });

  it('one failing message does not drop the rest, and still acks 200', async () => {
    vi.mocked(dispatchMessage).mockRejectedValueOnce(new Error('boom'));
    const res = await POST(rawRequest('http://test/w', JSON.stringify(payload), { 'x-360dialog-webhook-secret': 's' }));
    expect(res.status).toBe(200);
    expect(dispatchMessage).toHaveBeenCalledTimes(2);
    expect(captureException).toHaveBeenCalledTimes(1);
  });
});
