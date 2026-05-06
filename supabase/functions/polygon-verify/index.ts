import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { ethers } from "https://esm.sh/ethers@6?target=deno"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// USDC ERC-20 Transfer event signature
const USDC_ABI = [
  "event Transfer(address indexed from, address indexed to, uint256 value)"
]

// Polygon native USDC
const USDC_ADDRESS = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const rpcUrl = Deno.env.get('POLYGON_RPC_URL') || 'https://polygon-rpc.com'
    const merchantWallet = Deno.env.get('MERCHANT_WALLET')!

    const { purchase_offer_id, tx_hash } = await req.json()

    if (!purchase_offer_id || !tx_hash) {
      return new Response(JSON.stringify({ error: 'purchase_offer_id and tx_hash are required' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // 1. Fetch the purchase offer
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

    // 2. Verify the on-chain transaction
    const provider = new ethers.JsonRpcProvider(rpcUrl)
    const receipt = await provider.getTransactionReceipt(tx_hash)

    if (!receipt || receipt.status !== 1) {
      return new Response(JSON.stringify({ error: 'Transaction not confirmed or reverted' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    // 3. Parse Transfer events and verify the USDC transfer targets the merchant wallet
    const iface = new ethers.Interface(USDC_ABI)
    let verified = false
    const expectedAmount = BigInt(Math.round(offer.amount * 1e6)) // USDC 6 decimals

    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== USDC_ADDRESS.toLowerCase()) continue
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
        // Not a matching event — skip
      }
    }

    if (!verified) {
      return new Response(JSON.stringify({ error: 'No valid USDC transfer to merchant wallet found in transaction' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    // 4. Mark the purchase offer as paid
    const { error: updateErr } = await supabase
      .from('purchase_offers')
      .update({ status: 'paid', payment_txn_hash: tx_hash })
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
