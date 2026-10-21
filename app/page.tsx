import Link from 'next/link';
import { MODULE_NAV } from '@/lib/nav';
import { CONSUMER_TIERS } from '@/lib/pricing';

// Public landing page for Manch — the four modules as one creator journey.
export default function LandingPage() {
  return (
    <div className="module-frame" data-module="core">
      <header className="top">
        <div className="logo">
          <span className="mark">म</span> Manch
        </div>
        <div className="top-right">
          <a href="#pricing" className="btn ghost sm">
            Pricing
          </a>
          <Link href="/login" className="btn sm">
            Get started free
          </Link>
        </div>
      </header>

      <section className="hero">
        <span className="pill">Made for Bharat · 8+ Indian languages · WhatsApp-first</span>
        <h1>
          Your stage. <span className="grad">Your language.</span> Your income.
        </h1>
        <p className="sub">
          Manch is one AI app for India’s creators and professionals — write LinkedIn posts from a voice
          note, script Reels in your mother tongue, land fairly-paid brand deals, and fact-check every
          forward before you share it.
        </p>
        <div className="row" style={{ justifyContent: 'center' }}>
          <Link href="/login" className="btn">
            Start free — no card needed
          </Link>
          <a href="#how" className="btn ghost">
            How it works
          </a>
        </div>
      </section>

      <main className="wrap">
        <div className="module-cards" id="how">
          {MODULE_NAV.map((m) => (
            <div key={m.key} className="module-card" data-module={m.key}>
              <span className="icon" aria-hidden>
                {m.icon}
              </span>
              <h2 style={{ margin: 0 }}>Manch {m.label}</h2>
              <p className="muted" style={{ margin: 0 }}>
                {m.pitch}
              </p>
              <span className="hint">{m.channel}</span>
            </div>
          ))}
        </div>

        <div className="card" style={{ marginTop: 18 }}>
          <h2>One journey, one account</h2>
          <div className="grid3">
            <div>
              <h3>1 · Create</h3>
              <p className="muted">
                Send a WhatsApp voice note. Get LinkedIn drafts in your voice, or a Reel script, caption and
                30 hashtags in Hindi, Tamil, Telugu, Marathi, Bengali, Kannada, Gujarati or Punjabi.
              </p>
            </div>
            <div>
              <h3>2 · Earn</h3>
              <p className="muted">
                Turn your audience into a media kit, get matched to brands that fit, pitch at a fair rate,
                and get paid through Razorpay — we only take 5% when you win.
              </p>
            </div>
            <div>
              <h3>3 · Stay credible</h3>
              <p className="muted">
                Forward any message, photo or video to the same number. Get a trust score and sources in
                your language in seconds — before it reaches your audience.
              </p>
            </div>
          </div>
        </div>

        <div className="card" id="pricing">
          <h2>One plan unlocks all four</h2>
          <div className="tiers">
            {CONSUMER_TIERS.map((t) => (
              <div key={t.plan} className={`tier${t.featured ? ' featured' : ''}`}>
                {t.featured && <div className="ribbon">MOST POPULAR</div>}
                <h3>{t.name}</h3>
                <div className="price">
                  {t.priceMonthly} <small>{t.sub}</small>
                </div>
                <p className="hint">{t.tagline}</p>
                <ul>
                  {t.feats.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
                <Link href="/login" className={`btn sm${t.featured ? '' : ' ghost'}`} style={{ marginTop: 'auto' }}>
                  {t.plan === 'free' ? 'Start free' : `Choose ${t.name}`}
                </Link>
              </div>
            ))}
          </div>
          <p className="hint">Brands, newsrooms and telcos: see plans for organisations after you sign in.</p>
        </div>

        <p className="hint" style={{ textAlign: 'center', padding: '20px 0 40px' }}>
          © Manch · AI-assisted content is always labelled · Fact-checks show signals and sources, not
          certainty.
        </p>
      </main>
    </div>
  );
}
