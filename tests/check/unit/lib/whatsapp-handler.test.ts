import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeSupabase, makeChain } from '../../helpers/mocks';

vi.mock('@/lib/modules/check/queries', () => ({ getOrCreateBotUser: vi.fn(), linkBotUser: vi.fn() }));
vi.mock('@/lib/db/queries', () => ({ getProfileByWhatsapp: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/modules/check/whatsapp/client', () => ({ sendText: vi.fn() }));
vi.mock('@/lib/queue', () => ({ enqueue: vi.fn() }));
vi.mock('@/lib/analytics', () => ({ captureServer: vi.fn(), EVENTS: { languageOnboarded: 'language_onboarded', checkRequested: 'check_requested' } }));

import { handleInboundMessage, CHECK_JOB_PATH, type CheckInboundMessage } from '@/lib/modules/check/whatsapp/handler';
import { getOrCreateBotUser, linkBotUser } from '@/lib/modules/check/queries';
import { getProfileByWhatsapp } from '@/lib/db/queries';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendText } from '@/lib/modules/check/whatsapp/client';
import { enqueue } from '@/lib/queue';
import { captureServer } from '@/lib/analytics';

const mGetUser = vi.mocked(getOrCreateBotUser);
const mLink = vi.mocked(linkBotUser);
const mProfile = vi.mocked(getProfileByWhatsapp);
const mSend = vi.mocked(sendText);
const mEnqueue = vi.mocked(enqueue);
const mCapture = vi.mocked(captureServer);

function botUser(over: Record<string, unknown> = {}) {
  return { id: 'bu1', wa_id: '9198', user_id: null, language_pref: 'hi', plan: 'free', state: {}, ...over } as never;
}
const msg = (over: Partial<CheckInboundMessage>): CheckInboundMessage => ({ waId: '9198', messageId: 'm1', type: 'text', text: 'hello', ...over });

beforeEach(() => {
  vi.mocked(createAdminClient).mockReturnValue(makeSupabase({ tables: { bot_users: makeChain() } }) as never);
  mSend.mockResolvedValue(true);
  mEnqueue.mockResolvedValue({ messageId: 'q1' });
  mProfile.mockResolvedValue(null);
  mLink.mockResolvedValue();
});

describe('handleInboundMessage', () => {
  it('first contact (not onboarded): sends the Manch Check language prompt', async () => {
    mGetUser.mockResolvedValue(botUser({ state: {} }));
    await handleInboundMessage(msg({ text: 'hi there' }));
    expect(mSend.mock.calls[0][1]).toContain('Which language');
    expect(mSend.mock.calls[0][1]).toContain('Manch Check');
    expect(mSend.mock.calls[0][1]).not.toContain('TrustCheck');
    expect(mEnqueue).not.toHaveBeenCalled();
  });

  it('onboarding: a valid language choice sets the pref and confirms', async () => {
    const cp = makeChain();
    vi.mocked(createAdminClient).mockReturnValue(makeSupabase({ tables: { bot_users: cp } }) as never);
    mGetUser.mockResolvedValue(botUser({ state: {} }));
    await handleInboundMessage(msg({ text: '2' })); // Tamil
    const update = cp.update.mock.calls[0][0] as { language_pref: string; state: { onboarded: boolean } };
    expect(update.language_pref).toBe('ta');
    expect(update.state.onboarded).toBe(true);
    expect(mSend.mock.calls[0][1]).toContain('தமிழ்');
  });

  it('onboarding: an interactive language button id is accepted', async () => {
    const cp = makeChain();
    vi.mocked(createAdminClient).mockReturnValue(makeSupabase({ tables: { bot_users: cp } }) as never);
    mGetUser.mockResolvedValue(botUser({ state: {} }));
    await handleInboundMessage(msg({ type: 'interactive', text: 'lang:ml' }));
    expect((cp.update.mock.calls[0][0] as { language_pref: string }).language_pref).toBe('ml');
  });

  it('onboarded: a text message enqueues a check on /api/check/jobs and acks fast', async () => {
    mGetUser.mockResolvedValue(botUser({ state: { onboarded: true } }));
    await handleInboundMessage(msg({ text: 'Is the new UPI tax real?' }));
    expect(CHECK_JOB_PATH).toBe('/api/check/jobs');
    expect(mEnqueue).toHaveBeenCalledWith('/api/check/jobs', expect.objectContaining({ botUserId: 'bu1', type: 'text', waId: '9198' }), expect.objectContaining({ deduplicationId: 'm1' }));
    expect(mSend.mock.calls[0][1]).toContain('Checking');
  });

  it('onboarded: an interactive reply is enqueued as a text check', async () => {
    mGetUser.mockResolvedValue(botUser({ state: { onboarded: true } }));
    await handleInboundMessage(msg({ type: 'interactive', text: 'is this real?' }));
    expect(mEnqueue.mock.calls[0][1]).toMatchObject({ type: 'text', text: 'is this real?' });
  });

  it('onboarded: a photo/video is enqueued with its media id', async () => {
    mGetUser.mockResolvedValue(botUser({ state: { onboarded: true } }));
    await handleInboundMessage(msg({ type: 'video', text: undefined, mediaId: 'vid-1' }));
    expect(mEnqueue.mock.calls[0][1]).toMatchObject({ type: 'video', mediaId: 'vid-1' });
  });

  it('onboarded: an (almost) empty text gets a nudge, not a check', async () => {
    mGetUser.mockResolvedValue(botUser({ state: { onboarded: true } }));
    await handleInboundMessage(msg({ text: 'k' }));
    expect(mEnqueue).not.toHaveBeenCalled();
    expect(mSend.mock.calls[0][1]).toMatch(/Forward me a message/);
  });

  it('apologises when the queue is unavailable', async () => {
    mGetUser.mockResolvedValue(botUser({ state: { onboarded: true } }));
    mEnqueue.mockRejectedValue(new Error('QSTASH_TOKEN missing'));
    await handleInboundMessage(msg({ text: 'Is the new UPI tax real?' }));
    expect(mSend.mock.calls[0][1]).toMatch(/briefly unavailable/);
  });

  it('unsupported message types get a friendly nudge', async () => {
    await handleInboundMessage(msg({ type: 'unsupported', text: undefined }));
    expect(mSend.mock.calls[0][1]).toMatch(/text messages, images and videos/i);
    expect(mGetUser).not.toHaveBeenCalled();
  });

  it('does NOT dedupe — the shared webhook already did (a re-delivery is re-enqueued, QStash dedupes on messageId)', async () => {
    mGetUser.mockResolvedValue(botUser({ state: { onboarded: true } }));
    await handleInboundMessage(msg({ text: 'Is the new UPI tax real?' }));
    await handleInboundMessage(msg({ text: 'Is the new UPI tax real?' }));
    expect(mEnqueue).toHaveBeenCalledTimes(2);
    expect(mEnqueue.mock.calls.every((c) => (c[2] as { deduplicationId: string }).deduplicationId === 'm1')).toBe(true);
  });
});

describe('handleInboundMessage — Manch account linking', () => {
  it('looks up the Manch profile by "+" + waId', async () => {
    mGetUser.mockResolvedValue(botUser({ state: { onboarded: true } }));
    await handleInboundMessage(msg({ text: 'Is the new UPI tax real?' }));
    expect(mProfile).toHaveBeenCalledWith('+9198');
  });

  it('links an unlinked bot user to the matching Manch account and uses the profile plan', async () => {
    mGetUser.mockResolvedValue(botUser({ state: { onboarded: true }, plan: 'free' }));
    mProfile.mockResolvedValue({ id: 'u1', plan: 'plus' } as never);
    await handleInboundMessage(msg({ text: 'Is the new UPI tax real?' }));
    expect(mLink).toHaveBeenCalledWith('bu1', 'u1');
    expect(mCapture).toHaveBeenCalledWith('check_requested', 'bu1', expect.objectContaining({ plan: 'plus', linked: true }));
  });

  it('does not re-link a bot user that is already linked to that account', async () => {
    mGetUser.mockResolvedValue(botUser({ state: { onboarded: true }, user_id: 'u1' }));
    mProfile.mockResolvedValue({ id: 'u1', plan: 'pro' } as never);
    await handleInboundMessage(msg({ text: 'Is the new UPI tax real?' }));
    expect(mLink).not.toHaveBeenCalled();
    expect(mCapture).toHaveBeenCalledWith('check_requested', 'bu1', expect.objectContaining({ plan: 'pro' }));
  });

  it('without a Manch account: no link, and bot_users.plan applies', async () => {
    mGetUser.mockResolvedValue(botUser({ state: { onboarded: true }, plan: 'newsroom' }));
    await handleInboundMessage(msg({ text: 'Is the new UPI tax real?' }));
    expect(mLink).not.toHaveBeenCalled();
    expect(mCapture).toHaveBeenCalledWith('check_requested', 'bu1', expect.objectContaining({ plan: 'newsroom', linked: false }));
  });

  it('links during onboarding too (first contact from an account holder)', async () => {
    mGetUser.mockResolvedValue(botUser({ state: {} }));
    mProfile.mockResolvedValue({ id: 'u1', plan: 'plus' } as never);
    await handleInboundMessage(msg({ text: 'hello' }));
    expect(mLink).toHaveBeenCalledWith('bu1', 'u1');
    expect(mSend.mock.calls[0][1]).toContain('Which language');
  });

  it('a failed link is logged, not fatal — the check still runs', async () => {
    mGetUser.mockResolvedValue(botUser({ state: { onboarded: true } }));
    mProfile.mockResolvedValue({ id: 'u1', plan: 'plus' } as never);
    mLink.mockRejectedValue(new Error('db down'));
    await handleInboundMessage(msg({ text: 'Is the new UPI tax real?' }));
    expect(mEnqueue).toHaveBeenCalled();
  });
});
