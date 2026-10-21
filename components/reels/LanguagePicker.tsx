'use client';

import { LANGUAGES } from '@/lib/modules/reels/languages';
import type { LanguageCode } from '@/lib/modules/reels/types';

export function LanguagePicker({
  value,
  onChange,
}: {
  value: LanguageCode;
  onChange: (code: LanguageCode) => void;
}) {
  return (
    <div className="lang-grid" role="group" aria-label="Choose language">
      {LANGUAGES.map((l) => (
        <div
          key={l.code}
          className={`lang${value === l.code ? ' on' : ''}`}
          role="button"
          tabIndex={0}
          aria-pressed={value === l.code}
          onClick={() => onChange(l.code)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') onChange(l.code);
          }}
        >
          <div className="nv native">{l.nativeName}</div>
          <div className="en">{l.name}</div>
        </div>
      ))}
    </div>
  );
}
