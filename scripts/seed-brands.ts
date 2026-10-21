/**
 * Seed the brand catalog: embed each curated brand and upsert into `brands`.
 *
 *   npm run seed:brands
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL and OPENAI_API_KEY
 * in .env.local. This is the catalog cold-start; production targets 1,000+ brands
 * (PRD §32) — this file ships a representative starter set.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Minimal .env.local loader (no dotenv dependency).
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
    const key = m[1];
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

const here = dirname(fileURLToPath(import.meta.url));
loadEnv(resolve(here, '..', '.env.local'));

interface SeedBrand {
  name: string;
  website: string;
  niche: string[];
  target_audience: string;
  tier_focus: string;
  typical_creator_size: string;
}

async function main() {
  // Imported after env is loaded so the lazy env object picks up the values.
  const { createAdminClient } = await import('@/lib/supabase/admin');
  const { embedText, brandText, pgvectorLiteral } = await import('@/lib/modules/deals/match/embed');

  const brands = JSON.parse(readFileSync(resolve(here, '..', 'supabase', 'seed', 'brands.json'), 'utf8')) as SeedBrand[];
  const sb = createAdminClient();

  let ok = 0;
  let noEmbed = 0;
  for (const b of brands) {
    const vec = await embedText(brandText(b));
    const row = {
      name: b.name,
      website: b.website,
      niche: b.niche,
      target_audience: b.target_audience,
      tier_focus: b.tier_focus,
      typical_creator_size: b.typical_creator_size,
      embedding: vec ? pgvectorLiteral(vec) : null,
      source: 'seed',
      curated: true,
    };
    if (!vec) noEmbed++;
    const { error } = await sb.from('brands').upsert(row, { onConflict: 'name' });
    if (error) {
      console.error(`✗ ${b.name}:`, error.message);
    } else {
      ok++;
      console.log(`✓ ${b.name}${vec ? '' : ' (no embedding — set OPENAI_API_KEY)'}`);
    }
  }

  console.log(`\nSeeded ${ok}/${brands.length} brands.${noEmbed ? ` ${noEmbed} without embeddings.` : ''}`);
  if (noEmbed) console.log('Re-run with OPENAI_API_KEY set to compute embeddings for matching.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
