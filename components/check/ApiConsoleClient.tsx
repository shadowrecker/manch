'use client';

import { useState } from 'react';
import { Spinner } from '@/components/ui/spinner';
import { toast } from '@/components/ui/toast';
import type { ApiError } from '@/lib/types';

export function ApiConsoleClient() {
  const [org, setOrg] = useState('');
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState<{ key: string; quota: number } | null>(null);

  async function createKey() {
    if (!org.trim()) {
      toast('Enter your organisation name');
      return;
    }
    setBusy(true);
    try {
      const r = await fetch('/api/check/keys', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ orgName: org }),
      });
      if (!r.ok) {
        const e = (await r.json().catch(() => ({}))) as ApiError;
        toast(e.error || 'Could not create key');
        return;
      }
      const d = (await r.json()) as { key: string; monthly_quota: number };
      setIssued({ key: d.key, quota: d.monthly_quota });
      toast('API key created ✓');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="card">
        <h1 style={{ margin: 0 }}>Newsroom API</h1>
        <p className="sub" style={{ margin: '4px 0 0' }}>Fact-check at volume from your CMS. POST text, get structured JSON.</p>
        <label style={{ marginTop: 12 }}>Organisation</label>
        <input value={org} onChange={(e) => setOrg(e.target.value)} placeholder="e.g. The Daily Herald" />
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn" onClick={createKey} disabled={busy}>{busy ? <Spinner /> : 'Create API key'}</button>
        </div>
        {issued && (
          <div className="card" style={{ marginTop: 14, background: 'var(--panel2)' }}>
            <div className="lbl hint">Your API key (shown once — copy it now)</div>
            <code style={{ display: 'block', wordBreak: 'break-all', marginTop: 6, color: 'var(--brand)' }}>{issued.key}</code>
            <p className="hint" style={{ marginTop: 8 }}>{issued.quota.toLocaleString('en-IN')} calls / month.</p>
          </div>
        )}
      </div>

      <div className="card">
        <h2>Quickstart</h2>
        <pre className="hint" style={{ whiteSpace: 'pre-wrap', overflowX: 'auto' }}>{`curl -X POST ${typeof window !== 'undefined' ? window.location.origin : ''}/api/check \\
  -H "Authorization: Bearer <your-key>" \\
  -H "content-type: application/json" \\
  -d '{"type":"text","content":"<message to check>","language":"en"}'`}</pre>
        <p className="hint">Returns: trust_score, verdict, claims[], source_links[], language, check_timestamp.</p>
      </div>
    </>
  );
}
