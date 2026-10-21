import { describe, it, expect, vi, afterEach } from 'vitest';

// A single shared spy stands in for Resend's emails.send across module reloads.
// The "resend" mock constructor returns an object wired to it. observability is
// mocked so we never touch real logging.
const sendSpy = vi.fn();

vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: sendSpy },
  })),
}));
vi.mock('@/lib/observability', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  captureException: vi.fn(),
}));

// env-dependent: reset module registry + stub env + dynamic import so the
// RESEND_API_KEY presence is read fresh each test.
async function load(envOverrides: Record<string, string> = {}) {
  vi.resetModules();
  for (const [k, v] of Object.entries(envOverrides)) vi.stubEnv(k, v);
  return import('@/lib/modules/post/email/resend');
}

afterEach(() => {
  vi.unstubAllEnvs();
  sendSpy.mockReset();
});

const INVITE_URL = 'https://app.manch.app/invite/accept?token=abc';

describe('sendInviteEmail', () => {
  it('does not throw and does not send when RESEND_API_KEY is absent', async () => {
    const { sendInviteEmail } = await load({ RESEND_API_KEY: '' });
    await expect(sendInviteEmail('jo@example.com', INVITE_URL)).resolves.toBeUndefined();
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it('sends the email with to + a link containing the invite url when key is set', async () => {
    sendSpy.mockResolvedValue({ data: { id: 'em_1' }, error: null });
    const { sendInviteEmail } = await load({
      RESEND_API_KEY: 're_test_key',
      RESEND_FROM_EMAIL: 'Manch <hello@manch.app>',
    });

    await sendInviteEmail('jo@example.com', INVITE_URL);

    expect(sendSpy).toHaveBeenCalledTimes(1);
    const arg = sendSpy.mock.calls[0][0] as {
      from: string;
      to: string;
      subject: string;
      html: string;
      text: string;
    };
    expect(arg.to).toBe('jo@example.com');
    expect(arg.from).toBe('Manch <hello@manch.app>');
    expect(arg.html).toContain(INVITE_URL);
    expect(arg.text).toContain(INVITE_URL);
    expect(typeof arg.subject).toBe('string');
  });

  it('does not throw when Resend returns an in-band error', async () => {
    sendSpy.mockResolvedValue({ data: null, error: { message: 'invalid recipient' } });
    const { sendInviteEmail } = await load({ RESEND_API_KEY: 're_test_key' });
    await expect(sendInviteEmail('bad@example.com', INVITE_URL)).resolves.toBeUndefined();
    expect(sendSpy).toHaveBeenCalledTimes(1);
  });

  it('does not throw when the SDK send rejects (network failure)', async () => {
    sendSpy.mockRejectedValue(new Error('network down'));
    const { sendInviteEmail } = await load({ RESEND_API_KEY: 're_test_key' });
    await expect(sendInviteEmail('jo@example.com', INVITE_URL)).resolves.toBeUndefined();
    expect(sendSpy).toHaveBeenCalledTimes(1);
  });
});
