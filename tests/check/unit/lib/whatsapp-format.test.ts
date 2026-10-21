import { describe, it, expect } from 'vitest';
import { formatVerdict, scoreEmoji, DISCLAIMER, QUOTA_MESSAGE, MEDIA_UPGRADE_MESSAGE } from '@/lib/modules/check/whatsapp/format';
import type { Verdict } from '@/lib/modules/check/types';

function v(over: Partial<Verdict>): Verdict {
  return { trustScore: 8, label: 'verified', explanation: 'Confirmed by PIB.', claims: [], sources: [], language: 'en', ...over };
}

describe('scoreEmoji', () => {
  it('maps score band + manipulated to an emoji', () => {
    expect(scoreEmoji(v({ trustScore: 9 }))).toBe('✅');
    expect(scoreEmoji(v({ trustScore: 5 }))).toBe('⚠️');
    expect(scoreEmoji(v({ trustScore: 2, label: 'false' }))).toBe('❌');
    expect(scoreEmoji(v({ label: 'manipulated' }))).toBe('🎭');
  });
});

describe('formatVerdict', () => {
  it('renders score, explanation, sources and the humility disclaimer', () => {
    const msg = formatVerdict(
      v({ trustScore: 2, label: 'false', explanation: 'This is false.', sources: [{ title: 'PIB Fact Check', url: 'https://pib.gov.in/x' }] }),
    );
    expect(msg).toContain('Trust score: 2/10');
    expect(msg).toContain('This is false.');
    expect(msg).toContain('PIB Fact Check');
    expect(msg).toContain('https://pib.gov.in/x');
    expect(msg).toContain(DISCLAIMER);
  });

  it('omits the sources block when there are none but still disclaims', () => {
    const msg = formatVerdict(v({ label: 'unverified', sources: [] }));
    expect(msg).not.toContain('*Sources:*');
    expect(msg).toContain(DISCLAIMER);
  });
});

describe('Manch branding + upgrade copy', () => {
  it('the disclaimer names Manch Check (not TrustCheck)', () => {
    expect(DISCLAIMER).toContain('Manch Check');
    expect(DISCLAIMER).not.toContain('TrustCheck');
  });
  it('quota + media upsells point to Manch Plus on the shared billing page', () => {
    for (const m of [QUOTA_MESSAGE, MEDIA_UPGRADE_MESSAGE]) {
      expect(m).toContain('Manch Plus');
      expect(m).toContain('/settings/billing?plan=plus');
    }
  });
});
