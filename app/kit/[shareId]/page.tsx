import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getMediaKitByShareId } from '@/lib/modules/deals/queries';
import { MediaKitCard } from '@/components/deals/MediaKitCard';
import type { IgMetrics, MediaKitData } from '@/lib/modules/deals/types';

export const dynamic = 'force-dynamic';

interface Stored {
  kit?: MediaKitData;
  metrics?: IgMetrics;
}

export async function generateMetadata({
  params,
}: {
  params: { shareId: string };
}): Promise<Metadata> {
  const row = await getMediaKitByShareId(params.shareId);
  const kit = (row?.data as Stored | null)?.kit;
  if (!kit) return { title: 'Media Kit · Manch' };
  return {
    title: `${kit.headline} · Media Kit`,
    description: kit.about?.slice(0, 160),
  };
}

// Public, unauthenticated share page (Manch Deals). Renders from the
// self-contained snapshot stored on the row, so no viewer auth or creator
// metrics lookup is needed. It lives outside the authed (app) frame, so it
// sets the Deals module frame itself for app/styles/deals.css to apply.
export default async function PublicKitPage({ params }: { params: { shareId: string } }) {
  const row = await getMediaKitByShareId(params.shareId);
  const stored = (row?.data as Stored | null) ?? null;
  if (!row || !stored?.kit || !stored?.metrics) notFound();

  return (
    <div className="module-frame" data-module="deals">
      <main className="share-wrap">
        <div className="share-inner">
          <MediaKitCard kit={stored.kit} metrics={stored.metrics} />
          <div className="share-foot">
            <a href="/">Made with Manch Deals — media kits for Indian creators</a>
          </div>
        </div>
      </main>
    </div>
  );
}
