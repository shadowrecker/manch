'use client';

import { useState } from 'react';
import { LANGUAGES } from '@/lib/modules/reels/languages';
import { toast } from '@/components/ui/toast';
import { Spinner } from '@/components/ui/spinner';
import type { BrandPresetRow } from '@/lib/db/types';
import type { LanguageCode } from '@/lib/modules/reels/types';

export function AgencyClient({ initialPresets }: { initialPresets: BrandPresetRow[] }) {
  const [presets, setPresets] = useState(initialPresets);
  const [name, setName] = useState('');
  const [brief, setBrief] = useState('');
  const [langs, setLangs] = useState<LanguageCode[]>([]);
  const [busy, setBusy] = useState(false);

  function toggle(c: LanguageCode) {
    setLangs((p) => (p.includes(c) ? p.filter((x) => x !== c) : [...p, c]));
  }

  async function create() {
    if (!name.trim()) {
      toast('Give the brand a name');
      return;
    }
    setBusy(true);
    try {
      const r = await fetch('/api/reels/agency/brands', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, brief, languages: langs }),
      });
      if (!r.ok) {
        toast('Could not save');
        return;
      }
      const d = (await r.json()) as { preset: BrandPresetRow };
      setPresets((p) => [d.preset, ...p]);
      setName('');
      setBrief('');
      setLangs([]);
      toast('Brand preset saved ✓');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="card">
        <h1>Agency — Brand presets</h1>
        <p className="sub">Save each client’s brand brief + languages once. Generate on-brand content in seconds.</p>
        <label>Brand name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sharma Sweets" />
        <label>Brief (optional)</label>
        <textarea value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="Tone, dos & don’ts, key messages…" />
        <label>Default languages</label>
        <div className="chips">
          {LANGUAGES.map((l) => (
            <span key={l.code} className={`chip${langs.includes(l.code) ? ' on' : ''}`} onClick={() => toggle(l.code)}>
              {l.name}
            </span>
          ))}
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn" onClick={create} disabled={busy}>
            {busy ? <Spinner /> : 'Save brand preset'}
          </button>
        </div>
      </div>

      <div className="card">
        <h2>Your brands</h2>
        {presets.length ? (
          presets.map((p) => (
            <div key={p.id} className="script-card" style={{ marginBottom: 12 }}>
              <b>{p.name}</b>
              {p.brief && <div className="muted" style={{ fontSize: 13 }}>{p.brief}</div>}
              {p.default_languages?.length > 0 && <div className="hint">Languages: {p.default_languages.join(', ')}</div>}
            </div>
          ))
        ) : (
          <div className="empty">No brand presets yet. Add your first client above.</div>
        )}
      </div>
    </>
  );
}
