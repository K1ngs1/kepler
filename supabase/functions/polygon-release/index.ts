import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { ethers } from "https://esm.sh/ethers@6?target=deno"

// This function moves real USDC out of the hot merchant wallet, so it is
// NOT browser-facing: it is invoked only by a Supabase Database Webhook on
// trade_offers completion, which is configured to send the shared
// RELEASE_WEBHOOK_SECRET. CORS is irrelevant for server-to-server calls.
const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') || 'null',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-release-secret',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  })

const ERC20_ABI = ["function transfer(address to, uint256 value) returns (bool)"]
// USDC contract for the active chain. Defaults to Polygon PoS native USDC;
// override via the USDC_ADDRESS secret for testnets (e.g. Amoy).
const USDC_ADDRESS = Deno.env.get('USDC_ADDRESS') || '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const rpcUrl = Deno.env.get('POLYGON_RPC_URL') || 'https://polygon-rpc.com'
    const merchantPrivateKey = Deno.env.get('MERCHANT_PRIVATE_KEY')!
    const releaseSecret = Deno.env.get('RELEASE_WEBHOOK_SECRET')!

    // ── 0. Authorize the caller via the shared webhook secret ──
    const provided = req.headers.get('x-release-secret') || ''
    if (!releaseSecret || provided !== releaseSecret) {
      return json({ error: 'Unauthorized' }, 401)
    }

    const { trade_id } = await req.json()
    if (!trade_id) {
      return json({ error: 'trade_id is required' }, 400)
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // ── 1. Fetch the trade ──
    const { data: trade, error: tradeErr } = await supabase
      .from('trade_offers')
      .select('id, recipient_id, offer_type, cash_amount, deposit_amount, payment_status, initiator_confirmed, recipient_confirmed')
      .eq('id', trade_id)
      .single()

    if (tradeErr || !trade) {
      return json({ error: 'Trade not found' }, 404)
    }

    // ── 2. Both parties must have confirmed receipt ──
    if (!trade.initiator_confirmed || !trade.recipient_confirmed) {
      return json({ error: 'Both parties must confirm receipt before funds can be released' }, 400)
    }

    // ── 3. Money-carrying offers must have been escrowed (paid in) ──
    const cashAmount = Number(trade.cash_amount || 0)
    const requiresPayment = trade.offer_type === 'purchase' || cashAmount > 0
    if (requiresPayment && !['paid', 'verified'].includes(trade.payment_status || '')) {
      return json({ error: 'Cannot release funds: payment was never escrowed.' }, 400)
    }

    // ── 4. Atomically claim the release. The conditional update succeeds for
    //       exactly one caller; concurrent/duplicate webhook deliveries get no
    //       row back and abort, so funds can never be released twice. ──
    const { data: claimed, error: claimErr } = await supabase
      .from('trade_offers')
      .update({ release_claimed_at: new Date().toISOString() })
      .eq('id', trade_id)
      .is('release_claimed_at', null)
      .select('id')
      .maybeSingle()

    if (claimErr) {
      return json({ error: 'Failed to claim release: ' + claimErr.message }, 500)
    }
    if (!claimed) {
      // Already claimed/released by a prior delivery — idempotent no-op.
      return json({ success: true, status: 'already_released' })
    }

    // ── 5. Determine the release amount (both deposits + any cash) ──
    const depositAmount = Number(trade.deposit_amount || 0)
    const releaseTotal = depositAmount * 2 + cashAmount

    if (releaseTotal <= 0) {
      await supabase.from('trade_offers').update({ status: 'completed' }).eq('id', trade_id)
      return json({ success: true, message: 'No funds to release', status: 'completed' })
    }

    // ── 6. Look up the seller's polygon_wallet ──
    const { data: sellerProfile } = await supabase
      .from('profiles')
      .select('polygon_wallet')
      .eq('id', trade.recipient_id)
      .single()

    if (!sellerProfile?.polygon_wallet) {
      // Release the claim so it can be retried once the seller adds a wallet.
      await supabase.from('trade_offers').update({ release_claimed_at: null }).eq('id', trade_id)
      return json({
        error: 'Seller has no Polygon wallet on file. They must set a wallet address in their profile before funds can be released.',
      }, 400)
    }

    // ── 7. Transfer USDC from the merchant wallet to the seller ──
    const provider = new ethers.JsonRpcProvider(rpcUrl)
    const wallet = new ethers.Wallet(merchantPrivateKey, provider)
    const usdc = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, wallet)

    const releaseUnits = BigInt(Math.round(releaseTotal * 1e6))
    const tx = await usdc.transfer(sellerProfile.polygon_wallet, releaseUnits)
    const receipt = await tx.wait()

    // ── 8. Record the release ──
    await supabase
      .from('trade_offers')
      .update({ status: 'completed', release_txn_hash: receipt.hash })
      .eq('id', trade_id)

    return json({ success: true, txn_hash: receipt.hash, status: 'completed' })
  } catch (error) {
    // The claim is intentionally left in place on a transfer failure so funds
    // are never double-sent; this requires manual reconciliation.
    return json({ error: (error as Error).message }, 500)
  }
})
