/**
 * Kepler Catalog Seed Script
 * Fetches Pokémon TCG cards from the free TCGdex API and inserts them into Supabase.
 *
 * Usage:
 *   node scripts/seed-catalog.mjs
 *
 * Requires env vars (reads from frontend/.env.local automatically):
 *   NEXT_PUBLIC_SUPABASE_URL  — your Supabase project URL
 *   SUPABASE_SERVICE_KEY      — service role key (bypasses RLS for seeding)
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env.local if it exists (works from frontend/scripts/ or scripts/)
const envPath = existsSync(resolve(__dirname, '../.env.local'))
  ? resolve(__dirname, '../.env.local')
  : resolve(__dirname, '../../frontend/.env.local');
if (existsSync(envPath)) {
  const lines = readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) process.env[match[1].trim()] = match[2].trim();
  }
}

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌  Missing env vars. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_KEY.');
  console.error('    These are read automatically from frontend/.env.local');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Classic English sets to seed — plenty of vintage cards
const SETS = [
  { code: 'base1',    name: 'Base Set' },
  { code: 'base2',    name: 'Jungle' },
  { code: 'base3',    name: 'Fossil' },
  { code: 'base4',    name: 'Base Set 2' },
  { code: 'basep',    name: 'Wizards Black Star Promos' },
  { code: 'gym1',     name: 'Gym Heroes' },
  { code: 'gym2',     name: 'Gym Challenge' },
  { code: 'neo1',     name: 'Neo Genesis' },
  { code: 'neo2',     name: 'Neo Discovery' },
  { code: 'neo3',     name: 'Neo Revelation' },
  { code: 'neo4',     name: 'Neo Destiny' },
  { code: 'si1',      name: 'Southern Islands' },
  { code: 'ecard1',   name: 'Expedition Base Set' },
  { code: 'ecard2',   name: 'Aquapolis' },
  { code: 'ecard3',   name: 'Skyridge' },
];

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchSetCards(setCode) {
  const url = `https://api.tcgdex.net/v2/en/sets/${setCode}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) {
      console.warn(`  ⚠  ${setCode}: HTTP ${res.status} — skipping`);
      return { cards: [], setName: null };
    }
    const data = await res.json();
    const cards = Array.isArray(data.cards) ? data.cards : [];
    return { cards, setName: data.name || null };
  } catch (err) {
    console.warn(`  ⚠  ${setCode}: fetch failed (${err.message}) — skipping`);
    return { cards: [], setName: null };
  }
}

async function seedSet(setCode, fallbackName) {
  const { cards, setName } = await fetchSetCards(setCode);
  const displayName = setName || fallbackName;

  if (cards.length === 0) {
    console.log(`  → ${displayName} (${setCode}): no cards found`);
    return 0;
  }

  console.log(`  → ${displayName} (${setCode}): ${cards.length} cards`);

  const rows = cards.map((card) => ({
    name: card.name || 'Unknown',
    set_name: displayName,
    set_code: setCode,
    number: String(card.localId || card.id || ''),
    rarity: card.rarity || null,
    // TCGdex image URLs: append /high.webp for full-res
    image_url: card.image ? `${card.image}/high.webp` : null,
    tcgdex_id: card.id || null,
  }));

  let inserted = 0;
  const batchSize = 100;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await supabase
      .from('catalog_cards')
      .upsert(batch, { onConflict: 'tcgdex_id', ignoreDuplicates: true });
    if (error) {
      console.error(`     ✗ batch error: ${error.message}`);
    } else {
      inserted += batch.length;
    }
    await delay(150);
  }

  console.log(`     ✓ ${inserted}/${rows.length} rows upserted`);
  return inserted;
}

async function main() {
  console.log('🎴  Kepler catalog seed starting…\n');

  // Check connection
  const { error: pingErr } = await supabase.from('catalog_cards').select('id').limit(1);
  if (pingErr) {
    console.error('❌  Cannot reach Supabase:', pingErr.message);
    console.error('    Make sure you ran the SQL schema first (supabase/migrations/001_schema.sql)');
    process.exit(1);
  }

  let total = 0;
  for (const { code, name } of SETS) {
    total += await seedSet(code, name);
    await delay(300);
  }

  const { count } = await supabase
    .from('catalog_cards')
    .select('*', { count: 'exact', head: true });

  console.log(`\n✅  Seed complete — ${total} rows inserted this run`);
  console.log(`    Total cards in catalog_cards: ${count ?? 'unknown'}`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
