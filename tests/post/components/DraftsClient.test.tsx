import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DraftRow } from '@/lib/db/types';

// Component test (jsdom). DraftsClient renders the user's drafts as .variant
// cards (angle tag + truncated body + status), shows an empty state when there
// are none, optimistically deletes a row via DELETE /api/post/drafts/:id, and opens
// the <Editor> when Edit is clicked. We stub <Editor> so the test stays focused
// on the list behaviour (the Editor has its own test surface).

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
  usePathname: () => '/post/drafts',
  useSearchParams: () => new URLSearchParams(),
}));

const toast = vi.fn();
vi.mock('@/components/ui/toast', () => ({ toast: (...a: unknown[]) => toast(...a) }));

// Stub the Editor so opening it is observable without its internals.
vi.mock('@/components/post/Editor', () => ({
  Editor: (props: { draft: { id: string }; onClose: () => void }) => (
    <div data-testid="editor" data-draft-id={props.draft.id}>
      Editing {props.draft.id}
      <button onClick={props.onClose}>close-editor</button>
    </div>
  ),
}));

import { DraftsClient } from '@/components/post/DraftsClient';

function draft(overrides: Partial<DraftRow> = {}): DraftRow {
  return {
    id: 'd1',
    user_id: 'user-1',
    source: 'web',
    input_text: null,
    transcription_id: null,
    angle: 'story',
    body: 'A short draft body.',
    watermarked: false,
    ai_labelled: true,
    gen_request_id: 'g1',
    model: 'claude',
    status: 'draft',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function mockFetch(impl: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const fn = vi.fn(impl);
  vi.stubGlobal('fetch', fn);
  return fn;
}

beforeEach(() => {
  push.mockReset();
  toast.mockReset();
  vi.unstubAllGlobals();
});

describe('<DraftsClient>', () => {
  it('renders the empty state when there are no drafts', () => {
    render(<DraftsClient drafts={[]} plan="free" />);
    expect(screen.getByText(/no drafts yet/i)).toBeInTheDocument();
  });

  it('renders each draft with its angle label and status', () => {
    render(
      <DraftsClient
        drafts={[
          draft({ id: 'd1', angle: 'story', status: 'draft' }),
          draft({ id: 'd2', angle: 'insight', status: 'scheduled' }),
          draft({ id: 'd3', angle: 'opinion', status: 'published' }),
        ]}
        plan="plus"
      />,
    );
    expect(screen.getByText('Story')).toBeInTheDocument();
    expect(screen.getByText('Insight')).toBeInTheDocument();
    expect(screen.getByText('Opinion')).toBeInTheDocument();
    expect(screen.getByText('Draft')).toBeInTheDocument();
    expect(screen.getByText('Scheduled')).toBeInTheDocument();
    expect(screen.getByText('Published')).toBeInTheDocument();
  });

  it('truncates a long body with an ellipsis (clip at 180)', () => {
    const long = 'x'.repeat(300);
    const { container } = render(<DraftsClient drafts={[draft({ body: long })]} plan="free" />);
    const postBody = container.querySelector('.post-body') as HTMLElement;
    expect(postBody.textContent).toContain('…');
    // Body shown is the clipped slice, much shorter than the original.
    expect(postBody.textContent!.length).toBeLessThan(long.length);
  });

  it('Delete calls DELETE /api/post/drafts/:id and optimistically removes the row', async () => {
    const fetchMock = mockFetch(() => new Response(null, { status: 200 }));
    const user = userEvent.setup();
    render(
      <DraftsClient
        drafts={[draft({ id: 'd1', body: 'Keep me' }), draft({ id: 'd2', body: 'Delete me' })]}
        plan="free"
      />,
    );

    // Find the card for d2 and click its Delete button.
    const deleteCard = screen.getByText('Delete me').closest('.variant') as HTMLElement;
    await user.click(within(deleteCard).getByRole('button', { name: /delete/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/post/drafts/d2');
    expect((init as RequestInit).method).toBe('DELETE');

    // Row is gone, the other remains.
    await waitFor(() => expect(screen.queryByText('Delete me')).toBeNull());
    expect(screen.getByText('Keep me')).toBeInTheDocument();
    expect(toast).toHaveBeenCalledWith(expect.stringMatching(/deleted/i));
  });

  it('restores the row and toasts when delete fails', async () => {
    mockFetch(() => new Response(null, { status: 500 }));
    const user = userEvent.setup();
    render(<DraftsClient drafts={[draft({ id: 'd1', body: 'Oops body' })]} plan="free" />);

    await user.click(screen.getByRole('button', { name: /delete/i }));

    // Row comes back after the failed delete.
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.stringMatching(/could not delete/i)));
    expect(screen.getByText('Oops body')).toBeInTheDocument();
  });

  it('Edit opens the Editor for that draft', async () => {
    const user = userEvent.setup();
    render(<DraftsClient drafts={[draft({ id: 'd7', body: 'Edit this' })]} plan="pro" />);
    expect(screen.queryByTestId('editor')).toBeNull();

    await user.click(screen.getByRole('button', { name: /edit/i }));

    const editor = await screen.findByTestId('editor');
    expect(editor).toHaveAttribute('data-draft-id', 'd7');
  });

  it('closing the Editor hides it again', async () => {
    const user = userEvent.setup();
    render(<DraftsClient drafts={[draft({ id: 'd7' })]} plan="pro" />);
    await user.click(screen.getByRole('button', { name: /edit/i }));
    await screen.findByTestId('editor');
    await user.click(screen.getByRole('button', { name: /close-editor/i }));
    await waitFor(() => expect(screen.queryByTestId('editor')).toBeNull());
  });
});
