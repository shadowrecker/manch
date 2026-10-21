import { env } from '@/lib/env';
import { log } from '@/lib/observability';

// Fact-check source adapters (PRD §29 / §8.2). Sources are pulled via RSS / API /
// partnership — NOT wholesale scraping (the suite compliance line, §11). Each
// adapter degrades to [] when unconfigured so ingestion never hard-fails.

export interface SourceDoc {
  source: string; // pib | boom | altnews | wikipedia
  title: string;
  url: string;
  publishedAt: string | null;
  lang: string;
  text: string;
}

/** Minimal RSS item parser (title/link/pubDate/description). No XML dependency. */
export function parseRss(xml: string, source: string): SourceDoc[] {
  const items = xml.split(/<item[\s>]/i).slice(1);
  const pick = (block: string, tag: string): string => {
    const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
    if (!m) return '';
    return m[1]
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\s+/g, ' ')
      .trim();
  };
  return items
    .map((block) => {
      const title = pick(block, 'title');
      const url = pick(block, 'link');
      const description = pick(block, 'description');
      const pub = pick(block, 'pubDate');
      return {
        source,
        title,
        url,
        publishedAt: pub ? new Date(pub).toISOString() : null,
        lang: 'en',
        text: `${title}. ${description}`.trim(),
      };
    })
    .filter((d) => d.title && d.text.length > 10);
}

async function fetchRss(url: string, source: string): Promise<SourceDoc[]> {
  try {
    const res = await fetch(url, { headers: { 'user-agent': 'ManchCheck/1.0 (+https://manch.app)' } });
    if (!res.ok) return [];
    return parseRss(await res.text(), source);
  } catch (e) {
    log.warn('rss fetch failed', { source, error: String(e) });
    return [];
  }
}

export async function fetchPib(): Promise<SourceDoc[]> {
  if (!env.pibRssUrl) return [];
  return fetchRss(env.pibRssUrl, 'pib');
}

export async function fetchAltnews(): Promise<SourceDoc[]> {
  if (!env.altnewsFeedUrl) return [];
  return fetchRss(env.altnewsFeedUrl, 'altnews');
}

/** BOOM partnership API (JSON). Shape assumed; returns [] without a key. */
export async function fetchBoom(): Promise<SourceDoc[]> {
  if (!env.boomApiKey) return [];
  try {
    const res = await fetch('https://api.boomlive.in/factchecks?limit=50', {
      headers: { authorization: `Bearer ${env.boomApiKey}` },
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { items?: { title: string; url: string; published_at?: string; summary?: string; lang?: string }[] };
    return (json.items ?? []).map((it) => ({
      source: 'boom',
      title: it.title,
      url: it.url,
      publishedAt: it.published_at ?? null,
      lang: it.lang ?? 'en',
      text: `${it.title}. ${it.summary ?? ''}`.trim(),
    }));
  } catch (e) {
    log.warn('boom fetch failed', { error: String(e) });
    return [];
  }
}

/** Pull every configured source. Wikipedia is queried on-demand (not bulk-ingested). */
export async function fetchAllSources(): Promise<SourceDoc[]> {
  const results = await Promise.all([fetchPib(), fetchAltnews(), fetchBoom()]);
  return results.flat();
}
