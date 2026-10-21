import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('next/navigation', () => ({ usePathname: () => '/', useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock('posthog-js', () => ({ default: { capture: vi.fn(), __loaded: false } }));
// html-to-image is only invoked on a download click we never trigger.
vi.mock('html-to-image', () => ({ toPng: vi.fn(() => Promise.resolve('data:image/png;base64,')) }));

import { MediaKitClient } from '@/components/deals/MediaKitClient';
import { MatchesClient } from '@/components/deals/MatchesClient';
import { RatesClient } from '@/components/deals/RatesClient';
import { PitchClient } from '@/components/deals/PitchClient';
import { DealsClient } from '@/components/deals/DealsClient';
import type { BrandMatch, IgMetrics, MediaKitData, RateBenchmark } from '@/lib/modules/deals/types';

function mockFetch(handler: (url: string, init?: RequestInit) => Response) {
  vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => Promise.resolve(handler(url, init))));
}
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });
beforeEach(() => vi.unstubAllGlobals());

const METRICS: IgMetrics = { followers: 8500, engagementRate: 4.2, avgLikes: 300, avgComments: 25, topCategories: ['food'], audience: null };
const KIT: MediaKitData = { headline: 'Lucknow food creator', about: 'About text.', keyStatsNarrative: 'Stats.', whyBrands: 'Why.', pricingNote: 'Pricing.' };

describe('<MediaKitClient>', () => {
  it('with no metrics: shows Connect Instagram + the manual stats form', () => {
    render(<MediaKitClient appUrl="http://x" name={null} metrics={null} kit={null} shareId={null} />);
    expect(screen.getByRole('link', { name: /Connect Instagram/i })).toHaveAttribute('href', '/api/deals/instagram/connect');
    expect(screen.getByPlaceholderText(/e.g. 8500/i)).toBeInTheDocument();
  });

  it('generates a media kit and renders the card', async () => {
    mockFetch(() => json({ kit: KIT, metrics: METRICS, shareId: 'abc' }));
    const user = userEvent.setup();
    render(<MediaKitClient appUrl="http://x" name="Anjali" metrics={METRICS} kit={null} shareId={null} />);
    await user.click(screen.getByRole('button', { name: /Generate my media kit/i }));
    expect(await screen.findByText('Lucknow food creator')).toBeInTheDocument();
  });

  it('opens the paywall on a 402', async () => {
    mockFetch(() => json({ error: 'limit', code: 'limit_reached' }, 402));
    const user = userEvent.setup();
    render(<MediaKitClient appUrl="http://x" name={null} metrics={METRICS} kit={null} shareId={null} />);
    await user.click(screen.getByRole('button', { name: /Generate my media kit/i }));
    expect(await screen.findByText(/Unlimited media kits/i)).toBeInTheDocument();
    // Core Paywall offers the Manch plans that unlock Deals, linking to the one billing page.
    expect(screen.getByRole('link', { name: /Plus/ })).toHaveAttribute('href', '/settings/billing?plan=plus');
  });
});

describe('<MatchesClient>', () => {
  const MATCHES: BrandMatch[] = [{ brandId: 'b1', name: 'Slurrp Farm', fitScore: 88, reasons: ['food niche fit'], website: 'https://x', niche: ['food'] }];

  it('runs the engine and renders ranked brands with reasons', async () => {
    mockFetch(() => json({ matches: MATCHES }));
    const user = userEvent.setup();
    render(<MatchesClient canMatch initialMatches={[]} />);
    await user.click(screen.getByRole('button', { name: /Find my matches/i }));
    expect(await screen.findByText('Slurrp Farm')).toBeInTheDocument();
    expect(screen.getByText(/food niche fit/i)).toBeInTheDocument();
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe('/api/deals/matches');
    // "Write pitch" deep-links to the Deals pitch page for that brand.
    expect(screen.getByRole('link', { name: /Write pitch/i })).toHaveAttribute('href', '/deals/pitch/b1');
  });

  it('paywalls a free creator without calling the API', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    const user = userEvent.setup();
    render(<MatchesClient canMatch={false} initialMatches={[]} />);
    await user.click(screen.getByRole('button', { name: /Find my matches/i }));
    expect(await screen.findByText(/Unlock brand matches/i)).toBeInTheDocument();
    expect(f).not.toHaveBeenCalled();
  });
});

describe('<RatesClient>', () => {
  const rates: RateBenchmark[] = [{ deliverable: 'reel', p25Paise: 1080000, p50Paise: 1800000, p75Paise: 2880000, sampleSize: 62 }];

  it('renders the rate table and fetches negotiation tips', async () => {
    mockFetch(() => json({ rationale: 'Anchor at the median.' }));
    const user = userEvent.setup();
    render(<RatesClient canRate card={{ niche: 'food', band: 'micro', rates, suggestedRatePaise: 1800000 }} />);
    expect(screen.getAllByText('₹18,000').length).toBeGreaterThan(0); // hero + reel p50
    await user.click(screen.getByRole('button', { name: /negotiation tips/i }));
    expect(await screen.findByText(/Anchor at the median/i)).toBeInTheDocument();
  });
});

describe('<PitchClient>', () => {
  it('writes a pitch and renders subject + body', async () => {
    mockFetch(() => json({ subject: 'Collab with you', body: 'Hi team,', proposedRatePaise: 1800000 }));
    const user = userEvent.setup();
    render(<PitchClient brandId="b1" brandName="Slurrp Farm" brandNiche={['food']} />);
    await user.click(screen.getByRole('button', { name: /Write my pitch/i }));
    expect(await screen.findByDisplayValue('Collab with you')).toBeInTheDocument();
    expect(screen.getByText(/Suggested rate: ₹18,000/i)).toBeInTheDocument();
  });
});

describe('<DealsClient>', () => {
  it('adds a deal and shows the platform fee', async () => {
    mockFetch(() => json({ deal: { id: 'd1', brand_name: 'Mamaearth', value_paise: 2500000, status: 'pitched', commission_status: 'none', commission_paise: 125000 } }));
    const user = userEvent.setup();
    render(<DealsClient canTrackDeals initialDeals={[]} />);
    await user.type(screen.getByPlaceholderText(/Mamaearth/i), 'Mamaearth');
    await user.type(screen.getByPlaceholderText(/25000/i), '25000');
    await user.click(screen.getByRole('button', { name: /Add deal/i }));
    expect(await screen.findByText('Mamaearth')).toBeInTheDocument();
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe('/api/deals/pipeline');
  });

  it('paywalls a free creator', async () => {
    const user = userEvent.setup();
    render(<DealsClient canTrackDeals={false} initialDeals={[]} />);
    await user.type(screen.getByPlaceholderText(/Mamaearth/i), 'X');
    await user.click(screen.getByRole('button', { name: /Add deal/i }));
    expect(await screen.findByText(/Track deals & collect payment/i)).toBeInTheDocument();
  });
});
