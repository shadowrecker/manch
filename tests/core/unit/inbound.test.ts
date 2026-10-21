import { describe, it, expect } from 'vitest';
import { parseInbound } from '@/lib/whatsapp/inbound';

const wrap = (...messages: unknown[]) => ({ entry: [{ changes: [{ value: { messages } }] }] });

describe('parseInbound', () => {
  it('parses text, voice, audio, image, video and interactive replies', () => {
    const out = parseInbound(
      wrap(
        { id: 'm1', from: '919812345678', type: 'text', text: { body: '  hello ' } },
        { id: 'm2', from: '919812345678', type: 'voice', voice: { id: 'v1' } },
        { id: 'm3', from: '919812345678', type: 'audio', audio: { id: 'a1' } },
        { id: 'm4', from: '919812345678', type: 'image', image: { id: 'i1' } },
        { id: 'm5', from: '919812345678', type: 'video', video: { id: 'vd1' } },
        { id: 'm6', from: '919812345678', type: 'interactive', interactive: { button_reply: { id: 'mode:post' } } },
        { id: 'm7', from: '919812345678', type: 'sticker' },
      ),
    );
    expect(out.map((m) => m.type)).toEqual(['text', 'audio', 'audio', 'image', 'video', 'interactive', 'unsupported']);
    expect(out[0]).toMatchObject({ text: 'hello', from: '+919812345678', waId: '919812345678', forwarded: false });
    expect(out[1].mediaId).toBe('v1');
    expect(out[2].mediaId).toBe('a1');
    expect(out[5].text).toBe('mode:post');
  });

  it('flags forwarded and frequently-forwarded messages', () => {
    const out = parseInbound(
      wrap(
        { id: 'f1', from: '91', type: 'text', text: { body: 'x' }, context: { forwarded: true } },
        { id: 'f2', from: '91', type: 'image', image: { id: 'i' }, context: { frequently_forwarded: true } },
      ),
    );
    expect(out.every((m) => m.forwarded)).toBe(true);
  });

  it('ignores status callbacks, junk and messages missing id/from/type', () => {
    expect(parseInbound(null)).toEqual([]);
    expect(parseInbound({ entry: [{ changes: [{ value: { statuses: [{}] } }] }] })).toEqual([]);
    expect(parseInbound(wrap({ from: '91', type: 'text' }, { id: 'x', type: 'text' }, { id: 'y', from: '91' }))).toEqual([]);
  });
});
