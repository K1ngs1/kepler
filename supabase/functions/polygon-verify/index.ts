import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { ethers } from "https://esm.sh/ethers@6?target=deno"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const USDC_ABI = [
  "event Transfer(address indexed from, address indexed to, uint256 value)"
]

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const rpcUrl = Deno.env.get('POLYGON_RPC_URL') || 'https://polygon-rpc.com'
    const merchantWallet = Deno.env.get('MERCHANT_WALLET')!
    const chainEnv = Deno.env.get('CHAIN') || 'amoy'
    const usdcAddress = chainEnv === 'polygon'
      ? '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359'
      : '0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582'

    const { purchase_offer_id, txn_hash } = await req.json()

    if (!purchase_offer_id || !txn_hash) {
      return new Response(JSON.stringify({ error: 'purchase_offer_id and txn_hash are required' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    // Use service role to bypass RLS for verification
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // 1. Get the purchase offer
    const { data: offer, error: offerErr } = await supabase
      .from('purchase_offers')
      .select('*')
      .eq('id', purchase_offer_id)
      .single()

    if (offerErr || !offer) {
      return new Response(JSON.stringify({ error: 'Purchase offer not found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 404,
      })
    }

    if (offer.status !== 'pending') {
      return new Response(JSON.stringify({ error: 'Offer is not in pending state' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    // 2. Verify the transaction on-chain
    const provider = new ethers.JsonRpcProvider(rpcUrl)
    const receipt = await provider.getTransactionReceipt(txn_hash)

    if (!receipt || receipt.status !== 1) {
      return new Response(JSON.stringify({ error: 'Transaction not confirmed or failed' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    // 3. Parse USDC Transfer events from the receipt
    const iface = new ethers.Interface(USDC_ABI)
    let verified = false
    const expectedAmount = BigInt(Math.round(offer.amount * 1e6)) // USDC has 6 decimals

    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== usdcAddress.toLowerCase()) continue
      try {
        const parsed = iface.parseLog({ topics: log.topics as string[], data: log.data })
        if (
          parsed &&
          parsed.name === 'Transfer' &&
          parsed.args.to.toLowerCase() === merchantWallet.toLowerCase() &&
          parsed.args.value >= expectedAmount
        ) {
          verified = true
          break
        }
      } catch {
        // Not a Transfer event from USDC, skip
      }
    }

    if (!verified) {
      return new Response(JSON.stringify({ error: 'Transaction does not contain a valid USDC transfer to the merchant wallet for the expected amount' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    // 4. Update the purchase offer
    const { error: updateErr } = await supabase
      .from('purchase_offers')
      .update({
        status: 'paid',
        payment_txn_hash: txn_hash,
      })
      .eq('id', purchase_offer_id)

    if (updateErr) {
      return new Response(JSON.stringify({ error: 'Failed to update offer: ' + updateErr.message }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      })
    }

    return new Response(
      JSON.stringify({ success: true, status: 'paid' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
