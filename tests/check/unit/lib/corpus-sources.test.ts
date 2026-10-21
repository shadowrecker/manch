import { describe, it, expect } from 'vitest';
import { parseRss, fetchAllSources } from '@/lib/modules/check/corpus/sources';

const SAMPLE_RSS = `<?xml version="1.0"?>
<rss><channel>
  <item>
    <title>No, the viral video does not show a real flood in Mumbai</title>
    <link>https://www.altnews.in/example-1</link>
    <pubDate>Mon, 09 Jun 2026 10:00:00 GMT</pubDate>
    <description><![CDATA[A <b>recontextualised</b> 2019 clip is being shared as recent.]]></description>
  </item>
  <item>
    <title>PIB Fact Check: the message about a new tax is fake</title>
    <link>https://pib.gov.in/example-2</link>
    <pubDate>Tue, 10 Jun 2026 08:00:00 GMT</pubDate>
    <description>No such notification has been issued by the government.</description>
  </item>
</channel></rss>`;

describe('parseRss', () => {
  it('extracts title, link, date and cleaned text from RSS items', () => {
    const docs = parseRss(SAMPLE_RSS, 'altnews');
    expect(docs).toHaveLength(2);
    expect(docs[0].source).toBe('altnews');
    expect(docs[0].title).toContain('viral video');
    expect(docs[0].url).toBe('https://www.altnews.in/example-1');
    expect(docs[0].publishedAt).toMatch(/2026-06-09/);
    expect(docs[0].text).toContain('recontextualised'); // CDATA + tags stripped
    expect(docs[0].text).not.toContain('<b>');
  });

  it('drops items with no title/text', () => {
    expect(parseRss('<rss><item><link>x</link></item></rss>', 'pib')).toHaveLength(0);
  });
});

describe('fetchAllSources', () => {
  it('returns [] when no sources are configured (graceful)', async () => {
    expect(await fetchAllSources()).toEqual([]);
  });
});
