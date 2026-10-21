import { getUser, createClient } from '@/lib/supabase/server';
import { languageByCode } from '@/lib/modules/reels/languages';
import type { BhashaPieceRow } from '@/lib/db/types';

interface ScriptOut {
  educational?: { hook?: string };
}
interface CaptionOut {
  caption?: string;
}

function preview(p: BhashaPieceRow): string {
  const o = p.output as ScriptOut & CaptionOut;
  if (p.kind === 'script' && o?.educational?.hook) return o.educational.hook;
  if (p.kind === 'caption' && o?.caption) return o.caption;
  return JSON.stringify(o ?? {}).slice(0, 140);
}

export default async function LibraryPage() {
  const user = await getUser();
  if (!user) return null;
  const sb = createClient();
  const { data } = await sb
    .from('bhasha_pieces')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);
  const pieces = (data ?? []) as BhashaPieceRow[];

  return (
    <>
      <div className="card">
        <h1>Library</h1>
        <p className="sub">Everything you’ve created — {pieces.length} pieces.</p>
      </div>
      {pieces.length ? (
        pieces.map((p) => (
          <div key={p.id} className="script-card" style={{ marginBottom: 12 }}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span className={`tag ${p.style ?? 'educational'}`}>{p.kind}</span>
              <span className="hint">
                {languageByCode(p.language_code)?.name ?? p.language_code} · {p.platform ?? '—'}
              </span>
            </div>
            <div className="seg native">{preview(p)}</div>
          </div>
        ))
      ) : (
        <div className="card">
          <div className="empty">Nothing yet. Head to the Studio and create your first script.</div>
        </div>
      )}
    </>
  );
}
