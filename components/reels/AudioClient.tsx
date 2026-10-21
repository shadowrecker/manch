'use client';

import { useState } from 'react';
import posthog from 'posthog-js';
import { LanguagePicker } from '@/components/reels/LanguagePicker';
import { Spinner } from '@/components/ui/spinner';
import { toast } from '@/components/ui/toast';
import { EVENTS } from '@/lib/events';
import type { LanguageCode, TrendingAudioItem } from '@/lib/modules/reels/types';

export function AudioClient({ defaultLanguage }: { defaultLanguage: LanguageCode }) {
  const [language, setLanguage] = useState<LanguageCode>(defaultLanguage);
  const [region, setRegion] = useState('');
  const [audio, setAudio] = useState<TrendingAudioItem[] | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch(
        `/api/reels/audio?language=${language}${region ? `&region=${encodeURIComponent(region)}` : ''}`,
      );
      if (!r.ok) {
        toast('Could not load audio');
        return;
      }
      const d = (await r.json()) as { audio: TrendingAudioItem[] };
      setAudio(d.audio);
      const ph = posthog as unknown as { __loaded?: boolean };
      if (ph.__loaded) posthog.capture(EVENTS.audioMatchViewed, { language_code: language });
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="card">
        <h1>Trending Audio</h1>
        <p className="sub">This week’s trending audio for your language — matched to script moods.</p>
        <label>Language</label>
        <LanguagePicker value={language} onChange={setLanguage} />
        <label>Region (optional)</label>
        <input value={region} onChange={(e) => setRegion(e.target.value)} placeholder="e.g. Mumbai" />
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn" onClick={load} disabled={loading}>
            {loading ? (
              <>
                <Spinner /> Loading…
              </>
            ) : (
              'Find trending audio'
            )}
          </button>
        </div>
      </div>

      {audio &&
        (audio.length ? (
          <div className="card">
            <h2>This week’s trending audio</h2>
            {audio.map((a) => (
              <div key={a.id} className="audio-row">
                <div className="rank">{a.rank ?? '•'}</div>
                <div style={{ flex: 1 }}>
                  <div className="native" style={{ fontWeight: 700 }}>
                    {a.title}
                  </div>
                  <div className="hint">
                    {a.platform}
                    {a.region ? ` · ${a.region}` : ''}
                  </div>
                </div>
                {a.mood && <span className="mood">{a.mood}</span>}
                <a className="btn ghost sm" href={a.audioUrl} target="_blank" rel="noreferrer">
                  Open ↗
                </a>
              </div>
            ))}
          </div>
        ) : (
          <div className="card">
            <div className="empty">No curated audio yet for this language. Try Hindi/Tamil, or check back Monday.</div>
          </div>
        ))}
    </>
  );
}
