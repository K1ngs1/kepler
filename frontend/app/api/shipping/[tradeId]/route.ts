import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

export async function GET(
  _request: Request,
  { params }: { params: { tradeId: string } }
) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseAnonKey || !serviceKey) {
    return NextResponse.json({ error: 'Server not configured.' }, { status: 500 });
  }

  // Get the authenticated user from cookies
  const cookieStore = cookies();
  const authClient = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() { return cookieStore.getAll(); },
      setAll() {},
    },
  });

  const { data: { user } } = await authClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  // Use service role to fetch trade and address data
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  // Verify the user is a participant in this trade
  const { data: trade, error: tradeError } = await supabase
    .from('trade_offers')
    .select('id, status, initiator_id, recipient_id')
    .eq('id', params.tradeId)
    .single();

  if (tradeError || !trade) {
    return NextResponse.json({ error: 'Trade not found.' }, { status: 404 });
  }

  const isInitiator = trade.initiator_id === user.id;
  const isRecipient = trade.recipient_id === user.id;

  if (!isInitiator && !isRecipient) {
    return NextResponse.json({ error: 'Not a participant in this trade.' }, { status: 403 });
  }

  // Only reveal addresses after acceptance
  const allowedStatuses = ['accepted', 'completed', 'disputed'];
  if (!allowedStatuses.includes(trade.status)) {
    return NextResponse.json({ error: 'Trade status does not allow address reveal.' }, { status: 403 });
  }

  // Each party sees the other's address
  const addressUserIds: string[] = [];
  if (isInitiator) {
    addressUserIds.push(trade.recipient_id);
  } else {
    addressUserIds.push(trade.initiator_id);
  }

  const { data: addresses, error: addrError } = await supabase
    .from('shipping_addresses')
    .select('id, user_id, name, street, city, state, zip, country, is_default')
    .in('user_id', addressUserIds)
    .eq('is_default', true);

  if (addrError) {
    return NextResponse.json({ error: addrError.message }, { status: 500 });
  }

  // If no default address, try any address
  if (!addresses || addresses.length === 0) {
    const { data: anyAddresses } = await supabase
      .from('shipping_addresses')
      .select('id, user_id, name, street, city, state, zip, country, is_default')
      .in('user_id', addressUserIds)
      .order('created_at', { ascending: false })
      .limit(addressUserIds.length);

    return NextResponse.json({ addresses: anyAddresses ?? [] });
  }

  return NextResponse.json({ addresses });
}
