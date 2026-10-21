import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const push = vi.fn();
const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }) }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
const toast = vi.fn();
vi.mock('@/components/ui/toast', () => ({ toast: (m: string) => toast(m) }));

const auth = {
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  resend: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  updateUser: vi.fn(),
  getUser: vi.fn(),
  signInWithOAuth: vi.fn(),
};
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ auth }) }));

import LoginPage from '@/app/login/page';
import SignupPage from '@/app/signup/page';
import ForgotPasswordPage from '@/app/forgot-password/page';
import ResetPasswordPage from '@/app/reset-password/page';

beforeEach(() => {
  for (const fn of Object.values(auth)) fn.mockReset();
  push.mockReset();
  window.history.replaceState(null, '', '/login');
});

async function fill(label: RegExp, value: string) {
  await userEvent.type(screen.getByLabelText(label), value);
}

describe('Login (email + password)', () => {
  it('logs in with email + password and goes to /home — no magic link, no Google by default', async () => {
    auth.signInWithPassword.mockResolvedValue({ error: null });
    render(<LoginPage />);
    expect(screen.queryByText(/magic link/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /google/i })).not.toBeInTheDocument();
    await fill(/^email$/i, ' asha@example.com ');
    await fill(/^password$/i, 'manch2026');
    await userEvent.click(screen.getByRole('button', { name: /log in/i }));
    expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: 'asha@example.com', password: 'manch2026' });
    await waitFor(() => expect(push).toHaveBeenCalledWith('/home'));
  });

  it('honours a safe ?next= and ignores an unsafe one', async () => {
    auth.signInWithPassword.mockResolvedValue({ error: null });
    window.history.replaceState(null, '', '/login?next=/deals/matches');
    const { unmount } = render(<LoginPage />);
    await fill(/^email$/i, 'a@b.co');
    await fill(/^password$/i, 'manch2026');
    await userEvent.click(screen.getByRole('button', { name: /log in/i }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/deals/matches'));
    unmount();
    push.mockReset();
    window.history.replaceState(null, '', '/login?next=//evil.com');
    render(<LoginPage />);
    await fill(/^email$/i, 'a@b.co');
    await fill(/^password$/i, 'manch2026');
    await userEvent.click(screen.getByRole('button', { name: /log in/i }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/home'));
  });

  it('shows a friendly error for wrong credentials', async () => {
    auth.signInWithPassword.mockResolvedValue({ error: { message: 'Invalid login credentials' } });
    render(<LoginPage />);
    await fill(/^email$/i, 'a@b.co');
    await fill(/^password$/i, 'wrong1234');
    await userEvent.click(screen.getByRole('button', { name: /log in/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect email or password.');
    expect(push).not.toHaveBeenCalled();
  });

  it('offers to resend verification for an unconfirmed email', async () => {
    auth.signInWithPassword.mockResolvedValue({ error: { message: 'Email not confirmed' } });
    auth.resend.mockResolvedValue({ error: null });
    render(<LoginPage />);
    await fill(/^email$/i, 'new@b.co');
    await fill(/^password$/i, 'manch2026');
    await userEvent.click(screen.getByRole('button', { name: /log in/i }));
    await userEvent.click(await screen.findByRole('button', { name: /resend verification/i }));
    expect(auth.resend).toHaveBeenCalledWith(expect.objectContaining({ type: 'signup', email: 'new@b.co' }));
  });

  it('links to sign-up and forgot password', () => {
    render(<LoginPage />);
    expect(screen.getByRole('link', { name: /create an account/i })).toHaveAttribute('href', '/signup');
    expect(screen.getByRole('link', { name: /forgot password/i })).toHaveAttribute('href', '/forgot-password');
  });
});

describe('Sign up', () => {
  async function submit(password = 'manch2026', confirm = password) {
    await fill(/full name/i, 'Asha Kumar');
    await fill(/^email$/i, 'asha@example.com');
    await fill(/^password$/i, password);
    await fill(/confirm password/i, confirm);
    await userEvent.click(screen.getByRole('button', { name: /create account/i }));
  }

  it('blocks weak or mismatched passwords before calling Supabase', async () => {
    render(<SignupPage />);
    await submit('manch2026', 'manch2027');
    expect(await screen.findByRole('alert')).toHaveTextContent(/match/);
    expect(auth.signUp).not.toHaveBeenCalled();
  });

  it('signs up with a verification link back to /auth/callback and asks the user to check email', async () => {
    auth.signUp.mockResolvedValue({ data: { session: null, user: { id: 'u' } }, error: null });
    render(<SignupPage />);
    await submit();
    expect(auth.signUp).toHaveBeenCalledWith({
      email: 'asha@example.com',
      password: 'manch2026',
      options: { emailRedirectTo: 'http://localhost:3000/auth/callback?next=/home', data: { full_name: 'Asha Kumar' } },
    });
    expect(await screen.findByRole('heading', { name: /check your email/i })).toBeInTheDocument();
  });

  it('goes straight to /home when email confirmation is off', async () => {
    auth.signUp.mockResolvedValue({ data: { session: { access_token: 'x' } }, error: null });
    render(<SignupPage />);
    await submit();
    await waitFor(() => expect(push).toHaveBeenCalledWith('/home'));
  });

  it('shows Supabase errors', async () => {
    auth.signUp.mockResolvedValue({ data: {}, error: { message: 'Password is known to be weak' } });
    render(<SignupPage />);
    await submit();
    expect(await screen.findByRole('alert')).toHaveTextContent('Password is known to be weak');
  });
});

describe('Forgot / reset password', () => {
  it('sends a reset link to /reset-password and never reveals whether the email exists', async () => {
    auth.resetPasswordForEmail.mockResolvedValue({ error: { message: 'User not found' } });
    render(<ForgotPasswordPage />);
    await fill(/^email$/i, 'ghost@example.com');
    await userEvent.click(screen.getByRole('button', { name: /send reset link/i }));
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith('ghost@example.com', {
      redirectTo: 'http://localhost:3000/auth/callback?next=/reset-password',
    });
    expect(await screen.findByText(/If an account exists/)).toBeInTheDocument();
  });

  it('reset page: expired link without a session', async () => {
    auth.getUser.mockResolvedValue({ data: { user: null } });
    render(<ResetPasswordPage />);
    expect(await screen.findByText(/invalid or has expired/)).toBeInTheDocument();
  });

  it('reset page: saves the new password then goes home', async () => {
    auth.getUser.mockResolvedValue({ data: { user: { id: 'u' } } });
    auth.updateUser.mockResolvedValue({ error: null });
    render(<ResetPasswordPage />);
    await screen.findByLabelText(/^new password$/i);
    await fill(/^new password$/i, 'newpass2026');
    await fill(/confirm new password/i, 'newpass2026');
    await userEvent.click(screen.getByRole('button', { name: /save password/i }));
    expect(auth.updateUser).toHaveBeenCalledWith({ password: 'newpass2026' });
    await waitFor(() => expect(push).toHaveBeenCalledWith('/home'));
  });
});
