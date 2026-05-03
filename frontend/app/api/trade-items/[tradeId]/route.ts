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

  // Service key bypasses RLS so we can see all cards in the trade
  // regardless of their for_trade status or owner
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  const { data, error } = await supabase
    .from('trade_items')
    .select('id, direction, user_card_id, user_cards(condition, catalog_cards(name, set_name, number, image_url))')
    .eq('trade_id', params.tradeId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}
