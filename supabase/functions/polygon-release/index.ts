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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const rpcUrl = Deno.env.get('POLYGON_RPC_URL') || 'https://polygon-rpc.com'
    const merchantPrivateKey = Deno.env.get('MERCHANT_PRIVATE_KEY')!
    const chainEnv = Deno.env.get('CHAIN') || 'amoy'
    const usdcAddress = chainEnv === 'polygon'
      ? '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359'
      : '0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582'

    const { trade_id } = await req.json()

    if (!trade_id) {
      return new Response(JSON.stringify({ error: 'trade_id is required' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // 1. Get the trade
    const { data: trade, error: tradeErr } = await supabase
      .from('trade_offers')
      .select(`
        *,
        listing:listings(seller_id),
        seller_profile:profiles!trade_offers_recipient_id_fkey(username)
      `)
      .eq('id', trade_id)
      .single()

    if (tradeErr || !trade) {
      return new Response(JSON.stringify({ error: 'Trade not found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 404,
      })
    }

    // 2. Verify both parties confirmed
    if (!trade.initiator_confirmed || !trade.recipient_confirmed) {
      return new Response(JSON.stringify({ error: 'Both parties must confirm receipt before release' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    // 3. Calculate the release amount
    // The deposit is the agreed deposit_amount from both parties
    const depositAmount = trade.deposit_amount || 0
    const cashAmount = trade.cash_amount || 0
    const releaseTotal = depositAmount * 2 + cashAmount // both deposits + cash to seller

    if (releaseTotal <= 0) {
      // Nothing to release on-chain, just update status
      const { error: updateErr } = await supabase
        .from('trade_offers')
        .update({ status: 'completed' })
        .eq('id', trade_id)

      return new Response(
        JSON.stringify({ success: true, message: 'No funds to release', status: 'completed' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    // 4. Determine the seller's wallet address
    // For now, the recipient is the seller (listing owner). Their wallet can be stored on profile.
    // As MVP, we release to the merchant wallet itself (the seller must claim manually).
    // A future version would look up the seller's registered wallet address.
    // For this MVP we just mark the trade completed and store the release txn.

    const provider = new ethers.JsonRpcProvider(rpcUrl)
    const wallet = new ethers.Wallet(merchantPrivateKey, provider)
    const usdc = new ethers.Contract(usdcAddress, ERC20_ABI, wallet)

    // Release funds: transfer from merchant wallet to the seller
    // In a real scenario, seller_wallet would be fetched from profiles.
    // For MVP, we demonstrate the pattern but note the seller address is needed.
    const sellerId = trade.recipient_id // seller is the recipient in listing-based trades
    const { data: sellerProfile } = await supabase
      .from('profiles')
      .select('wallet_address')
      .eq('id', sellerId)
      .single()

    // If the seller doesn't have a wallet address, we can't release
    if (!sellerProfile?.wallet_address) {
      // Just mark completed without on-chain release
      await supabase
        .from('trade_offers')
        .update({ status: 'completed' })
        .eq('id', trade_id)

      return new Response(
        JSON.stringify({ success: true, message: 'Trade completed. Seller has no wallet on file — manual release needed.', status: 'completed' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    const releaseAmountUnits = BigInt(Math.round(releaseTotal * 1e6))
    const tx = await usdc.transfer(sellerProfile.wallet_address, releaseAmountUnits)
    const receipt = await tx.wait()

    // 5. Update trade
    await supabase
      .from('trade_offers')
      .update({
        status: 'completed',
        release_txn_hash: receipt.hash,
      })
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
