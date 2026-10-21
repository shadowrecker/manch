import type { Metadata } from 'next';
import { createAdminClient } from '@/lib/supabase/admin';
import { ScoreRing } from '@/components/post/ScoreRing';
import { AUDIT_DIMENSIONS, type AuditScores, type AuditFix } from '@/lib/modules/post/types';

// PUBLIC share page for a Manch Score — the Post module's LinkedIn profile audit
// (the viral mechanic, PRD F-03). Lives outside the (app) shell, so it sets the
// Post palette itself via a data-module="post" frame.
// No auth — loaded by share_id via the service-role client so anonymous visitors
// can see someone's score and click through to make their own.

export const runtime = 'nodejs';

interface ScorePageProps {
  params: { shareId: string };
}

// Minimal row shape we read for the public page (no PII beyond the score).
interface PublicAudit {
  overall: number;
  scores: AuditScores;
  fixes: AuditFix[];
}

async function loadAudit(shareId: string): Promise<PublicAudit | null> {
  // share_id values are random hex (randomId(8)); ignore anything else.
  if (!/^[a-f0-9]{8,32}$/i.test(shareId)) return null;

  const admin = createAdminClient();
  const { data } = await admin
    .from('audits')
    .select('overall, scores, fixes')
    .eq('share_id', shareId)
    .maybeSingle();

  if (!data) return null;
  return {
    overall: data.overall,
    // scores/fixes are stored as Json columns — cast to the shared types.
    scores: data.scores as unknown as AuditScores,
    fixes: data.fixes as unknown as AuditFix[],
  };
}

function verdict(n: number): string {
  if (n >= 75) return 'Strong profile — fine-tuning territory';
  if (n >= 55) return 'Solid base, clear room to grow';
  if (n >= 40) return 'Underperforming your expertise';
  return 'Lots of untapped potential';
}

export async function generateMetadata({ params }: ScorePageProps): Promise<Metadata> {
  const audit = await loadAudit(params.shareId);
  if (!audit) {
    return {
      title: 'Manch Score — Manch Post',
      description: 'Audit your LinkedIn profile and get your Manch Score with Manch.',
    };
  }
  const title = `My Manch Score is ${audit.overall}/100`;
  const description = 'Audit your LinkedIn profile and get your Manch Score with Manch. What is yours?';
  return {
    title,
    description,
    openGraph: { title, description, type: 'website' },
    twitter: { card: 'summary_large_image', title, description },
  };
}

export default async function ScorePage({ params }: ScorePageProps) {
  const audit = await loadAudit(params.shareId);

  // Shared lightweight header (this route is outside the (app) auth shell).
  const header = (
    <header className="top">
      <div className="logo">
        <span className="mark">म</span> Manch <span className="pill">Manch Score</span>
      </div>
      <a className="planbadge" href="/">
        Get yours →
      </a>
    </header>
  );

  if (!audit) {
    return (
      <div className="module-frame" data-module="post">
        {header}
        <main className="wrap">
          <div className="card">
            <div className="empty">
              <h2>Score not found</h2>
              <p className="muted">
                This Manch Score link is invalid or has expired. Audit your own LinkedIn profile to
                get your score.
              </p>
              <div className="row" style={{ justifyContent: 'center', marginTop: 14 }}>
                <a className="btn" href="/signup">
                  Get my Manch Score
                </a>
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="module-frame" data-module="post">
      {header}
      <main className="wrap">
        <div className="card">
          <div className="score-wrap">
            <ScoreRing value={audit.overall} />
            <div style={{ flex: 1, minWidth: 240 }}>
              <h1 style={{ marginBottom: 4 }}>My Manch Score is {audit.overall}/100</h1>
              <h2 style={{ marginTop: 0 }}>{verdict(audit.overall)}</h2>
              <p className="muted">A LinkedIn profile audit by Manch Post. What is yours?</p>

              {AUDIT_DIMENSIONS.map((dim) => {
                const score = audit.scores?.[dim.key] ?? 0;
                return (
                  <div className="audit-row" key={dim.key}>
                    <div className="top">
                      <span>
                        {dim.label} <span className="muted">· {dim.hint}</span>
                      </span>
                      <b>{score}/100</b>
                    </div>
                    <div className="bar">
                      <i style={{ width: `${score}%` }} />
                    </div>
                  </div>
                );
              })}

              <div className="row" style={{ marginTop: 16 }}>
                <a className="btn" href="/">
                  Get my Manch Score →
                </a>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
