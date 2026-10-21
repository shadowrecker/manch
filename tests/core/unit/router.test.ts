import { describe, it, expect } from 'vitest';
import { asSession, decideRoute, needsAccountText, MENU_TEXT } from '@/lib/whatsapp/router';

const text = (t: string, forwarded = false) => ({ type: 'text' as const, text: t, forwarded });

describe('decideRoute — one WhatsApp number for every module', () => {
  it('menu keywords show the menu', () => {
    for (const w of ['menu', 'HELP', ' hi ', 'Namaste']) {
      expect(decideRoute({ msg: text(w), hasAccount: true, session: {} })).toEqual({ action: 'menu' });
    }
  });

  it('mode keywords switch mode for account holders', () => {
    expect(decideRoute({ msg: text('post'), hasAccount: true, session: {} })).toEqual({ action: 'set_mode', module: 'post' });
    expect(decideRoute({ msg: text('Reel'), hasAccount: true, session: {} })).toEqual({ action: 'set_mode', module: 'reels' });
    expect(decideRoute({ msg: text('check'), hasAccount: true, session: {} })).toEqual({ action: 'set_mode', module: 'check' });
    expect(
      decideRoute({ msg: { type: 'interactive', text: 'mode:reels', forwarded: false }, hasAccount: true, session: {} }),
    ).toEqual({ action: 'set_mode', module: 'reels' });
  });

  it('post/reels need an account; check never does', () => {
    expect(decideRoute({ msg: text('post'), hasAccount: false, session: {} })).toEqual({ action: 'needs_account', module: 'post' });
    expect(decideRoute({ msg: text('reels'), hasAccount: false, session: {} })).toEqual({ action: 'needs_account', module: 'reels' });
    expect(decideRoute({ msg: text('check'), hasAccount: false, session: {} })).toEqual({ action: 'set_mode', module: 'check' });
  });

  it('numbers pick a mode ONLY right after the menu (no clash with Check language onboarding)', () => {
    expect(decideRoute({ msg: text('2'), hasAccount: true, session: { awaitingMenu: true } })).toEqual({ action: 'set_mode', module: 'reels' });
    expect(decideRoute({ msg: text('2'), hasAccount: true, session: { mode: 'check' } })).toEqual({ action: 'route', module: 'check' });
  });

  it('forwards, photos and videos always go to Check — even in Post mode', () => {
    expect(decideRoute({ msg: text('post', true), hasAccount: true, session: { mode: 'post' } })).toEqual({ action: 'route', module: 'check' });
    expect(decideRoute({ msg: { type: 'image', forwarded: false }, hasAccount: true, session: { mode: 'post' } })).toEqual({ action: 'route', module: 'check' });
    expect(decideRoute({ msg: { type: 'video', forwarded: false }, hasAccount: true, session: { mode: 'reels' } })).toEqual({ action: 'route', module: 'check' });
  });

  it('unknown numbers get the public fact-checker', () => {
    expect(decideRoute({ msg: text('is this true?'), hasAccount: false, session: {} })).toEqual({ action: 'route', module: 'check' });
    expect(decideRoute({ msg: { type: 'audio', forwarded: false }, hasAccount: false, session: {} })).toEqual({ action: 'route', module: 'check' });
  });

  it('account holders go to their saved mode, else the menu', () => {
    expect(decideRoute({ msg: { type: 'audio', forwarded: false }, hasAccount: true, session: { mode: 'post' } })).toEqual({ action: 'route', module: 'post' });
    expect(decideRoute({ msg: text('my week was busy'), hasAccount: true, session: { mode: 'reels' } })).toEqual({ action: 'route', module: 'reels' });
    expect(decideRoute({ msg: text('my week was busy'), hasAccount: true, session: {} })).toEqual({ action: 'menu' });
  });

  it('asSession tolerates junk', () => {
    expect(asSession(null)).toEqual({});
    expect(asSession([1, 2] as never)).toEqual({});
    expect(asSession({ mode: 'post' })).toEqual({ mode: 'post' });
  });

  it('copy mentions all three modes and the signup link', () => {
    expect(MENU_TEXT).toMatch(/Post/);
    expect(MENU_TEXT).toMatch(/Reels/);
    expect(MENU_TEXT).toMatch(/Check/);
    expect(needsAccountText('post', 'https://manch.app')).toContain('https://manch.app/login');
  });
});

describe('decideRoute — LINK codes', () => {
  it('recognises "LINK 123456" from the sender, with or without an account', () => {
    expect(decideRoute({ msg: text('LINK 123456'), hasAccount: false, session: {} })).toEqual({ action: 'link', code: '123456' });
    expect(decideRoute({ msg: text(' link 000042 '), hasAccount: true, session: { mode: 'post' } })).toEqual({ action: 'link', code: '000042' });
  });

  it('a forwarded code proves nothing and goes to Check', () => {
    expect(decideRoute({ msg: text('LINK 123456', true), hasAccount: false, session: {} })).toEqual({ action: 'route', module: 'check' });
  });

  it('malformed codes are not link attempts', () => {
    expect(decideRoute({ msg: text('link 12345'), hasAccount: true, session: { mode: 'post' } })).toEqual({ action: 'route', module: 'post' });
  });
});
