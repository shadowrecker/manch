'use client';

import { useState } from 'react';
import { Spinner } from '@/components/ui/spinner';
import { toast } from '@/components/ui/toast';
import type { ApiError } from '@/lib/types';

// Link the user's WhatsApp number to their Manch account so voice notes sent to
// the one Manch number become LinkedIn drafts / Reel scripts, and fact-checks
// use their plan. Ownership is proven over WhatsApp: we show a one-time code,
// the user sends "LINK <code>" from their own WhatsApp (POST /api/post/whatsapp-number).

interface CodeResponse {
  code: string;
  expiresAt: string;
  waLink: string | null;
}

export function WhatsappLinkForm({ initial }: { initial: string | null }) {
  const [linked, setLinked] = useState(initial);
  const [pending, setPending] = useState<CodeResponse | null>(null);
  const [busy, setBusy] = useState(false);

  async function call(body: Record<string, unknown>) {
    setBusy(true);
    try {
      const res = await fetch('/api/post/whatsapp-number', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as ApiError & Partial<CodeResponse> & { ok?: boolean };
      if (!res.ok) {
        toast(data.error ?? 'Something went wrong');
        return null;
      }
      return data;
    } catch {
      toast('Network error — please try again');
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function getCode() {
    const data = await call({});
    if (data?.code) setPending({ code: data.code, expiresAt: data.expiresAt!, waLink: data.waLink ?? null });
  }

  async function unlink() {
    const data = await call({ unlink: true });
    if (data?.ok) {
      setLinked(null);
      toast('WhatsApp number removed');
    }
  }

  return (
    <div className="card">
      <h2>Link your WhatsApp number</h2>
      <p className="muted" style={{ marginTop: -6 }}>
        Send a voice note to the Manch number and get LinkedIn drafts or a Reel script back.
      </p>

      {linked && (
        <div className="row" style={{ alignItems: 'center' }}>
          <p className="hint" style={{ margin: 0 }}>Linked: {linked}</p>
          <button type="button" className="btn ghost sm" onClick={unlink} disabled={busy}>
            Unlink
          </button>
        </div>
      )}

      {pending ? (
        <div>
          <p>
            From the WhatsApp you want to link, send this message to the Manch number:
          </p>
          <p style={{ fontSize: 24, fontWeight: 900, letterSpacing: 2 }} aria-label="Link code">
            LINK {pending.code}
          </p>
          <div className="row">
            {pending.waLink && (
              <a className="btn" href={pending.waLink} target="_blank" rel="noreferrer">
                Open WhatsApp
              </a>
            )}
            <button type="button" className="btn ghost sm" onClick={getCode} disabled={busy}>
              New code
            </button>
          </div>
          <p className="hint">The code works once and expires in 15 minutes. Refresh this page after sending it.</p>
        </div>
      ) : (
        <button type="button" className="btn" onClick={getCode} disabled={busy}>
          {busy ? (
            <>
              <Spinner /> Getting code…
            </>
          ) : linked ? (
            'Link a different number'
          ) : (
            'Get my link code'
          )}
        </button>
      )}
    </div>
  );
}
