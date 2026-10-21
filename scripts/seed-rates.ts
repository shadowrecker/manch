/**
 * Seed rate_benchmarks: market rate percentiles by (niche, follower_band,
 * deliverable, region). Figures are representative starter data (survey/
 * self-report basis, PRD §8.5/§11) — NOT scraped. Replace/extend with real
 * partner data over time.
 *
 *   npm run seed:rates
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL in .env.local.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

function loadEnv(file: string): void {
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    return;
  }
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    if (!(m[1] in process.env)) process.env[m[1]] = val;
  }
}

const here = dirname(fileURLToPath(import.meta.url));
loadEnv(resolve(here, '..', '.env.local'));

const REGION = 'IN';
const NICHES: Record<string, number> = { beauty: 1.0, food: 0.9, fitness: 1.0, fashion: 1.1, tech: 1.2, finance: 1.4 };
const DELIVERABLES = ['reel', 'story', 'post', 'bundle'] as const;

// Base p50 in paise per band × deliverable (₹). e.g. micro reel p50 = ₹18,000.
const BASE: Record<string, Record<(typeof DELIVERABLES)[number], number>> = {
  nano: { reel: 400000, story: 80000, post: 250000, bundle: 800000 },
  micro: { reel: 1800000, story: 400000, post: 1000000, bundle: 3500000 },
  mid: { reel: 9000000, story: 2000000, post: 5000000, bundle: 18000000 },
};
const SAMPLE: Record<string, number> = { nano: 48, micro: 62, mid: 31 };

async function main() {
  const { createAdminClient } = await import('@/lib/supabase/admin');
  const sb = createAdminClient();

  const rows: {
    niche: string;
    follower_band: string;
    deliverable: string;
    region: string;
    p25_paise: number;
    p50_paise: number;
    p75_paise: number;
    sample_size: number;
    source: string;
  }[] = [];
  for (const [niche, mult] of Object.entries(NICHES)) {
    for (const band of Object.keys(BASE)) {
      for (const d of DELIVERABLES) {
        const p50 = Math.round((BASE[band][d] * mult) / 1000) * 1000;
        rows.push({
          niche,
          follower_band: band,
          deliverable: d,
          region: REGION,
          p25_paise: Math.round((p50 * 0.6) / 1000) * 1000,
          p50_paise: p50,
          p75_paise: Math.round((p50 * 1.6) / 1000) * 1000,
          sample_size: SAMPLE[band],
          source: 'seed-survey',
        });
      }
    }
  }

  const { error } = await sb.from('rate_benchmarks').upsert(rows, { onConflict: 'niche,follower_band,deliverable,region' });
  if (error) {
    console.error('✗ seed failed:', error.message);
    process.exit(1);
  }
  console.log(`✓ Seeded ${rows.length} rate benchmarks across ${Object.keys(NICHES).length} niches.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
