'use client';

import { useEffect, useState } from 'react';
import posthog from 'posthog-js';
import { toast } from '@/components/ui/toast';
import { Paywall } from '@/components/Paywall';
import { Spinner } from '@/components/ui/spinner';
import { canSchedule, canThread, needsWatermark } from '@/lib/modules/post/entitlements';
import { initials } from '@/lib/utils';
import type { Plan } from '@/lib/plans';
import type { DraftStatus } from '@/lib/modules/post/types';
import type { DraftRow } from '@/lib/db/types';

// Client-side analytics event name. Kept inline (rather than importing the
// server-only @/lib/analytics module) so posthog-node never reaches the bundle.
// Value mirrors EVENTS.draftEdited.
const EVENT_DRAFT_EDITED = 'draft_edited';

// Post editor + live LinkedIn preview, ported from the demo's #editorModal.
// A .modal.show overlay with two columns: left = editable textarea + actions,
// right = live LinkedIn preview that mirrors the textarea. Watermark, scheduling
// and threads are gated on the server-authoritative plan (entitlements helpers).

interface EditorProps {
  draft: DraftRow;
  plan: Plan;
  authorName: string | null;
  headline: string | null;
  onClose: () => void;
  /** Called after a successful save/schedule so the parent list stays in sync. */
  onSaved: (patch: { id: string; body?: string; status?: DraftStatus }) => void;
}

export function Editor({ draft, plan, authorName, headline, onClose, onSaved }: EditorProps) {
  const [body, setBody] = useState(draft.body);
  const [saving, setSaving] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [paywall, setPaywall] = useState<{ title: string; message: string } | null>(null);

  const watermarked = needsWatermark(plan);
  const name = authorName ?? 'You';
  const metaParts = [headline ?? 'Your headline', 'Now'].filter(Boolean);

  // Close on Escape for accessibility / parity with the demo backdrop dismiss.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/post/drafts/${draft.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      });
      if (!res.ok) throw new Error('save failed');
      onSaved({ id: draft.id, body });
      // Optional client analytics; no-op when PostHog isn't configured.
      try {
        posthog.capture(EVENT_DRAFT_EDITED, { draftId: draft.id });
      } catch {
        /* analytics is best-effort */
      }
      toast('Draft saved');
    } catch {
      toast('Could not save — try again');
    } finally {
      setSaving(false);
    }
  }

  async function handleSchedule() {
    if (!canSchedule(plan)) {
      setPaywall({
        title: 'Upgrade to schedule posts',
        message: 'Scheduling to LinkedIn is a paid feature.',
      });
      return;
    }
    setScheduling(true);
    try {
      // Persist any unsaved edits first so the scheduled body is current.
      await fetch(`/api/post/drafts/${draft.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      });
      // Cross-slice contract (linkedin slice): POST /api/post/schedule { draftId }.
      const res = await fetch('/api/post/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draftId: draft.id }),
      });
      if (res.status === 402) {
        setPaywall({
          title: 'Upgrade to schedule posts',
          message: 'Scheduling to LinkedIn is a paid feature.',
        });
        return;
      }
      if (!res.ok) throw new Error('schedule failed');
      onSaved({ id: draft.id, body, status: 'scheduled' });
      toast('Scheduled to LinkedIn');
      onClose();
    } catch {
      toast('Could not schedule — try again');
    } finally {
      setScheduling(false);
    }
  }

  function handleThread() {
    if (!canThread(plan)) {
      setPaywall({
        title: 'Upgrade to Pro for threads',
        message: 'X/Twitter thread generation is a Pro feature.',
      });
      return;
    }
    // v2 nicety: client-side reformat into numbered parts split on blank lines.
    const parts = body.split(/\n\n+/).filter(Boolean);
    if (parts.length === 0) return;
    const thread = parts.map((p, i) => `(${i + 1}/${parts.length}) ${p}`).join('\n\n');
    setBody(thread);
    toast('Reformatted as X thread');
  }

  async function handleCopy() {
    try {
      await navigator.clipboard?.writeText(body);
      toast('Copied to clipboard');
    } catch {
      toast('Copy failed');
    }
  }

  return (
    <>
      <div
        className="modal show"
        role="dialog"
        aria-modal="true"
        aria-label="Post editor"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="box" style={{ maxWidth: 760, textAlign: 'left' }}>
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ margin: 0 }}>Post Editor</h2>
            <button className="btn ghost sm" onClick={onClose}>
              Close ✕
            </button>
          </div>

          <div className="grid2" style={{ marginTop: 14 }}>
            {/* Left: editor */}
            <div>
              <label htmlFor="editArea">Edit your post</label>
              <textarea
                id="editArea"
                className="editArea"
                style={{ minHeight: 260 }}
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
              <div className="row" style={{ marginTop: 8, justifyContent: 'space-between' }}>
                <span className="hint">{body.length} characters</span>
                <span className="hint">
                  {watermarked ? (
                    <span className="lock">Free tier watermark applied</span>
                  ) : (
                    'Watermark removed (paid)'
                  )}
                </span>
              </div>
              <div className="row" style={{ marginTop: 10 }}>
                <button className="btn sm" onClick={handleSchedule} disabled={scheduling}>
                  {scheduling ? <Spinner /> : '📅'} Schedule to LinkedIn
                </button>
                <button className="btn ghost sm" onClick={handleThread}>
                  𝕏 Make thread
                </button>
                <button className="btn ghost sm" onClick={handleCopy}>
                  Copy
                </button>
                <button className="btn ghost sm" onClick={handleSave} disabled={saving}>
                  {saving ? <Spinner /> : '💾'} Save
                </button>
              </div>
            </div>

            {/* Right: live LinkedIn preview */}
            <div>
              <label>LinkedIn preview</label>
              <div className="li-card">
                <div className="li-head">
                  <div className="li-av">{initials(name)}</div>
                  <div>
                    <div className="li-name">{name}</div>
                    <div className="li-meta">{metaParts.join(' · ')}</div>
                  </div>
                </div>
                {/* whiteSpace pre-wrap mirrors the textarea exactly. */}
                <div className="li-body" style={{ whiteSpace: 'pre-wrap' }}>
                  {body}
                </div>
                <div className="li-actions">
                  <span>👍 Like</span>
                  <span>💬 Comment</span>
                  <span>↻ Repost</span>
                  <span>➤ Send</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Paywall
        open={paywall !== null}
        title={paywall?.title}
        message={paywall?.message}
        onClose={() => setPaywall(null)}
      />
    </>
  );
}
