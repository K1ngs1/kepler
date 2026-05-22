import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(
  _request: Request,
  { params }: { params: { tradeId: string } }
) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: 'Server not configured.' }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  // For MVP trades, the trade detail page reads offered_cards and
  // requested_listing_item_ids directly from trade_offers.
  // This endpoint is kept for backward compatibility with any legacy
  // trades that used the trade_items table.
  const { data, error } = await supabase
    .from('trade_items')
    .select('id, direction, user_card_id, user_cards(condition, catalog_card_id, catalog_cards(name, set_name, number, image_url))')
    .eq('trade_id', params.tradeId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}
