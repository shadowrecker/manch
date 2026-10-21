import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('next/navigation', () => ({ usePathname: () => '/reels/studio', useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock('posthog-js', () => ({ default: { capture: vi.fn(), __loaded: false } }));

import { StudioClient } from '@/components/reels/StudioClient';
import { HashtagClient } from '@/components/reels/HashtagClient';
import { AudioClient } from '@/components/reels/AudioClient';
import { AgencyClient } from '@/components/reels/AgencyClient';

let fetchMock: ReturnType<typeof vi.fn>;
function mockFetch(handler: (url: string, init?: RequestInit) => Response) {
  fetchMock = vi.fn((url: string, init?: RequestInit) => Promise.resolve(handler(url, init)));
  vi.stubGlobal('fetch', fetchMock);
}
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });
beforeEach(() => vi.unstubAllGlobals());

const THREE = {
  educational: { hook: 'शिक्षा हुक', body: 'b', cta: 'c' },
  entertainment: { hook: 'मज़ा', body: 'b', cta: 'c' },
  emotional: { hook: 'भावना', body: 'b', cta: 'c' },
};

describe('<StudioClient>', () => {
  it('generates 3 scripts and renders them', async () => {
    mockFetch(() => json({ styles: THREE }));
    const user = userEvent.setup();
    render(<StudioClient plan="plus" credits={0} defaultLanguage="hi" handle="anjali" />);
    await user.type(screen.getByPlaceholderText(/My morning routine/i), 'my idea');
    await user.click(screen.getByRole('button', { name: /generate 3 scripts/i }));
    expect(await screen.findByText('शिक्षा हुक')).toBeInTheDocument();
    expect(screen.getByText('मज़ा')).toBeInTheDocument();
    expect(fetchMock.mock.calls[0][0]).toBe('/api/reels/script');
  });
  it('opens the Paywall (with the ₹49 content pack → /settings/billing) on a 402', async () => {
    mockFetch(() => json({ error: 'limit', code: 'limit_reached' }, 402));
    const user = userEvent.setup();
    render(<StudioClient plan="free" credits={0} defaultLanguage="hi" handle={null} />);
    await user.type(screen.getByPlaceholderText(/My morning routine/i), 'x');
    await user.click(screen.getByRole('button', { name: /generate 3 scripts/i }));
    expect(await screen.findByText(/10 credits/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /content pack/i })).toHaveAttribute('href', '/settings/billing');
  });
  it('example chip fills the textarea', async () => {
    mockFetch(() => json({ styles: THREE }));
    const user = userEvent.setup();
    render(<StudioClient plan="free" credits={0} defaultLanguage="hi" handle={null} />);
    await user.click(screen.getByText('5 budget travel tips for India'));
    expect((screen.getByPlaceholderText(/My morning routine/i) as HTMLTextAreaElement).value).toMatch(/budget travel/);
  });
});

describe('<HashtagClient>', () => {
  it('loads + renders the three hashtag tiers', async () => {
    mockFetch(() => json({ tags: { high: ['#reels'], mid: ['#vlog'], niche: ['#देसी'] } }));
    const user = userEvent.setup();
    render(<HashtagClient defaultLanguage="hi" />);
    await user.click(screen.getByRole('button', { name: /get hashtags/i }));
    expect(await screen.findByText('#reels')).toBeInTheDocument();
    expect(screen.getByText('#देसी')).toBeInTheDocument();
    expect(screen.getByText('High volume')).toBeInTheDocument();
    expect(fetchMock.mock.calls[0][0]).toMatch(/^\/api\/reels\/hashtags\?/);
  });
  it('shows an empty state when nothing is curated', async () => {
    mockFetch(() => json({ tags: null }));
    const user = userEvent.setup();
    render(<HashtagClient defaultLanguage="ta" />);
    await user.click(screen.getByRole('button', { name: /get hashtags/i }));
    expect(await screen.findByText(/No curated hashtags/i)).toBeInTheDocument();
  });
});

describe('<AudioClient>', () => {
  it('loads + renders trending audio rows', async () => {
    mockFetch(() => json({ audio: [{ id: 'a1', title: 'गाना', audioUrl: 'http://x', mood: 'hype', region: null, platform: 'instagram', rank: 1 }] }));
    const user = userEvent.setup();
    render(<AudioClient defaultLanguage="hi" />);
    await user.click(screen.getByRole('button', { name: /find trending audio/i }));
    expect(await screen.findByText('गाना')).toBeInTheDocument();
    expect(screen.getByText('hype')).toBeInTheDocument();
    expect(fetchMock.mock.calls[0][0]).toMatch(/^\/api\/reels\/audio\?/);
  });
});

describe('<AgencyClient>', () => {
  it('creates a brand preset and lists it', async () => {
    mockFetch(() => json({ preset: { id: 'bp1', name: 'Sharma Sweets', brief: null, default_languages: ['hi'] } }));
    const user = userEvent.setup();
    render(<AgencyClient initialPresets={[]} />);
    await user.type(screen.getByPlaceholderText(/Sharma Sweets/i), 'Sharma Sweets');
    await user.click(screen.getByRole('button', { name: /save brand preset/i }));
    expect(await screen.findByText('Sharma Sweets')).toBeInTheDocument();
    await waitFor(() => expect(fetchMock.mock.calls[0][0]).toBe('/api/reels/agency/brands'));
  });
});
