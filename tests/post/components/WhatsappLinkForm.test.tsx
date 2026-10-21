import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const toast = vi.fn();
vi.mock('@/components/ui/toast', () => ({ toast: (...a: unknown[]) => toast(...a) }));

import { WhatsappLinkForm } from '@/components/post/WhatsappLinkForm';

function mockFetch(status: number, body: unknown) {
  const fn = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', fn);
  return fn;
}

beforeEach(() => toast.mockReset());
afterEach(() => vi.unstubAllGlobals());

describe('<WhatsappLinkForm>', () => {
  it('requests a code and shows the LINK message + WhatsApp deep link', async () => {
    const fetchFn = mockFetch(200, { code: '123456', expiresAt: '2099-01-01T00:00:00Z', waLink: 'https://wa.me/91900?text=LINK%20123456' });
    render(<WhatsappLinkForm initial={null} />);
    await userEvent.click(screen.getByRole('button', { name: /get my link code/i }));
    expect(await screen.findByLabelText('Link code')).toHaveTextContent('LINK 123456');
    expect(screen.getByRole('link', { name: /open whatsapp/i })).toHaveAttribute('href', 'https://wa.me/91900?text=LINK%20123456');
    expect(fetchFn).toHaveBeenCalledWith('/api/post/whatsapp-number', expect.objectContaining({ method: 'POST', body: '{}' }));
  });

  it('shows the linked number and can unlink it', async () => {
    const fetchFn = mockFetch(200, { ok: true });
    render(<WhatsappLinkForm initial="+919812345678" />);
    expect(screen.getByText(/Linked: \+919812345678/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /unlink/i }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith('WhatsApp number removed'));
    expect(fetchFn).toHaveBeenCalledWith('/api/post/whatsapp-number', expect.objectContaining({ body: JSON.stringify({ unlink: true }) }));
    expect(screen.queryByText(/Linked:/)).not.toBeInTheDocument();
  });

  it('toasts server errors', async () => {
    mockFetch(429, { error: 'Too many codes requested. Try again soon.' });
    render(<WhatsappLinkForm initial={null} />);
    await userEvent.click(screen.getByRole('button', { name: /get my link code/i }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith('Too many codes requested. Try again soon.'));
  });
});
