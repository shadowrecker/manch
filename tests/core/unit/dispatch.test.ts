import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeChain, makeSupabase } from '../../helpers/mocks';
import type { InboundMessage } from '@/lib/whatsapp/inbound';

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/db/queries', () => ({ getProfileByWhatsapp: vi.fn() }));
vi.mock('@/lib/queue', () => ({ enqueue: vi.fn() }));
vi.mock('@/lib/whatsapp/client', () => ({ sendText: vi.fn() }));
vi.mock('@/lib/modules/check/whatsapp/handler', () => ({ handleInboundMessage: vi.fn() }));
vi.mock('@/lib/analytics', () => ({ EVENTS: { whatsappRouted: 'whatsapp_routed' }, captureServer: vi.fn() }));
vi.mock('@/lib/observability', () => ({ log: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));

import { dispatchMessage, JOB_PATHS } from '@/lib/whatsapp/dispatch';
import { createAdminClient } from '@/lib/supabase/admin';
import { getProfileByWhatsapp } from '@/lib/db/queries';
import { enqueue } from '@/lib/queue';
import { sendText } from '@/lib/whatsapp/client';
import { handleInboundMessage } from '@/lib/modules/check/whatsapp/handler';

let messages: ReturnType<typeof makeChain>;
let sessions: ReturnType<typeof makeChain>;
let codes: ReturnType<typeof makeChain>;
let profiles: ReturnType<typeof makeChain>;

function setup({ profile = null as unknown, session = {} as unknown, insertError = null as unknown, codeRow = null as unknown, profileError = null as unknown } = {}) {
  messages = makeChain({ data: null, error: insertError });
  sessions = makeChain({ data: { state: session }, error: null });
  codes = makeChain({ data: codeRow, error: null });
  profiles = makeChain({ data: null, error: profileError });
  vi.mocked(createAdminClient).mockReturnValue(
    makeSupabase({ tables: { whatsapp_messages: messages, whatsapp_sessions: sessions, whatsapp_link_codes: codes, profiles } }) as never,
  );
  vi.mocked(getProfileByWhatsapp).mockResolvedValue(profile as never);
}

const msg = (over: Partial<InboundMessage> = {}): InboundMessage => ({
  messageId: 'wamid.1',
  from: '+919800000001',
  waId: '919800000001',
  type: 'text',
  text: 'shipped the new release this week',
  forwarded: false,
  ...over,
});

beforeEach(() => {
  vi.mocked(enqueue).mockResolvedValue({ messageId: 'q' });
  vi.mocked(sendText).mockResolvedValue(undefined);
});

describe('dispatchMessage', () => {
  it('drops duplicate deliveries before doing any work', async () => {
    setup({ profile: { id: 'u1' }, session: { mode: 'post' }, insertError: { code: '23505' } });
    await dispatchMessage(msg());
    expect(enqueue).not.toHaveBeenCalled();
    expect(sendText).not.toHaveBeenCalled();
  });

  it('rethrows non-duplicate insert errors', async () => {
    setup({ profile: { id: 'u1' }, insertError: { code: '500' } });
    await expect(dispatchMessage(msg())).rejects.toBeTruthy();
  });

  it('records the routed module on the message row', async () => {
    setup({ profile: { id: 'u1' }, session: { mode: 'reels' } });
    await dispatchMessage(msg());
    expect(messages.insert).toHaveBeenCalledWith(expect.objectContaining({ wa_message_id: 'wamid.1', user_id: 'u1', module: 'reels' }));
  });

  it('enqueues a VoiceJob for Post with a dedupe id', async () => {
    setup({ profile: { id: 'u1' }, session: { mode: 'post' } });
    await dispatchMessage(msg({ type: 'audio', text: undefined, mediaId: 'media-1' }));
    expect(enqueue).toHaveBeenCalledWith(
      JOB_PATHS.post,
      { waMessageId: 'wamid.1', from: '+919800000001', type: 'audio', userId: 'u1', mediaId: 'media-1', text: undefined },
      { deduplicationId: 'wamid.1' },
    );
  });

  it('enqueues text for Reels at the Reels worker', async () => {
    setup({ profile: { id: 'u1' }, session: { mode: 'reels' } });
    await dispatchMessage(msg({ text: 'reel idea: monsoon chai' }));
    expect(vi.mocked(enqueue).mock.calls[0][0]).toBe('/api/reels/jobs/generate');
    expect(vi.mocked(enqueue).mock.calls[0][1]).toMatchObject({ type: 'text', text: 'reel idea: monsoon chai' });
  });

  it('hands forwards to Check (audio is unsupported there)', async () => {
    setup({ profile: null });
    await dispatchMessage(msg({ forwarded: true, text: 'Free laptops from govt!' }));
    expect(handleInboundMessage).toHaveBeenCalledWith({
      waId: '919800000001',
      messageId: 'wamid.1',
      type: 'text',
      text: 'Free laptops from govt!',
      mediaId: undefined,
    });
    setup({ profile: null });
    await dispatchMessage(msg({ type: 'audio', text: undefined, mediaId: 'a' }));
    expect(vi.mocked(handleInboundMessage).mock.calls[1][0].type).toBe('unsupported');
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('shows the menu and remembers it was shown', async () => {
    setup({ profile: { id: 'u1' } });
    await dispatchMessage(msg({ text: 'menu' }));
    expect(sessions.upsert).toHaveBeenCalledWith(expect.objectContaining({ from_e164: '+919800000001', state: { awaitingMenu: true } }));
    expect(vi.mocked(sendText).mock.calls[0][1]).toMatch(/Reply 1, 2 or 3/);
  });

  it('a menu choice saves the mode and confirms it', async () => {
    setup({ profile: { id: 'u1' }, session: { awaitingMenu: true } });
    await dispatchMessage(msg({ text: '1' }));
    expect(sessions.upsert).toHaveBeenCalledWith(expect.objectContaining({ state: { mode: 'post', awaitingMenu: false } }));
    expect(vi.mocked(sendText).mock.calls[0][1]).toMatch(/Post/);
  });

  it('asks unknown numbers to sign up for Post/Reels', async () => {
    setup({ profile: null });
    await dispatchMessage(msg({ text: 'post' }));
    expect(vi.mocked(sendText).mock.calls[0][1]).toMatch(/\/login/);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('nudges when Post/Reels receive something they cannot use', async () => {
    setup({ profile: { id: 'u1' }, session: { mode: 'post' } });
    await dispatchMessage(msg({ type: 'unsupported', text: undefined }));
    expect(enqueue).not.toHaveBeenCalled();
    expect(vi.mocked(sendText).mock.calls[0][1]).toMatch(/voice note/);
  });

  it('a failed WhatsApp reply never breaks routing', async () => {
    setup({ profile: { id: 'u1' } });
    vi.mocked(sendText).mockRejectedValue(new Error('no key'));
    await expect(dispatchMessage(msg({ text: 'menu' }))).resolves.toBeUndefined();
  });

  it('LINK <code> links the SENDING number to the code owner and consumes the code', async () => {
    setup({ profile: null, codeRow: { user_id: 'u9' } });
    await dispatchMessage(msg({ text: 'LINK 123456' }));
    expect(codes.delete).toHaveBeenCalled();
    expect(codes.eq).toHaveBeenCalledWith('code', '123456');
    expect(codes.gt).toHaveBeenCalledWith('expires_at', expect.any(String));
    expect(profiles.update).toHaveBeenCalledWith({ whatsapp_e164: '+919800000001' });
    expect(profiles.eq).toHaveBeenCalledWith('id', 'u9');
    expect(vi.mocked(sendText).mock.calls[0][1]).toMatch(/now linked/);
  });

  it('rejects unknown / expired codes without touching profiles', async () => {
    setup({ profile: null, codeRow: null });
    await dispatchMessage(msg({ text: 'LINK 999999' }));
    expect(profiles.update).not.toHaveBeenCalled();
    expect(vi.mocked(sendText).mock.calls[0][1]).toMatch(/invalid or has expired/);
  });

  it('never moves a number already linked to another account', async () => {
    setup({ profile: null, codeRow: { user_id: 'u9' }, profileError: { code: '23505' } });
    await dispatchMessage(msg({ text: 'LINK 123456' }));
    expect(vi.mocked(sendText).mock.calls[0][1]).toMatch(/already linked/);
  });
});
