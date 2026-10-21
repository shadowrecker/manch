import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Component test for the 5-step voice-profile wizard. We drive it with
// user-event and assert step gating, the 3-topic cap, the final POST body to
// /api/post/voice-profile, and the route push to /generate. Read components/OnboardingWizard.tsx
// for the exact chip lists / labels / guards.

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
  usePathname: () => '/post/onboarding',
  useSearchParams: () => new URLSearchParams(),
}));

// Mock the toast so we can assert which guard fired without depending on the
// CustomEvent/<Toaster/> plumbing.
const toast = vi.fn();
vi.mock('@/components/ui/toast', () => ({ toast: (m: string) => toast(m) }));

import { OnboardingWizard } from '@/components/post/OnboardingWizard';

// Heading text shows the current step (e.g. "1 · What's your industry?").
function headingFor() {
  return screen.getByRole('heading', { level: 2 }).textContent ?? '';
}

function clickChip(label: string) {
  // Chips render as role="button" spans with their label as text.
  return screen.getByRole('button', { name: label });
}

beforeEach(() => {
  push.mockReset();
  toast.mockReset();
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    ),
  );
});

describe('<OnboardingWizard>', () => {
  it('starts on step 0 (industry) and does not advance when industry is empty', async () => {
    const user = userEvent.setup();
    render(<OnboardingWizard initial={null} />);

    expect(headingFor()).toMatch(/industry/i);

    await user.click(screen.getByRole('button', { name: /Continue/i }));

    // Guard fired: toast, still on step 0.
    expect(toast).toHaveBeenCalled();
    expect(headingFor()).toMatch(/industry/i);
  });

  it('advances to seniority once an industry is typed', async () => {
    const user = userEvent.setup();
    render(<OnboardingWizard initial={null} />);

    await user.type(screen.getByRole('textbox'), 'SaaS / fintech');
    await user.click(screen.getByRole('button', { name: /Continue/i }));

    expect(headingFor()).toMatch(/seniority/i);
    expect(screen.getByRole('button', { name: 'Founder / CEO' })).toBeInTheDocument();
  });

  it('whitespace-only industry is treated as empty (does not advance)', async () => {
    const user = userEvent.setup();
    render(<OnboardingWizard initial={null} />);

    await user.type(screen.getByRole('textbox'), '   ');
    await user.click(screen.getByRole('button', { name: /Continue/i }));

    expect(headingFor()).toMatch(/industry/i);
  });

  it('requires a seniority before leaving step 1', async () => {
    const user = userEvent.setup();
    render(<OnboardingWizard initial={{ industry: 'SaaS', seniority: '', topics: [], tone: '' }} />);

    await user.click(screen.getByRole('button', { name: /Continue/i })); // 0 -> 1
    expect(headingFor()).toMatch(/seniority/i);

    toast.mockClear();
    await user.click(screen.getByRole('button', { name: /Continue/i })); // blocked
    expect(toast).toHaveBeenCalled();
    expect(headingFor()).toMatch(/seniority/i);

    await user.click(clickChip('Founder / CEO'));
    await user.click(screen.getByRole('button', { name: /Continue/i })); // 1 -> 2
    expect(headingFor()).toMatch(/topics/i);
  });

  it('requires at least one topic before leaving step 2', async () => {
    const user = userEvent.setup();
    render(
      <OnboardingWizard
        initial={{ industry: 'SaaS', seniority: 'Founder / CEO', topics: [], tone: '' }}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Continue/i })); // 0 -> 1
    await user.click(screen.getByRole('button', { name: /Continue/i })); // 1 -> 2 (seniority preset)
    expect(headingFor()).toMatch(/topics/i);

    toast.mockClear();
    await user.click(screen.getByRole('button', { name: /Continue/i })); // blocked, 0 topics
    expect(toast).toHaveBeenCalled();
    expect(headingFor()).toMatch(/topics/i);

    await user.click(clickChip('Product'));
    expect(screen.getByText('Selected: 1/3')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Continue/i })); // 2 -> 3
    expect(headingFor()).toMatch(/sound/i);
  });

  it('enforces the 3-topic cap: a 4th selection is blocked and toasts', async () => {
    const user = userEvent.setup();
    render(
      <OnboardingWizard
        initial={{ industry: 'SaaS', seniority: 'Founder / CEO', topics: [], tone: '' }}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Continue/i })); // 0 -> 1
    await user.click(screen.getByRole('button', { name: /Continue/i })); // 1 -> 2
    expect(headingFor()).toMatch(/topics/i);

    await user.click(clickChip('Building in public'));
    await user.click(clickChip('Fundraising'));
    await user.click(clickChip('Product'));
    expect(screen.getByText('Selected: 3/3')).toBeInTheDocument();

    toast.mockClear();
    await user.click(clickChip('Engineering')); // 4th -> blocked
    expect(toast).toHaveBeenCalledWith(expect.stringMatching(/up to 3/i));
    // Still 3 selected.
    expect(screen.getByText('Selected: 3/3')).toBeInTheDocument();
  });

  it('toggling an already-selected topic deselects it (does not count against the cap)', async () => {
    const user = userEvent.setup();
    render(
      <OnboardingWizard
        initial={{ industry: 'SaaS', seniority: 'Founder / CEO', topics: [], tone: '' }}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Continue/i })); // 0 -> 1
    await user.click(screen.getByRole('button', { name: /Continue/i })); // 1 -> 2

    await user.click(clickChip('Product'));
    expect(screen.getByText('Selected: 1/3')).toBeInTheDocument();
    await user.click(clickChip('Product')); // deselect
    expect(screen.getByText('Selected: 0/3')).toBeInTheDocument();
  });

  it('requires a tone before leaving step 3', async () => {
    const user = userEvent.setup();
    render(
      <OnboardingWizard
        initial={{ industry: 'SaaS', seniority: 'Founder / CEO', topics: ['Product'], tone: '' }}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Continue/i })); // 0 -> 1
    await user.click(screen.getByRole('button', { name: /Continue/i })); // 1 -> 2
    await user.click(screen.getByRole('button', { name: /Continue/i })); // 2 -> 3 (topic preset)
    expect(headingFor()).toMatch(/sound/i);

    toast.mockClear();
    await user.click(screen.getByRole('button', { name: /Continue/i })); // blocked, no tone
    expect(toast).toHaveBeenCalled();
    expect(headingFor()).toMatch(/sound/i);

    await user.click(clickChip('Direct & punchy'));
    await user.click(screen.getByRole('button', { name: /Continue/i })); // 3 -> 4
    expect(headingFor()).toMatch(/writing sample/i);
  });

  it('Back navigates to the previous step', async () => {
    const user = userEvent.setup();
    render(<OnboardingWizard initial={{ industry: 'SaaS', seniority: '', topics: [], tone: '' }} />);

    await user.click(screen.getByRole('button', { name: /Continue/i })); // 0 -> 1
    expect(headingFor()).toMatch(/seniority/i);
    await user.click(screen.getByRole('button', { name: /Back/i }));
    expect(headingFor()).toMatch(/industry/i);
  });

  it('on the final step, POSTs the trimmed profile to /api/post/voice-profile and routes to /post/generate', async () => {
    const user = userEvent.setup();
    render(
      <OnboardingWizard
        initial={{
          industry: '  SaaS / fintech  ',
          seniority: 'Founder / CEO',
          topics: ['Product', 'Fundraising'],
          tone: 'Direct & punchy',
          writingSample: '',
        }}
      />,
    );

    // Walk to the final step using the preset values.
    await user.click(screen.getByRole('button', { name: /Continue/i })); // 0 -> 1
    await user.click(screen.getByRole('button', { name: /Continue/i })); // 1 -> 2
    await user.click(screen.getByRole('button', { name: /Continue/i })); // 2 -> 3
    await user.click(screen.getByRole('button', { name: /Continue/i })); // 3 -> 4
    expect(headingFor()).toMatch(/writing sample/i);

    await user.type(screen.getByRole('textbox'), '  I ship fast.  ');
    await user.click(screen.getByRole('button', { name: /Build my voice profile/i }));

    const fetchMock = vi.mocked(fetch);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/post/voice-profile');
    expect((init as RequestInit).method).toBe('POST');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      industry: 'SaaS / fintech',
      seniority: 'Founder / CEO',
      topics: ['Product', 'Fundraising'],
      tone: 'Direct & punchy',
      writingSample: 'I ship fast.',
    });

    await vi.waitFor(() => expect(push).toHaveBeenCalledWith('/post/generate'));
  });

  it('does not route when the API returns ok:false (shows an error toast)', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ ok: false, error: 'bad' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const user = userEvent.setup();
    render(
      <OnboardingWizard
        initial={{
          industry: 'SaaS',
          seniority: 'Founder / CEO',
          topics: ['Product'],
          tone: 'Direct & punchy',
          writingSample: 'sample',
        }}
      />,
    );

    for (let i = 0; i < 4; i++) {
      await user.click(screen.getByRole('button', { name: /Continue/i }));
    }
    await user.click(screen.getByRole('button', { name: /Build my voice profile/i }));

    await vi.waitFor(() => expect(toast).toHaveBeenCalled());
    expect(push).not.toHaveBeenCalled();
  });

  it('does not route when the request fails with a non-OK HTTP status', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ error: 'boom' }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const user = userEvent.setup();
    render(
      <OnboardingWizard
        initial={{
          industry: 'SaaS',
          seniority: 'Founder / CEO',
          topics: ['Product'],
          tone: 'Direct & punchy',
          writingSample: 'sample',
        }}
      />,
    );

    for (let i = 0; i < 4; i++) {
      await user.click(screen.getByRole('button', { name: /Continue/i }));
    }
    await user.click(screen.getByRole('button', { name: /Build my voice profile/i }));

    await vi.waitFor(() => expect(toast).toHaveBeenCalled());
    expect(push).not.toHaveBeenCalled();
  });

  it('does not route on a network error and re-enables the button', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('offline'));
    const user = userEvent.setup();
    render(
      <OnboardingWizard
        initial={{
          industry: 'SaaS',
          seniority: 'Founder / CEO',
          topics: ['Product'],
          tone: 'Direct & punchy',
          writingSample: 'sample',
        }}
      />,
    );

    for (let i = 0; i < 4; i++) {
      await user.click(screen.getByRole('button', { name: /Continue/i }));
    }
    await user.click(screen.getByRole('button', { name: /Build my voice profile/i }));

    await vi.waitFor(() => expect(toast).toHaveBeenCalledWith(expect.stringMatching(/network/i)));
    expect(push).not.toHaveBeenCalled();
    // Button is re-enabled after the failure.
    expect(screen.getByRole('button', { name: /Build my voice profile/i })).not.toBeDisabled();
  });
});
