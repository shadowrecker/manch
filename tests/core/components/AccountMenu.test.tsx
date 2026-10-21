import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { AccountMenu } from '@/components/AccountMenu';

const account = { name: 'Asha Kumar', email: 'asha@example.com', plan: 'plus' as const };

describe('<AccountMenu>', () => {
  it('shows initials and is closed by default', () => {
    render(<AccountMenu account={account} />);
    const btn = screen.getByRole('button', { name: /account menu/i });
    expect(btn).toHaveTextContent('AK');
    expect(btn).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('opens with who you are, account links and a POST sign-out', async () => {
    render(<AccountMenu account={account} />);
    await userEvent.click(screen.getByRole('button', { name: /account menu/i }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getByText('Asha Kumar')).toBeInTheDocument();
    expect(screen.getByText('asha@example.com')).toBeInTheDocument();
    expect(screen.getByText('Plus plan')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Profile' })).toHaveAttribute('href', '/settings/profile');
    expect(screen.getByRole('menuitem', { name: 'Plans & Billing' })).toHaveAttribute('href', '/settings/billing');
    expect(screen.getByRole('menuitem', { name: 'Team' })).toHaveAttribute('href', '/settings/team');
    const signOut = screen.getByRole('menuitem', { name: 'Sign out' });
    const form = signOut.closest('form')!;
    expect(form).toHaveAttribute('action', '/auth/signout');
    expect(form).toHaveAttribute('method', 'post');
  });

  it('closes on Escape and on outside click', async () => {
    render(
      <div>
        <p>outside</p>
        <AccountMenu account={account} />
      </div>,
    );
    const btn = screen.getByRole('button', { name: /account menu/i });
    await userEvent.click(btn);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    await userEvent.click(btn);
    await userEvent.click(screen.getByText('outside'));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('falls back to the email when there is no name', async () => {
    render(<AccountMenu account={{ name: null, email: 'ravi.s@example.com', plan: 'free' }} />);
    expect(screen.getByRole('button', { name: /account menu/i })).toHaveTextContent('R');
    await userEvent.click(screen.getByRole('button', { name: /account menu/i }));
    expect(screen.getByText('ravi.s@example.com')).toBeInTheDocument();
    expect(screen.getByText('Free plan')).toBeInTheDocument();
  });
});
