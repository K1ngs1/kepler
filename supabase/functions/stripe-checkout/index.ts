import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import Stripe from "https://esm.sh/stripe@12.18.0?target=deno"

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') as string, {
  apiVersion: '2022-11-15',
  httpClient: Stripe.createFetchHttpClient(),
})

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!
    
    // Create Supabase client from auth header to act on user's behalf
    const authHeader = req.headers.get('Authorization')!
    const supabaseClient = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } }
    })

    const { purchase_offer_id } = await req.json()

    // 1. Get the purchase offer
    const { data: offer, error } = await supabaseClient
      .from('purchase_offers')
      .select('*, listings(title)')
      .eq('id', purchase_offer_id)
      .single()

    if (error || !offer) {
      return new Response(JSON.stringify({ error: 'Purchase offer not found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    // 2. Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Purchase: ${offer.listings?.title || 'Cards'}`,
            },
            unit_amount: Math.round(offer.amount * 100), // Stripe expects cents
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${Deno.env.get('APP_URL') || 'http://localhost:3000'}/listings/${offer.listing_id}?success=true`,
      cancel_url: `${Deno.env.get('APP_URL') || 'http://localhost:3000'}/listings/${offer.listing_id}?canceled=true`,
      metadata: {
        purchase_offer_id: offer.id,
        listing_id: offer.listing_id,
      },
    })

    // 3. Store the session ID on the offer
    await supabaseClient
      .from('purchase_offers')
      .update({ stripe_session_id: session.id })
      .eq('id', offer.id)

    return new Response(
      JSON.stringify({ url: session.url }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
