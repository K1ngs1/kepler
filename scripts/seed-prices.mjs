/**
 * Seed card_prices table with approximate market values.
 *
 * Usage:
 *   # Rarity-based estimation (default):
 *   SUPABASE_SERVICE_KEY=your-key node scripts/seed-prices.mjs
 *
 *   # Import from CSV:
 *   SUPABASE_SERVICE_KEY=your-key node scripts/seed-prices.mjs ./prices.csv
 *
 * CSV format (see scripts/price-template.csv):
 *   catalog_card_name,set_name,market_price
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;

if (!url || !key) {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_KEY');
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

// Rough price ranges by rarity (USD)
const PRICE_MAP = {
  'Common': { min: 0.10, max: 0.50 },
  'Uncommon': { min: 0.25, max: 1.50 },
  'Rare': { min: 1.00, max: 8.00 },
  'Rare Holo': { min: 3.00, max: 25.00 },
  'Rare Holo EX': { min: 8.00, max: 45.00 },
  'Rare Ultra': { min: 15.00, max: 60.00 },
  'Rare Secret': { min: 20.00, max: 80.00 },
  'Rare Holo GX': { min: 5.00, max: 35.00 },
  'Rare Holo V': { min: 3.00, max: 20.00 },
  'Rare VMAX': { min: 5.00, max: 30.00 },
  'Promo': { min: 1.00, max: 10.00 },
};

function randomPrice(rarity) {
  const range = PRICE_MAP[rarity] || { min: 0.50, max: 5.00 };
  const price = range.min + Math.random() * (range.max - range.min);
  return Math.round(price * 100) / 100;
}

function parseCsv(filePath) {
  const raw = readFileSync(filePath, 'utf-8');
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) {
    console.error('CSV must have a header row and at least one data row.');
    process.exit(1);
  }

  const header = lines[0].toLowerCase();
  if (!header.includes('catalog_card_name') || !header.includes('market_price')) {
    console.error('CSV must have columns: catalog_card_name, set_name, market_price');
    process.exit(1);
  }

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    // Simple CSV parse — handles quoted fields with commas
    const parts = lines[i].match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g);
    if (!parts || parts.length < 3) continue;
    const name = parts[0].replace(/^"|"$/g, '').trim();
    const set = parts[1].replace(/^"|"$/g, '').trim();
    const price = parseFloat(parts[2].replace(/^"|"$/g, '').trim());
    if (!name || isNaN(price)) continue;
    rows.push({ name, set, price });
  }
  return rows;
}

async function seedFromCsv(filePath) {
  console.log(`Reading CSV from ${filePath}...`);
  const rows = parseCsv(filePath);
  console.log(`Parsed ${rows.length} price entries from CSV.`);

  // Fetch all catalog cards for matching
  const { data: cards, error } = await supabase
    .from('catalog_cards')
    .select('id, name, set_name')
    .order('name');

  if (error) { console.error(error); process.exit(1); }

  let matched = 0;
  const prices = [];

  for (const row of rows) {
    const match = cards.find(
      (c) =>
        c.name.toLowerCase() === row.name.toLowerCase() &&
        (!row.set || c.set_name.toLowerCase() === row.set.toLowerCase())
    );
    if (match) {
      prices.push({
        catalog_card_id: match.id,
        market_price: row.price,
        updated_at: new Date().toISOString(),
      });
      matched++;
    } else {
      console.warn(`  No match for: "${row.name}" in set "${row.set}"`);
    }
  }

  console.log(`Matched ${matched} / ${rows.length} entries to catalog cards.`);

  // Upsert in batches
  for (let i = 0; i < prices.length; i += 500) {
    const batch = prices.slice(i, i + 500);
    const { error: upsertError } = await supabase
      .from('card_prices')
      .upsert(batch, { onConflict: 'catalog_card_id' });

    if (upsertError) {
      console.error(`Error at batch ${i}:`, upsertError);
    } else {
      console.log(`  Upserted ${Math.min(i + 500, prices.length)} / ${prices.length}`);
    }
  }

  console.log('Done! CSV prices imported.');
}

async function seedFromRarity() {
  console.log('Fetching catalog cards...');
  const { data: cards, error } = await supabase
    .from('catalog_cards')
    .select('id, name, rarity')
    .order('name');

  if (error) { console.error(error); process.exit(1); }
  console.log(`Found ${cards.length} catalog cards. Generating prices...`);

  const prices = cards.map((card) => ({
    catalog_card_id: card.id,
    market_price: randomPrice(card.rarity),
    updated_at: new Date().toISOString(),
  }));

  // Upsert in batches of 500
  for (let i = 0; i < prices.length; i += 500) {
    const batch = prices.slice(i, i + 500);
    const { error: upsertError } = await supabase
      .from('card_prices')
      .upsert(batch, { onConflict: 'catalog_card_id' });

    if (upsertError) {
      console.error(`Error at batch ${i}:`, upsertError);
    } else {
      console.log(`  Upserted ${Math.min(i + 500, prices.length)} / ${prices.length}`);
    }
  }

  console.log('Done! Card prices seeded (rarity-based estimates).');
}

async function main() {
  const csvPath = process.argv[2];
  if (csvPath) {
    await seedFromCsv(csvPath);
  } else {
    await seedFromRarity();
  }
}

main();
