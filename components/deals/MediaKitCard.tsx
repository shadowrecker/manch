import type { IgMetrics, MediaKitData } from '@/lib/modules/deals/types';

function num(n: number | null | undefined): string {
  return n == null ? '—' : n.toLocaleString('en-IN');
}

// The media-kit visual — used in the app and on the public /kit/[shareId] page.
export function MediaKitCard({
  kit,
  metrics,
  name,
}: {
  kit: MediaKitData;
  metrics: IgMetrics;
  name?: string | null;
}) {
  return (
    <div className="kit-card">
      <div className="kit-h">{kit.headline}</div>
      {name && <div className="muted" style={{ marginTop: 2 }}>{name}</div>}
      <div className="stats">
        <div className="stat">
          <b>{num(metrics.followers)}</b>
          <span>Followers</span>
        </div>
        <div className="stat">
          <b>{metrics.engagementRate == null ? '—' : `${metrics.engagementRate}%`}</b>
          <span>Engagement</span>
        </div>
        <div className="stat">
          <b>{num(metrics.avgLikes)}</b>
          <span>Avg likes</span>
        </div>
        <div className="stat">
          <b>{num(metrics.avgComments)}</b>
          <span>Avg comments</span>
        </div>
      </div>
      <div className="kit-sec">
        <div className="lbl">About</div>
        <p>{kit.about}</p>
      </div>
      <div className="kit-sec">
        <div className="lbl">By the numbers</div>
        <p>{kit.keyStatsNarrative}</p>
      </div>
      <div className="kit-sec">
        <div className="lbl">Why partner</div>
        <p>{kit.whyBrands}</p>
      </div>
      <div className="kit-sec">
        <div className="lbl">Collaboration</div>
        <p>{kit.pricingNote}</p>
      </div>
    </div>
  );
}
