'use client';

import { useState } from 'react';
import { toast } from '@/components/ui/toast';
import { Editor } from '@/components/post/Editor';
import { clip } from '@/lib/utils';
import type { Plan } from '@/lib/plans';
import type { DraftStatus } from '@/lib/modules/post/types';
import type { DraftRow } from '@/lib/db/types';

// Client list of the user's drafts (mirrors the demo Drafts view). Each draft is
// a .variant card with its angle tag, a truncated preview, status, and Edit /
// Delete actions. Editing opens the <Editor> modal; deleting soft-discards the
// row server-side and removes it from the list optimistically.

interface DraftsClientProps {
  drafts: DraftRow[];
  plan: Plan;
  authorName?: string | null;
  headline?: string | null;
}

// Human labels for the angle tag, matching the demo's Story / Insight / Opinion.
const ANGLE_LABEL: Record<DraftRow['angle'], string> = {
  story: 'Story',
  insight: 'Insight',
  opinion: 'Opinion',
};

// Human labels for the draft status hint.
const STATUS_LABEL: Record<DraftStatus, string> = {
  draft: 'Draft',
  scheduled: 'Scheduled',
  published: 'Published',
  discarded: 'Discarded',
};

export function DraftsClient({ drafts, plan, authorName, headline }: DraftsClientProps) {
  const [list, setList] = useState<DraftRow[]>(drafts);
  const [editing, setEditing] = useState<DraftRow | null>(null);

  async function handleDelete(id: string) {
    // Optimistically remove; restore on failure.
    const prev = list;
    setList((l) => l.filter((d) => d.id !== id));
    try {
      const res = await fetch(`/api/post/drafts/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('delete failed');
      toast('Draft deleted');
    } catch {
      setList(prev);
      toast('Could not delete — try again');
    }
  }

  // Apply an editor patch (body and/or status) to the in-memory list.
  function applyPatch(patch: { id: string; body?: string; status?: DraftStatus }) {
    setList((l) =>
      l.map((d) =>
        d.id === patch.id
          ? {
              ...d,
              ...(patch.body !== undefined ? { body: patch.body } : {}),
              ...(patch.status !== undefined ? { status: patch.status } : {}),
            }
          : d,
      ),
    );
    setEditing((cur) =>
      cur && cur.id === patch.id
        ? {
            ...cur,
            ...(patch.body !== undefined ? { body: patch.body } : {}),
            ...(patch.status !== undefined ? { status: patch.status } : {}),
          }
        : cur,
    );
  }

  if (list.length === 0) {
    return (
      <div className="empty">No drafts yet. Generate some posts to get started.</div>
    );
  }

  return (
    <>
      {list.map((d) => (
        <div key={d.id} className="variant" style={{ marginBottom: 12 }}>
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <span className={`tag ${d.angle}`}>{ANGLE_LABEL[d.angle]}</span>
            <span className="hint">{STATUS_LABEL[d.status]}</span>
          </div>
          {/* clip truncates the preview; React text rendering escapes by default. */}
          <div className="post-body">{clip(d.body, 180)}</div>
          <div className="acts">
            <button className="btn sm" onClick={() => setEditing(d)}>
              ✎ Edit &amp; preview
            </button>
            <button className="btn ghost sm" onClick={() => handleDelete(d.id)}>
              🗑 Delete
            </button>
          </div>
        </div>
      ))}

      {editing && (
        <Editor
          draft={editing}
          plan={plan}
          authorName={authorName ?? null}
          headline={headline ?? null}
          onClose={() => setEditing(null)}
          onSaved={applyPatch}
        />
      )}
    </>
  );
}
