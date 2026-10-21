import crypto from 'node:crypto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { safeNext } from '@/lib/auth';
import { MODULE_NAV, isTabActive, moduleForPath } from '@/lib/nav';
import { clip, formatINR, isoWeekMonday, monthPeriod, normaliseE164 } from '@/lib/utils';

describe('lib/whatsapp/verify', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  async function load(secret: string) {
    vi.stubEnv('DIALOG360_WEBHOOK_SECRET', secret);
    return import('@/lib/whatsapp/verify');
  }

  it('verifyToken: constant-time match, fails closed without a secret', async () => {
    const v = await load('s3cret');
    expect(v.verifyToken('s3cret')).toBe(true);
    expect(v.verifyToken('nope')).toBe(false);
    expect(v.verifyToken(null)).toBe(false);
    const unset = await load('');
    expect(unset.verifyToken('')).toBe(false);
    expect(unset.verifyToken('anything')).toBe(false);
  });

  it('verifySignature accepts a valid sha256= HMAC and rejects tampering', async () => {
    const v = await load('s3cret');
    const body = '{"a":1}';
    const sig = crypto.createHmac('sha256', 's3cret').update(body).digest('hex');
    expect(await v.verifySignature(body, `sha256=${sig}`)).toBe(true);
    expect(await v.verifySignature(`${body} `, `sha256=${sig}`)).toBe(false);
    expect(await v.verifySignature(body, null)).toBe(false);
  });

  it('verifyWebhookGet echoes the challenge only for the right token', async () => {
    const v = await load('s3cret');
    const ok = new URLSearchParams({ 'hub.mode': 'subscribe', 'hub.verify_token': 's3cret', 'hub.challenge': 'c' });
    const bad = new URLSearchParams({ 'hub.mode': 'subscribe', 'hub.verify_token': 'x', 'hub.challenge': 'c' });
    expect(v.verifyWebhookGet(ok)).toBe('c');
    expect(v.verifyWebhookGet(bad)).toBeNull();
  });
});

describe('safeNext (post-login redirect guard)', () => {
  it('allows same-origin paths', () => {
    expect(safeNext('/deals/matches')).toBe('/deals/matches');
  });
  it('blocks open redirects', () => {
    for (const evil of ['//evil.com', '/\\evil.com', 'https://evil.com', 'evil.com', '', null, undefined]) {
      expect(safeNext(evil as string | null)).toBe('/home');
    }
  });
});

describe('lib/nav', () => {
  it('resolves the module from the path', () => {
    expect(moduleForPath('/post/generate')).toBe('post');
    expect(moduleForPath('/deals')).toBe('deals');
    expect(moduleForPath('/check/history')).toBe('check');
    expect(moduleForPath('/home')).toBeNull();
    expect(moduleForPath('/settings/billing')).toBeNull();
    expect(moduleForPath('/postal')).toBeNull();
  });

  it('exact tabs only match their own path', () => {
    const dash = { href: '/deals', exact: true };
    expect(isTabActive('/deals', dash)).toBe(true);
    expect(isTabActive('/deals/matches', dash)).toBe(false);
    expect(isTabActive('/deals/pitch/1', { href: '/deals/pitch' })).toBe(true);
    expect(isTabActive('/deals/pitchx', { href: '/deals/pitch' })).toBe(false);
  });

  it('every module home is one of its own tabs', () => {
    for (const m of MODULE_NAV) {
      expect(m.tabs.some((t) => t.href === m.home)).toBe(true);
      expect(m.tabs.every((t) => t.href.startsWith(`/${m.key}`))).toBe(true);
    }
  });
});

describe('lib/utils', () => {
  it('formats and normalises', () => {
    expect(normaliseE164('+91 98123-45678')).toBe('+919812345678');
    expect(normaliseE164('919812345678')).toBe('+919812345678');
    expect(formatINR(250000)).toBe('₹2,500');
    expect(formatINR(null)).toBe('₹0');
    expect(monthPeriod(new Date('2026-10-21T10:00:00Z'))).toBe('2026-10-01');
    expect(isoWeekMonday(new Date('2026-10-25T10:00:00Z'))).toBe('2026-10-19');
    expect(clip('a'.repeat(70)).length).toBe(61);
    expect(clip('short')).toBe('short');
  });
});
