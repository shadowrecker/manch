'use client';

import { useState } from 'react';
import posthog from 'posthog-js';
import { ScoreRing } from '@/components/post/ScoreRing';
import { Spinner } from '@/components/ui/spinner';
import { toast } from '@/components/ui/toast';
import { EVENTS } from '@/lib/events';
import { env } from '@/lib/env';
import type { ApiError } from '@/lib/types';
import { AUDIT_DIMENSIONS, type AuditScores, type AuditFix } from '@/lib/modules/post/types';

// Client UI for the LinkedIn Profile Audit (PRD F-03). Ports the demo Audit view:
// URL input + "paste your profile" textarea → POST /api/post/audit → Manch Score ring,
// 5 dimension bars, top-3 fixes, share button + Profile Makeover CTA.

interface AuditResponse {
  auditId: string;
  shareId: string;
  scores: AuditScores;
  overall: number;
  fixes: AuditFix[];
}

// Headline verdict for the score (mirrors the demo's verdict()).
function verdict(n: number): string {
  if (n >= 75) return 'Strong profile — fine-tuning territory';
  if (n >= 55) return 'Solid base, clear room to grow';
  if (n >= 40) return 'Underperforming your expertise';
  return 'Lots of untapped potential';
}

export function AuditClient() {
  const [linkedinUrl, setLinkedinUrl] = useState('');
  const [profileText, setProfileText] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AuditResponse | null>(null);

  async function runAudit() {
    const url = linkedinUrl.trim();
    const text = profileText.trim();

    if (!text) {
      toast('Paste your headline, about and experience to audit');
      return;
    }
    // URL is optional reference, but nudge for the expected format if given.
    if (url && !/linkedin\.com\/in\//i.test(url)) {
      toast('Use a linkedin.com/in/... URL');
      return;
    }

    setLoading(true);
    setResult(null);
    try {
      const res = await fetch('/api/post/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ linkedinUrl: url, profileText: text }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as ApiError;
        toast(
          res.status === 429
            ? 'Slow down a moment — too many audits'
            : err.error
              ? `Audit failed: ${err.error}`
              : 'Audit failed. Please try again.',
        );
        return;
      }
      const data = (await res.json()) as AuditResponse;
      setResult(data);
      toast('Your Manch Score is ready');
    } catch {
      toast('Network error — please try again');
    } finally {
      setLoading(false);
    }
  }

  function shareScore() {
    if (!result) return;
    const link = `${env.appUrl.replace(/\/$/, '')}/score/${result.shareId}`;
    const message = `My Manch Score is ${result.overall}/100. What is yours? ${link}`;

    navigator.clipboard
      ?.writeText(message)
      .then(() => toast('Shareable score copied — paste it on LinkedIn'))
      .catch(() => toast('Could not copy — your score link is /score/' + result.shareId));

    // Optional client-side product event (no-op without a PostHog key).
    if (env.posthogKey) {
      posthog.capture(EVENTS.scoreShared, {
        share_id: result.shareId,
        overall: result.overall,
      });
    }
  }

  return (
    <>
      <div className="card">
        <h1>LinkedIn Profile Audit</h1>
        <p className="sub">
          Paste your LinkedIn URL and your profile text. Get your Manch Score and a prioritised
          3-action fix list.
        </p>

        <label htmlFor="auditUrl">Your LinkedIn profile URL</label>
        <input
          id="auditUrl"
          value={linkedinUrl}
          onChange={(e) => setLinkedinUrl(e.target.value)}
          placeholder="https://linkedin.com/in/your-handle"
        />

        <label htmlFor="auditText">Paste your profile (headline, about &amp; experience)</label>
        <textarea
          id="auditText"
          value={profileText}
          onChange={(e) => setProfileText(e.target.value)}
          placeholder={
            'Headline: Helping D2C brands scale on WhatsApp · ex-Flipkart\n\n' +
            'About: I help founders turn... (paste your full About section)\n\n' +
            'Experience: Growth Lead at... — led a team of 6, grew revenue 3x...'
          }
          style={{ minHeight: 160 }}
        />
        <p className="hint">
          We score the text you paste — nothing is scraped. Your LinkedIn URL is only used for your
          shareable score link.
        </p>

        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn" onClick={runAudit} disabled={loading}>
            {loading ? (
              <>
                <Spinner /> Scanning…
              </>
            ) : (
              'Run audit'
            )}
          </button>
        </div>
      </div>

      {result && (
        <div className="card">
          <div className="score-wrap">
            <ScoreRing value={result.overall} />
            <div style={{ flex: 1, minWidth: 240 }}>
              <h2 style={{ marginBottom: 4 }}>{verdict(result.overall)}</h2>
              {linkedinUrl.trim() && (
                <p className="muted" style={{ marginTop: 0 }}>
                  {linkedinUrl.trim()}
                </p>
              )}

              {AUDIT_DIMENSIONS.map((dim) => {
                const score = result.scores[dim.key];
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
            </div>
          </div>

          <h3 style={{ marginTop: 22 }}>Your top 3 fixes (highest impact first)</h3>
          <div>
            {result.fixes.map((fix, i) => (
              <div className="fix" key={`${fix.dimension}-${i}`}>
                <div className="n">{i + 1}</div>
                <div>
                  <b>
                    {fix.dimension} — {fix.score}/100
                  </b>
                  <div className="muted" style={{ fontSize: 13 }}>
                    {fix.action}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="row" style={{ marginTop: 6 }}>
            <button className="btn sm" onClick={shareScore}>
              Share my Manch Score
            </button>
            <a className="btn ghost sm" href="/settings/billing">
              Get the ₹199 Profile Makeover
            </a>
          </div>
        </div>
      )}
    </>
  );
}
