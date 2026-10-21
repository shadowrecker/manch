import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DraftRow } from '@/lib/db/types';

// Component test (jsdom) for the post Editor + live LinkedIn preview.
// Covers: live char count, textarea -> preview mirroring, clipboard Copy,
// plan-gated Schedule (Paywall) + /api/post/schedule POST when allowed, plan-gated
// Make-thread, and Save -> PATCH /api/post/drafts/[id]. Read components/Editor.tsx
// for the exact props, handlers, gates and request shapes.

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
  usePathname: () => '/post/drafts',
  useSearchParams: () => new URLSearchParams(),
}));

const toast = vi.fn();
vi.mock('@/components/ui/toast', () => ({ toast: (...a: unknown[]) => toast(...a) }));

// posthog-js is a default export; capture() must be a no-throw stub.
const capture = vi.fn();
vi.mock('posthog-js', () => ({ default: { capture: (...a: unknown[]) => capture(...a) } }));

import { Editor } from '@/components/post/Editor';

function makeDraft(overrides: Partial<DraftRow> = {}): DraftRow {
  return {
    id: 'draft-1',
    user_id: 'user-1',
    source: 'web',
    input_text: 'raw',
    transcription_id: null,
    angle: 'story',
    body: 'Hello world',
    watermarked: false,
    ai_labelled: false,
    gen_request_id: 'g1',
    model: 'claude',
    status: 'draft',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function renderEditor(props: Partial<Parameters<typeof Editor>[0]> = {}) {
  const onClose = vi.fn();
  const onSaved = vi.fn();
  const utils = render(
    <Editor
      draft={props.draft ?? makeDraft()}
      plan={props.plan ?? 'free'}
      authorName={'authorName' in props ? (props.authorName ?? null) : 'Ada Lovelace'}
      headline={'headline' in props ? (props.headline ?? null) : 'Builder'}
      onClose={props.onClose ?? onClose}
      onSaved={props.onSaved ?? onSaved}
    />,
  );
  return { ...utils, onClose: props.onClose ?? onClose, onSaved: props.onSaved ?? onSaved };
}

function okResponse(status = 200, bodyObj: unknown = {}) {
  return new Response(JSON.stringify(bodyObj), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  push.mockReset();
  toast.mockReset();
  capture.mockReset();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse()));
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockResolvedValue(undefined) }, configurable: true, writable: true });
});

describe('<Editor> character count + preview mirroring', () => {
  it('shows a live character count that updates with input', async () => {
    const user = userEvent.setup();
    renderEditor({ draft: makeDraft({ body: 'abc' }) });

    expect(screen.getByText('3 characters')).toBeInTheDocument();

    const textarea = screen.getByLabelText('Edit your post');
    await user.type(textarea, 'de'); // -> "abcde"
    expect(screen.getByText('5 characters')).toBeInTheDocument();
  });

  it('mirrors the textarea into the LinkedIn preview', async () => {
    const user = userEvent.setup();
    const { container } = renderEditor({ draft: makeDraft({ body: 'Start' }) });

    const preview = container.querySelector('.li-body') as HTMLElement;
    expect(preview).toHaveTextContent('Start');

    const textarea = screen.getByLabelText('Edit your post');
    await user.clear(textarea);
    await user.type(textarea, 'Updated copy');
    expect(preview).toHaveTextContent('Updated copy');
  });

  it('renders the author name and headline in the preview header', () => {
    const { container } = renderEditor({ authorName: 'Grace Hopper', headline: 'Admiral' });
    const head = container.querySelector('.li-head') as HTMLElement;
    expect(within(head).getByText('Grace Hopper')).toBeInTheDocument();
    expect(head.textContent).toMatch(/Admiral/);
  });

  it('falls back to "You" / "Your headline" when author/headline are null', () => {
    const { container } = renderEditor({ authorName: null, headline: null });
    const head = container.querySelector('.li-head') as HTMLElement;
    expect(within(head).getByText('You')).toBeInTheDocument();
    expect(head.textContent).toMatch(/Your headline/);
  });

  it('shows the watermark notice for the free plan and "removed" for paid', () => {
    const { rerender } = renderEditor({ plan: 'free' });
    expect(screen.getByText(/watermark applied/i)).toBeInTheDocument();

    rerender(
      <Editor
        draft={makeDraft()}
        plan="plus"
        authorName="Ada"
        headline="Builder"
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );
    expect(screen.getByText(/Watermark removed/i)).toBeInTheDocument();
  });
});

describe('<Editor> Copy', () => {
  it('writes the current body to the clipboard and toasts', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true, writable: true });
    renderEditor({ draft: makeDraft({ body: 'Copy me' }) });

    await user.click(screen.getByRole('button', { name: /^copy$/i }));
    expect(writeText).toHaveBeenCalledWith('Copy me');
    expect(toast).toHaveBeenCalledWith(expect.stringMatching(/copied/i));
  });

  it('copies edited text, not the original body', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true, writable: true });
    renderEditor({ draft: makeDraft({ body: 'orig' }) });

    const textarea = screen.getByLabelText('Edit your post');
    await user.type(textarea, '!');
    await user.click(screen.getByRole('button', { name: /^copy$/i }));
    expect(writeText).toHaveBeenCalledWith('orig!');
  });

  it('toasts a failure when clipboard.writeText rejects', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    const user = userEvent.setup();
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true, writable: true });
    renderEditor();

    await user.click(screen.getByRole('button', { name: /^copy$/i }));
    expect(toast).toHaveBeenCalledWith(expect.stringMatching(/fail/i));
  });
});

describe('<Editor> Save', () => {
  it('PATCHes /api/post/drafts/[id] with the body, notifies onSaved, captures analytics and toasts', async () => {
    const user = userEvent.setup();
    const { onSaved } = renderEditor({ draft: makeDraft({ id: 'd-42', body: 'before' }) });

    const textarea = screen.getByLabelText('Edit your post');
    await user.type(textarea, ' after');
    await user.click(screen.getByRole('button', { name: /save/i }));

    const fetchMock = vi.mocked(fetch);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/post/drafts/d-42');
    expect((init as RequestInit).method).toBe('PATCH');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ body: 'before after' });

    await vi.waitFor(() =>
      expect(onSaved).toHaveBeenCalledWith({ id: 'd-42', body: 'before after' }),
    );
    expect(capture).toHaveBeenCalledWith('draft_edited', { draftId: 'd-42' });
    expect(toast).toHaveBeenCalledWith(expect.stringMatching(/saved/i));
  });

  it('toasts an error and does not call onSaved when the PATCH fails', async () => {
    vi.mocked(fetch).mockResolvedValue(okResponse(500));
    const user = userEvent.setup();
    const { onSaved } = renderEditor();

    await user.click(screen.getByRole('button', { name: /save/i }));

    await vi.waitFor(() => expect(toast).toHaveBeenCalledWith(expect.stringMatching(/could not save/i)));
    expect(onSaved).not.toHaveBeenCalled();
  });
});

describe('<Editor> Schedule gating', () => {
  it('free plan: clicking Schedule opens the Paywall and does NOT POST', async () => {
    const user = userEvent.setup();
    renderEditor({ plan: 'free' });

    await user.click(screen.getByRole('button', { name: /Schedule to LinkedIn/i }));

    // Paywall modal shows the upgrade title; no network call happened.
    expect(screen.getByText(/Upgrade to schedule posts/i)).toBeInTheDocument();
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it('paid plan: Schedule PATCHes the draft then POSTs /api/post/schedule and notifies onSaved', async () => {
    const user = userEvent.setup();
    const { onSaved, onClose } = renderEditor({ plan: 'plus', draft: makeDraft({ id: 'd-9', body: 'sched body' }) });

    await user.click(screen.getByRole('button', { name: /Schedule to LinkedIn/i }));

    const fetchMock = vi.mocked(fetch);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    // First call: persist current body via PATCH.
    const [patchUrl, patchInit] = fetchMock.mock.calls[0];
    expect(patchUrl).toBe('/api/post/drafts/d-9');
    expect((patchInit as RequestInit).method).toBe('PATCH');

    // Second call: schedule with the draft id.
    const [schedUrl, schedInit] = fetchMock.mock.calls[1];
    expect(schedUrl).toBe('/api/post/schedule');
    expect((schedInit as RequestInit).method).toBe('POST');
    expect(JSON.parse((schedInit as RequestInit).body as string)).toEqual({ draftId: 'd-9' });

    await vi.waitFor(() =>
      expect(onSaved).toHaveBeenCalledWith({ id: 'd-9', body: 'sched body', status: 'scheduled' }),
    );
    expect(toast).toHaveBeenCalledWith(expect.stringMatching(/scheduled/i));
    expect(onClose).toHaveBeenCalled();
  });

  it('paid plan: a 402 from /api/post/schedule opens the Paywall instead of saving', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (typeof url === 'string' && url === '/api/post/schedule') return okResponse(402, { code: 'quota' });
      return okResponse();
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    const { onSaved } = renderEditor({ plan: 'pro' });

    await user.click(screen.getByRole('button', { name: /Schedule to LinkedIn/i }));

    await vi.waitFor(() => expect(screen.getByText(/Upgrade to schedule posts/i)).toBeInTheDocument());
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('paid plan: a non-OK schedule response toasts an error and does not notify onSaved', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (typeof url === 'string' && url === '/api/post/schedule') return okResponse(500);
      return okResponse();
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    const { onSaved } = renderEditor({ plan: 'team' });

    await user.click(screen.getByRole('button', { name: /Schedule to LinkedIn/i }));

    await vi.waitFor(() => expect(toast).toHaveBeenCalledWith(expect.stringMatching(/could not schedule/i)));
    expect(onSaved).not.toHaveBeenCalled();
  });
});

describe('<Editor> Make thread gating', () => {
  it('free plan: Make thread opens the Pro Paywall and leaves the body unchanged', async () => {
    const user = userEvent.setup();
    renderEditor({ plan: 'free', draft: makeDraft({ body: 'one\n\ntwo' }) });

    await user.click(screen.getByRole('button', { name: /Make thread/i }));

    expect(screen.getByText(/Upgrade to Pro for threads/i)).toBeInTheDocument();
    // Body untouched: no numbered prefix.
    const textarea = screen.getByLabelText('Edit your post') as HTMLTextAreaElement;
    expect(textarea.value).toBe('one\n\ntwo');
  });

  it('plus plan (solo tier) cannot thread either (thread is Pro+)', async () => {
    const user = userEvent.setup();
    renderEditor({ plan: 'plus', draft: makeDraft({ body: 'a\n\nb' }) });

    await user.click(screen.getByRole('button', { name: /Make thread/i }));
    expect(screen.getByText(/Upgrade to Pro for threads/i)).toBeInTheDocument();
  });

  it('pro plan: Make thread reformats the body into numbered parts', async () => {
    const user = userEvent.setup();
    renderEditor({ plan: 'pro', draft: makeDraft({ body: 'first para\n\nsecond para' }) });

    await user.click(screen.getByRole('button', { name: /Make thread/i }));

    const textarea = screen.getByLabelText('Edit your post') as HTMLTextAreaElement;
    expect(textarea.value).toBe('(1/2) first para\n\n(2/2) second para');
    expect(toast).toHaveBeenCalledWith(expect.stringMatching(/thread/i));
    // No paywall opened.
    expect(screen.queryByText(/Upgrade to Pro for threads/i)).toBeNull();
  });
});

describe('<Editor> close', () => {
  it('Close button calls onClose', async () => {
    const user = userEvent.setup();
    const { onClose } = renderEditor();
    await user.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it('Escape key calls onClose', async () => {
    const user = userEvent.setup();
    const { onClose } = renderEditor();
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });
});
