import Link from 'next/link';

// Shared frame for the guest pages (login, sign-up, forgot / reset password).
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="module-frame" data-module="core">
      <header className="top">
        <Link href="/" className="logo">
          <span className="mark">म</span> Manch
        </Link>
      </header>
      <div className="wrap" style={{ maxWidth: 460 }}>
        <div className="card">{children}</div>
        <p className="hint" style={{ textAlign: 'center' }}>
          One account for Post, Reels, Deals and Check. AI-assisted content is labelled.
        </p>
      </div>
    </div>
  );
}

/** "or" divider between Google and the email form. */
export function OrDivider() {
  return (
    <div className="row" style={{ alignItems: 'center', margin: '18px 0' }}>
      <div style={{ flex: 1, height: 1, background: 'var(--line)' }} />
      <span className="hint">or</span>
      <div style={{ flex: 1, height: 1, background: 'var(--line)' }} />
    </div>
  );
}
