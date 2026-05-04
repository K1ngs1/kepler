/**
 * Seed card_prices table with approximate market values.
 *
 * Usage:
 *   SUPABASE_SERVICE_KEY=your-key node scripts/seed-prices.mjs
 *
 * This uses catalog_cards already in the database and assigns prices
 * based on rarity. For real pricing, replace with a CSV import.
 */

import { createClient } from '@supabase/supabase-js';

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

async function main() {
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

  console.log('Done! Card prices seeded.');
}

main();
