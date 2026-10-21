import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AUDIT_DIMENSIONS } from '@/lib/modules/post/types';

// Component test (jsdom). AuditClient takes a LinkedIn URL + pasted profile text,
// POSTs /api/post/audit, then renders the Manch Score ring, 5 dimension bars, the
// top-3 fixes and a Share action that copies a shareable message to the clipboard.

const toast = vi.fn();
vi.mock('@/components/ui/toast', () => ({ toast: (...a: unknown[]) => toast(...a) }));

const capture = vi.fn();
vi.mock('posthog-js', () => ({ default: { capture: (...a: unknown[]) => capture(...a) } }));

import { AuditClient } from '@/components/post/AuditClient';

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

const AUDIT_RESULT = {
  auditId: 'a1',
  shareId: 'share-xyz',
  overall: 62,
  scores: { headline: 70, about: 55, experience: 80, frequency: 40, cta: 65 },
  fixes: [
    { dimension: 'Posting frequency', score: 40, action: 'Post twice a week.' },
    { dimension: 'About section', score: 55, action: 'Add a clear CTA.' },
    { dimension: 'CTA clarity', score: 65, action: 'Tell readers what to do.' },
  ],
};

beforeEach(() => {
  toast.mockReset();
  capture.mockReset();
  vi.unstubAllGlobals();
});

describe('<AuditClient>', () => {
  it('toasts and does NOT POST when no profile text is pasted', async () => {
    const fetchMock = mockFetch(() => jsonResponse(AUDIT_RESULT));
    const user = userEvent.setup();
    render(<AuditClient />);
    await user.click(screen.getByRole('button', { name: /run audit/i }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalled();
  });

  it('rejects a non-linkedin URL with a nudge and does not POST', async () => {
    const fetchMock = mockFetch(() => jsonResponse(AUDIT_RESULT));
    const user = userEvent.setup();
    render(<AuditClient />);
    await user.type(screen.getByLabelText(/profile url/i), 'https://example.com/me');
    await user.type(screen.getByLabelText(/paste your profile/i), 'Headline: builder');
    await user.click(screen.getByRole('button', { name: /run audit/i }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith(expect.stringMatching(/linkedin\.com\/in/i));
  });

  it('POSTs /api/post/audit with {linkedinUrl, profileText} and renders the score, bars and fixes', async () => {
    const fetchMock = mockFetch(() => jsonResponse(AUDIT_RESULT));
    const user = userEvent.setup();
    render(<AuditClient />);

    await user.type(screen.getByLabelText(/profile url/i), 'https://linkedin.com/in/me');
    await user.type(screen.getByLabelText(/paste your profile/i), 'Headline: Growth Lead');
    await user.click(screen.getByRole('button', { name: /run audit/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/post/audit');
    expect((init as RequestInit).method).toBe('POST');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      linkedinUrl: 'https://linkedin.com/in/me',
      profileText: 'Headline: Growth Lead',
    });

    // ScoreRing renders the overall score (62) with an accessible name.
    await screen.findByText('62');
    expect(screen.getByRole('img')).toHaveAttribute('aria-label', expect.stringMatching(/62 out of 100/));

    // All 5 dimension labels render (label text node + its hint).
    for (const dim of AUDIT_DIMENSIONS) {
      expect(
        screen.getByText((_content, el) =>
          el?.tagName === 'SPAN' && (el.textContent ?? '').includes(dim.label) && (el.textContent ?? '').includes(dim.hint),
        ),
      ).toBeInTheDocument();
    }
    // Per-dimension scores render as <b>score/100</b>.
    expect(screen.getByText('70/100')).toBeInTheDocument();
    expect(screen.getByText('40/100')).toBeInTheDocument();

    // Top-3 fixes render their actions.
    expect(screen.getByText('Post twice a week.')).toBeInTheDocument();
    expect(screen.getByText('Add a clear CTA.')).toBeInTheDocument();
    expect(screen.getByText('Tell readers what to do.')).toBeInTheDocument();
  });

  it('renders exactly five dimension bars with the right widths', async () => {
    mockFetch(() => jsonResponse(AUDIT_RESULT));
    const user = userEvent.setup();
    const { container } = render(<AuditClient />);
    await user.type(screen.getByLabelText(/paste your profile/i), 'Headline: builder');
    await user.click(screen.getByRole('button', { name: /run audit/i }));

    await screen.findByText('62');
    const bars = container.querySelectorAll('.audit-row .bar i');
    expect(bars.length).toBe(5);
    // First dimension is "headline" → 70%.
    expect((bars[0] as HTMLElement).style.width).toBe('70%');
  });

  it('works without a URL (URL is optional)', async () => {
    const fetchMock = mockFetch(() => jsonResponse(AUDIT_RESULT));
    const user = userEvent.setup();
    render(<AuditClient />);
    await user.type(screen.getByLabelText(/paste your profile/i), 'Headline: builder');
    await user.click(screen.getByRole('button', { name: /run audit/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)).toEqual({
      linkedinUrl: '',
      profileText: 'Headline: builder',
    });
    await screen.findByText('62');
  });

  it('toasts a rate-limit message on a 429', async () => {
    mockFetch(() => jsonResponse({ error: 'too many' }, 429));
    const user = userEvent.setup();
    render(<AuditClient />);
    await user.type(screen.getByLabelText(/paste your profile/i), 'Headline: builder');
    await user.click(screen.getByRole('button', { name: /run audit/i }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.stringMatching(/too many audits/i)));
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('toasts a generic failure with the server error on other non-ok statuses', async () => {
    mockFetch(() => jsonResponse({ error: 'bad input' }, 400));
    const user = userEvent.setup();
    render(<AuditClient />);
    await user.type(screen.getByLabelText(/paste your profile/i), 'Headline: builder');
    await user.click(screen.getByRole('button', { name: /run audit/i }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.stringMatching(/bad input/i)));
  });

  it('toasts a network error when fetch rejects', async () => {
    mockFetch(() => Promise.reject(new Error('offline')));
    const user = userEvent.setup();
    render(<AuditClient />);
    await user.type(screen.getByLabelText(/paste your profile/i), 'Headline: builder');
    await user.click(screen.getByRole('button', { name: /run audit/i }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.stringMatching(/network error/i)));
  });

  it('Share copies a shareable score message including the share link', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    mockFetch(() => jsonResponse(AUDIT_RESULT));
    const user = userEvent.setup();
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true, writable: true });
    render(<AuditClient />);
    await user.type(screen.getByLabelText(/paste your profile/i), 'Headline: builder');
    await user.click(screen.getByRole('button', { name: /run audit/i }));
    await screen.findByText('62');

    await user.click(screen.getByRole('button', { name: /share my manch score/i }));

    expect(writeText).toHaveBeenCalledTimes(1);
    const message = writeText.mock.calls[0][0] as string;
    expect(message).toMatch(/My Manch Score is 62\/100/);
    expect(message).toMatch(/\/score\/share-xyz/);
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.stringMatching(/copied/i)));
  });

  it('Share toasts a fallback when clipboard write rejects', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    mockFetch(() => jsonResponse(AUDIT_RESULT));
    const user = userEvent.setup();
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true, writable: true });
    render(<AuditClient />);
    await user.type(screen.getByLabelText(/paste your profile/i), 'Headline: builder');
    await user.click(screen.getByRole('button', { name: /run audit/i }));
    await screen.findByText('62');
    await user.click(screen.getByRole('button', { name: /share my manch score/i }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.stringMatching(/score\/share-xyz/)));
  });
});
