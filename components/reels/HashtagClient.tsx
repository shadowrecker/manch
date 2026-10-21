'use client';

import { useState } from 'react';
import { LanguagePicker } from '@/components/reels/LanguagePicker';
import { Spinner } from '@/components/ui/spinner';
import { toast } from '@/components/ui/toast';
import type { HashtagSet, LanguageCode, Platform } from '@/lib/modules/reels/types';

const PLATS: Platform[] = ['instagram', 'moj', 'josh', 'sharechat'];
const TIERS: { key: keyof HashtagSet; label: string }[] = [
  { key: 'high', label: 'High volume' },
  { key: 'mid', label: 'Mid volume' },
  { key: 'niche', label: 'Niche' },
];

export function HashtagClient({ defaultLanguage }: { defaultLanguage: LanguageCode }) {
  const [language, setLanguage] = useState<LanguageCode>(defaultLanguage);
  const [platform, setPlatform] = useState<Platform>('instagram');
  const [tags, setTags] = useState<HashtagSet | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch(`/api/reels/hashtags?language=${language}&platform=${platform}`);
      setLoaded(true);
      if (!r.ok) {
        toast('Could not load hashtags');
        return;
      }
      const d = (await r.json()) as { tags: HashtagSet | null };
      setTags(d.tags);
    } finally {
      setLoading(false);
    }
  }

  function copyList(list: string[]) {
    navigator.clipboard?.writeText(list.join(' '));
    toast('Copied');
  }

  return (
    <>
      <div className="card">
        <h1>Hashtag Engine</h1>
        <p className="sub">30 trending hashtags for your language + platform — high, mid and niche volume.</p>
        <label>Language</label>
        <LanguagePicker value={language} onChange={setLanguage} />
        <label>Platform</label>
        <div className="chips">
          {PLATS.map((p) => (
            <span key={p} className={`chip${platform === p ? ' on' : ''}`} onClick={() => setPlatform(p)}>
              {p}
            </span>
          ))}
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn" onClick={load} disabled={loading}>
            {loading ? (
              <>
                <Spinner /> Loading…
              </>
            ) : (
              'Get hashtags'
            )}
          </button>
        </div>
      </div>

      {loaded &&
        (tags ? (
          <div className="card">
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0 }}>This week’s hashtags</h2>
              <button className="btn ghost sm" onClick={() => copyList([...tags.high, ...tags.mid, ...tags.niche])}>
                Copy all
              </button>
            </div>
            <div className="hashtag-grid" style={{ marginTop: 12 }}>
              {TIERS.map((t) => (
                <div key={t.key} className="tag-tier">
                  <h3>{t.label}</h3>
                  <div className="tag-list">
                    {(tags[t.key] ?? []).map((h) => (
                      <span
                        key={h}
                        className="htag native"
                        onClick={() => {
                          navigator.clipboard?.writeText(h);
                          toast('Copied');
                        }}
                      >
                        {h}
                      </span>
                    ))}
                  </div>
                  <button className="btn ghost sm" style={{ marginTop: 8 }} onClick={() => copyList(tags[t.key])}>
                    Copy {t.label}
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="card">
            <div className="empty">
              No curated hashtags yet for this language + platform. Try Instagram, or check back after Monday’s refresh.
            </div>
          </div>
        ))}
    </>
  );
}
