import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Component test (jsdom). GenerateClient is the Voice-to-Post engine:
//  - typing updates the textarea + the live "Detected:" hint,
//  - Generate POSTs /api/post/generate with {inputText} and renders 3 VariantCards,
//  - a 402 quota_exceeded response opens the Paywall,
//  - the example chips fill the textarea,
//  - the record button degrades gracefully without MediaRecorder/getUserMedia.

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
  usePathname: () => '/post/generate',
  useSearchParams: () => new URLSearchParams(),
}));

const toast = vi.fn();
vi.mock('@/components/ui/toast', () => ({ toast: (...a: unknown[]) => toast(...a) }));

import { GenerateClient } from '@/components/post/GenerateClient';

function mockFetch(impl: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const fn = vi.fn(impl);
  vi.stubGlobal('fetch', fn);
  return fn;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const OK_RESULT = {
  genRequestId: 'g1',
  detectedLang: 'english',
  model: 'claude',
  posts: [
    { angle: 'story', body: 'Story body here.' },
    { angle: 'insight', body: 'Insight body here.' },
    { angle: 'opinion', body: 'Opinion body here.' },
  ],
};

beforeEach(() => {
  push.mockReset();
  toast.mockReset();
  vi.unstubAllGlobals();
});

describe('<GenerateClient>', () => {
  it('typing updates the textarea and shows a Detected language hint', async () => {
    const user = userEvent.setup();
    render(<GenerateClient plan="free" used={0} hindiOutput={false} />);
    const textarea = screen.getByLabelText(/what happened this week/i);
    await user.type(textarea, 'Closed a deal');
    expect(textarea).toHaveValue('Closed a deal');
    // English input → "output in professional English"
    expect(screen.getByText(/Detected: English/i)).toBeInTheDocument();
    expect(screen.getByText(/professional English/i)).toBeInTheDocument();
  });

  it('reflects Hindi output mode in the hint', async () => {
    const user = userEvent.setup();
    render(<GenerateClient plan="plus" used={0} hindiOutput={true} />);
    const textarea = screen.getByLabelText(/what happened this week/i);
    await user.type(textarea, 'Closed a deal');
    expect(screen.getByText(/output in Hindi/i)).toBeInTheDocument();
  });

  it('clicking an example chip fills the textarea', async () => {
    const user = userEvent.setup();
    render(<GenerateClient plan="free" used={0} hindiOutput={false} />);
    // The first example chip.
    await user.click(screen.getByRole('button', { name: /first enterprise client/i }));
    const textarea = screen.getByLabelText(/what happened this week/i) as HTMLTextAreaElement;
    expect(textarea.value).toMatch(/Closed our first enterprise client/);
  });

  it('toasts and does NOT POST when the input is empty', async () => {
    const fetchMock = mockFetch(() => jsonResponse(OK_RESULT));
    const user = userEvent.setup();
    render(<GenerateClient plan="free" used={0} hindiOutput={false} />);
    await user.click(screen.getByRole('button', { name: /generate 3 posts/i }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalled();
  });

  it('Generate POSTs /api/post/generate with {inputText} and renders the 3 VariantCards', async () => {
    const fetchMock = mockFetch(() => jsonResponse(OK_RESULT));
    const user = userEvent.setup();
    render(<GenerateClient plan="free" used={0} hindiOutput={false} />);

    const textarea = screen.getByLabelText(/what happened this week/i);
    await user.type(textarea, 'We shipped a big feature');
    await user.click(screen.getByRole('button', { name: /generate 3 posts/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/post/generate');
    expect((init as RequestInit).method).toBe('POST');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      inputText: 'We shipped a big feature',
    });

    // Three angle cards render.
    await screen.findByText('Story body here.');
    expect(screen.getByText('Insight body here.')).toBeInTheDocument();
    expect(screen.getByText('Opinion body here.')).toBeInTheDocument();
    // Section heading.
    expect(screen.getByRole('heading', { name: /your 3 angles/i })).toBeInTheDocument();
  });

  it('a 402 quota_exceeded response opens the Paywall', async () => {
    mockFetch(() => jsonResponse({ error: 'over limit', code: 'quota_exceeded' }, 402));
    const user = userEvent.setup();
    render(<GenerateClient plan="free" used={4} hindiOutput={false} />);
    await user.type(screen.getByLabelText(/what happened this week/i), 'over the cap now');
    await user.click(screen.getByRole('button', { name: /generate 3 posts/i }));

    // Paywall modal renders its upgrade tiers.
    await screen.findByRole('heading', { name: /upgrade for more posts/i });
    expect(screen.getByRole('button', { name: /maybe later/i })).toBeInTheDocument();
    // No variant cards rendered.
    expect(screen.queryByRole('heading', { name: /your 3 angles/i })).toBeNull();
  });

  it('a 402 that is NOT quota_exceeded toasts and does not open the paywall', async () => {
    mockFetch(() => jsonResponse({ error: 'payment required', code: 'other' }, 402));
    const user = userEvent.setup();
    render(<GenerateClient plan="free" used={0} hindiOutput={false} />);
    await user.type(screen.getByLabelText(/what happened this week/i), 'hello there');
    await user.click(screen.getByRole('button', { name: /generate 3 posts/i }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith('payment required'));
    expect(screen.queryByRole('button', { name: /maybe later/i })).toBeNull();
  });

  it('a 409 no_voice_profile toasts a setup nudge', async () => {
    mockFetch(() => jsonResponse({ error: 'no profile', code: 'no_voice_profile' }, 409));
    const user = userEvent.setup();
    render(<GenerateClient plan="free" used={0} hindiOutput={false} />);
    await user.type(screen.getByLabelText(/what happened this week/i), 'tell me');
    await user.click(screen.getByRole('button', { name: /generate 3 posts/i }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.stringMatching(/voice profile/i)));
  });

  it('toasts on a generic non-ok response', async () => {
    mockFetch(() => jsonResponse({ error: 'boom' }, 500));
    const user = userEvent.setup();
    render(<GenerateClient plan="free" used={0} hindiOutput={false} />);
    await user.type(screen.getByLabelText(/what happened this week/i), 'tell me');
    await user.click(screen.getByRole('button', { name: /generate 3 posts/i }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith('boom'));
  });

  it('toasts a network error when fetch rejects', async () => {
    mockFetch(() => Promise.reject(new Error('offline')));
    const user = userEvent.setup();
    render(<GenerateClient plan="free" used={0} hindiOutput={false} />);
    await user.type(screen.getByLabelText(/what happened this week/i), 'tell me');
    await user.click(screen.getByRole('button', { name: /generate 3 posts/i }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.stringMatching(/network error/i)));
  });

  it('record button degrades gracefully when getUserMedia is unavailable', async () => {
    // No mediaDevices / no MediaRecorder in jsdom by default.
    const fetchMock = mockFetch(() => jsonResponse(OK_RESULT));
    const orig = (navigator as unknown as { mediaDevices?: unknown }).mediaDevices;
    Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true });
    const user = userEvent.setup();
    render(<GenerateClient plan="free" used={0} hindiOutput={false} />);
    await user.click(screen.getByRole('button', { name: /record voice note/i }));
    expect(toast).toHaveBeenCalledWith(expect.stringMatching(/not supported/i));
    // Did not attempt to transcribe.
    expect(fetchMock).not.toHaveBeenCalled();
    Object.defineProperty(navigator, 'mediaDevices', { value: orig, configurable: true });
  });

  it('record button degrades gracefully when MediaRecorder is unavailable but getUserMedia exists', async () => {
    const fetchMock = mockFetch(() => jsonResponse(OK_RESULT));
    const getUserMedia = vi.fn();
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia },
      configurable: true,
    });
    // Ensure MediaRecorder is undefined.
    const hadRecorder = 'MediaRecorder' in globalThis;
    delete (globalThis as Record<string, unknown>).MediaRecorder;

    const user = userEvent.setup();
    render(<GenerateClient plan="free" used={0} hindiOutput={false} />);
    await user.click(screen.getByRole('button', { name: /record voice note/i }));

    expect(toast).toHaveBeenCalledWith(expect.stringMatching(/not supported/i));
    // It bailed before requesting the mic.
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();

    Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true });
    if (hadRecorder) {
      /* leave as-is for other tests; jsdom had none originally */
    }
  });

  it('shows the voice-profile badge with a link to onboarding', () => {
    render(<GenerateClient plan="free" used={0} hindiOutput={false} />);
    const link = screen.getByRole('link', { name: /edit voice profile/i });
    expect(link).toHaveAttribute('href', '/post/onboarding');
  });

  it('updates the in-app draft count and toasts on success', async () => {
    mockFetch(() => jsonResponse(OK_RESULT));
    const user = userEvent.setup();
    render(<GenerateClient plan="free" used={1} hindiOutput={false} />);
    await user.type(screen.getByLabelText(/what happened this week/i), 'win of the week');
    await user.click(screen.getByRole('button', { name: /generate 3 posts/i }));
    // free limit = 4; count goes 1 -> 2.
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.stringMatching(/2\/4 this month/)),
    );
  });

  it('renders exactly three variant cards in the grid', async () => {
    mockFetch(() => jsonResponse(OK_RESULT));
    const user = userEvent.setup();
    const { container } = render(<GenerateClient plan="pro" used={0} hindiOutput={false} />);
    await user.type(screen.getByLabelText(/what happened this week/i), 'a great week');
    await user.click(screen.getByRole('button', { name: /generate 3 posts/i }));
    await screen.findByText('Story body here.');
    const grid = container.querySelector('.grid3') as HTMLElement;
    expect(within(grid).getAllByText(/body here\./).length).toBe(3);
  });
});
