import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { ethers } from "https://esm.sh/ethers@6?target=deno"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const ERC20_ABI = [
  "function transfer(address to, uint256 value) returns (bool)"
]

const USDC_ADDRESS = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const rpcUrl = Deno.env.get('POLYGON_RPC_URL') || 'https://polygon-rpc.com'
    const merchantPrivateKey = Deno.env.get('MERCHANT_PRIVATE_KEY')!

    const { trade_id } = await req.json()

    if (!trade_id) {
      return new Response(JSON.stringify({ error: 'trade_id is required' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // 1. Fetch the trade
    const { data: trade, error: tradeErr } = await supabase
      .from('trade_offers')
      .select('*')
      .eq('id', trade_id)
      .single()

    if (tradeErr || !trade) {
      return new Response(JSON.stringify({ error: 'Trade not found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 404,
      })
    }

    // 2. Both parties must have confirmed receipt
    if (!trade.initiator_confirmed || !trade.recipient_confirmed) {
      return new Response(JSON.stringify({ error: 'Both parties must confirm receipt before funds can be released' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    // 3. Determine the release amount (both deposits + any cash)
    const depositAmount = trade.deposit_amount || 0
    const cashAmount = trade.cash_amount || 0
    const releaseTotal = depositAmount * 2 + cashAmount

    if (releaseTotal <= 0) {
      await supabase.from('trade_offers').update({ status: 'completed' }).eq('id', trade_id)
      return new Response(
        JSON.stringify({ success: true, message: 'No funds to release', status: 'completed' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    // 4. Look up the seller's polygon_wallet from profiles
    const sellerId = trade.recipient_id
    const { data: sellerProfile } = await supabase
      .from('profiles')
      .select('polygon_wallet')
      .eq('id', sellerId)
      .single()

    if (!sellerProfile?.polygon_wallet) {
      return new Response(
        JSON.stringify({ error: 'Seller has no Polygon wallet on file. They must set a wallet address in their profile before funds can be released.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // 5. Transfer USDC from merchant wallet to seller
    const provider = new ethers.JsonRpcProvider(rpcUrl)
    const wallet = new ethers.Wallet(merchantPrivateKey, provider)
    const usdc = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, wallet)

    const releaseUnits = BigInt(Math.round(releaseTotal * 1e6))
    const tx = await usdc.transfer(sellerProfile.polygon_wallet, releaseUnits)
    const receipt = await tx.wait()

    // 6. Mark trade as completed with the release txn hash
    await supabase
      .from('trade_offers')
      .update({ status: 'completed', release_txn_hash: receipt.hash })
      .eq('id', trade_id)

    return new Response(
      JSON.stringify({ success: true, txn_hash: receipt.hash, status: 'completed' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
