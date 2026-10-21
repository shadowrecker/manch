'use client';

import { toast } from '@/components/ui/toast';
import { WATERMARK_TEXT } from '@/lib/modules/reels/entitlements';
import type { ScriptOutput, Style } from '@/lib/modules/reels/types';

const LABEL: Record<Style, string> = {
  educational: 'Educational',
  entertainment: 'Entertainment',
  emotional: 'Emotional',
};

export function ScriptCard({
  style,
  script,
  watermark,
  onCaption,
}: {
  style: Style;
  script: ScriptOutput;
  watermark: boolean;
  onCaption?: (script: ScriptOutput, style: Style) => void;
}) {
  function copy() {
    const text = `${script.hook}\n\n${script.body}\n\n${script.cta}`;
    navigator.clipboard?.writeText(text);
    toast('Script copied');
  }

  return (
    <div className="script-card">
      <span className={`tag ${style}`}>{LABEL[style]}</span>
      <div className="seg native">
        <span className="lbl">Hook</span>
        {script.hook}
      </div>
      <div className="seg native">
        <span className="lbl">Body</span>
        {script.body}
      </div>
      <div className="seg native">
        <span className="lbl">CTA</span>
        {script.cta}
      </div>
      {watermark && <div className="watermark">{WATERMARK_TEXT}</div>}
      <div className="acts">
        {onCaption && (
          <button className="btn sm" onClick={() => onCaption(script, style)}>
            ✍️ Make caption
          </button>
        )}
        <button className="btn ghost sm" onClick={copy}>
          Copy
        </button>
      </div>
    </div>
  );
}
