import type { CSSProperties } from 'react';

// Conic-gradient Manch Score ring from the demo (.ring → .inner → .num/.lbl).
// Pure presentational component — no state, safe as a Server Component.
export function ScoreRing({ value, label = 'Manch Score' }: { value: number; label?: string }) {
  // Clamp so the conic fill stays within 0–100 even on bad input.
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  // `--p` drives the conic-gradient fill defined in globals.css.
  const style = { '--p': pct } as CSSProperties;

  return (
    <div className="ring" style={style} role="img" aria-label={`${label}: ${pct} out of 100`}>
      <div className="inner">
        <div>
          <div className="num">{pct}</div>
          <div className="lbl">{label}</div>
        </div>
      </div>
    </div>
  );
}
