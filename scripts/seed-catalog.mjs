/**
 * Seed script: fetches Pokémon TCG cards from TCGdex API and inserts into Supabase.
 * Usage: SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node scripts/seed-catalog.mjs
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_KEY env vars');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Vintage sets to seed
const SETS = [
  { code: 'base1', name: 'Base Set' },
  { code: 'base2', name: 'Jungle' },
  { code: 'base3', name: 'Fossil' },
  { code: 'base4', name: 'Base Set 2' },
  { code: 'gym1', name: 'Gym Heroes' },
  { code: 'gym2', name: 'Gym Challenge' },
  { code: 'neo1', name: 'Neo Genesis' },
  { code: 'neo2', name: 'Neo Discovery' },
  { code: 'neo3', name: 'Neo Revelation' },
  { code: 'neo4', name: 'Neo Destiny' },
];

async function fetchSet(setCode) {
  const url = `https://api.tcgdex.net/v2/en/sets/${setCode}/cards`;
  const res = await fetch(url);
  if (!res.ok) {
    console.warn(`Skipping ${setCode}: ${res.status}`);
    return [];
  }
  const cards = await res.json();
  return Array.isArray(cards) ? cards : [];
}

async function seedSet(setCode, setName) {
  console.log(`Seeding ${setName} (${setCode})…`);
  const cards = await fetchSet(setCode);

  if (cards.length === 0) {
    console.log(`  No cards found for ${setCode}`);
    return;
  }

  const rows = cards.map((card) => ({
    name: card.name || 'Unknown',
    set_name: setName,
    set_code: setCode,
    number: card.localId || card.id || '',
    rarity: card.rarity || null,
    image_url: card.image ? `${card.image}/high.webp` : null,
    tcgdex_id: card.id || null,
  }));

  // Upsert in batches of 100
  const batchSize = 100;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await supabase
      .from('catalog_cards')
      .upsert(batch, { onConflict: 'tcgdex_id', ignoreDuplicates: false });
    if (error) {
      console.error(`  Error inserting batch: ${error.message}`);
    } else {
      console.log(`  ✓ Inserted ${Math.min(i + batchSize, rows.length)}/${rows.length} cards`);
    }
  }
}

async function main() {
  console.log('Starting Kepler catalog seed…\n');
  for (const { code, name } of SETS) {
    await seedSet(code, name);
    await new Promise((r) => setTimeout(r, 300)); // rate limit
  }
  console.log('\n✓ Seed complete!');
}

main().catch((err) => { console.error(err); process.exit(1); });
