import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('next/navigation', () => ({
  usePathname: () => '/reels/studio',
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import { Paywall } from '@/components/Paywall';
import { ContentPackLink } from '@/components/reels/ContentPackLink';
import { LanguagePicker } from '@/components/reels/LanguagePicker';
import { ScriptCard } from '@/components/reels/ScriptCard';

// The Reels paywall = the core <Paywall> + the ₹49 content pack in its `extra` slot.
describe('<Paywall> with the Reels content pack', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<Paywall open={false} onClose={vi.fn()} extra={<ContentPackLink />} />);
    expect(container).toBeEmptyDOMElement();
  });
  it('offers the ₹49 pack + the paid Manch plans when open', () => {
    render(<Paywall open message="msg" onClose={vi.fn()} extra={<ContentPackLink />} />);
    expect(screen.getByText(/10 credits/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /₹49 content pack/ })).toHaveAttribute('href', '/settings/billing');
    expect(screen.getByText('Plus')).toBeInTheDocument();
    expect(screen.getByText('Pro')).toBeInTheDocument();
  });
  it('calls onClose on "Maybe later"', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<Paywall open onClose={onClose} extra={<ContentPackLink />} />);
    await user.click(screen.getByRole('button', { name: /maybe later/i }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe('<LanguagePicker>', () => {
  it('renders all 8 languages and reports selection', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<LanguagePicker value="hi" onChange={onChange} />);
    expect(screen.getByText('Tamil')).toBeInTheDocument();
    expect(screen.getByText('Gujarati')).toBeInTheDocument();
    await user.click(screen.getByText('Tamil'));
    expect(onChange).toHaveBeenCalledWith('ta');
  });
});

describe('<ScriptCard>', () => {
  const script = { hook: 'हुक', body: 'बॉडी', cta: 'फॉलो' };
  it('renders hook/body/cta + the style tag and watermark on free', () => {
    render(<ScriptCard style="educational" script={script} watermark />);
    expect(screen.getByText('हुक')).toBeInTheDocument();
    expect(screen.getByText('फॉलो')).toBeInTheDocument();
    expect(screen.getByText('Educational')).toBeInTheDocument();
    expect(screen.getByText('Made with Manch')).toBeInTheDocument();
  });
  it('Copy writes the full script to the clipboard', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true, writable: true });
    render(<ScriptCard style="emotional" script={script} watermark={false} />);
    await user.click(screen.getByRole('button', { name: /copy/i }));
    expect(writeText).toHaveBeenCalledWith('हुक\n\nबॉडी\n\nफॉलो');
  });
  it('shows Make caption only when onCaption is provided', async () => {
    const onCaption = vi.fn();
    const user = userEvent.setup();
    render(<ScriptCard style="educational" script={script} watermark={false} onCaption={onCaption} />);
    await user.click(screen.getByRole('button', { name: /make caption/i }));
    expect(onCaption).toHaveBeenCalled();
  });
});
