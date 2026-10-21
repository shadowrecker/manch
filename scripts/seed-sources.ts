/**
 * Seed the source-credibility registry (PRD §26 Source Credibility Score, v1.1).
 *
 *   npm run seed:sources
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL in .env.local.
 * Ratings are a representative starter set; refresh quarterly per the PRD.
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

interface SeedSource {
  domain: string;
  rating: string;
}

async function main() {
  const { createAdminClient } = await import('@/lib/supabase/admin');
  const rows = JSON.parse(readFileSync(resolve(here, '..', 'supabase', 'seed', 'sources.json'), 'utf8')) as SeedSource[];
  const sb = createAdminClient();
  const { error } = await sb.from('source_registry').upsert(rows, { onConflict: 'domain' });
  if (error) {
    console.error('✗ seed failed:', error.message);
    process.exit(1);
  }
  console.log(`✓ Seeded ${rows.length} source-credibility ratings.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
