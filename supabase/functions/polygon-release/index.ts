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

// A single USDC payout to one party. amount is in whole USDC (6-decimal).
interface Payout { userId: string; amount: number }

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
      .select('id, initiator_id, recipient_id, offer_type, cash_amount, deposit_amount, payment_status, initiator_confirmed, recipient_confirmed, initiator_deposit_locked, recipient_deposit_locked, dispute_resolution')
      .eq('id', trade_id)
      .single()

    if (tradeErr || !trade) {
      return json({ error: 'Trade not found' }, 404)
    }

    // A resolved dispute carries a dispute_resolution; a normal completion
    // does not. The two paths differ in who gets paid and whether mutual
    // confirmation is required.
    const resolution: string | null = trade.dispute_resolution || null
    const isDispute = !!resolution

    // ── 2. Normal completions require both parties to have confirmed receipt.
    //       A dispute is adjudicated by an admin, so it bypasses this gate. ──
    if (!isDispute && (!trade.initiator_confirmed || !trade.recipient_confirmed)) {
      return json({ error: 'Both parties must confirm receipt before funds can be released' }, 400)
    }

    // ── 3. Determine what is actually held in escrow ──
    const cashAmount = Number(trade.cash_amount || 0)
    const depositAmount = Number(trade.deposit_amount || 0)
    const requiresPayment = trade.offer_type === 'purchase' || cashAmount > 0
    const cashEscrowed = ['paid', 'verified'].includes(trade.payment_status || '')

    // For a normal completion the buyer's cash must have been escrowed.
    // For a dispute we move whatever is actually present, so unpaid cash is
    // simply treated as zero rather than blocking the resolution.
    if (!isDispute && requiresPayment && !cashEscrowed) {
      return json({ error: 'Cannot release funds: payment was never escrowed.' }, 400)
    }

    // Only count money that genuinely landed in the merchant wallet.
    const escrowedCash = cashEscrowed ? cashAmount : 0
    const initiatorDeposit = trade.initiator_deposit_locked ? depositAmount : 0
    const recipientDeposit = trade.recipient_deposit_locked ? depositAmount : 0
    const bothDeposits = initiatorDeposit + recipientDeposit

    // ── 4. Build the payout plan ──
    //   release_to_recipient / normal completion → seller takes everything
    //   release_to_initiator                     → buyer is made whole
    //   refund_both                              → each party gets their own
    let payouts: Payout[]
    if (resolution === 'refund_both') {
      payouts = [
        { userId: trade.initiator_id, amount: escrowedCash + initiatorDeposit },
        { userId: trade.recipient_id, amount: recipientDeposit },
      ]
    } else if (resolution === 'release_to_initiator') {
      payouts = [{ userId: trade.initiator_id, amount: escrowedCash + bothDeposits }]
    } else {
      // release_to_recipient or a normal (non-dispute) completion
      payouts = [{ userId: trade.recipient_id, amount: escrowedCash + bothDeposits }]
    }
    payouts = payouts.filter((p) => p.amount > 0)

    // ── 5. Atomically claim the release. The conditional update succeeds for
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

    // Nothing to move (e.g. a pure card swap with no deposits) — finalize.
    if (payouts.length === 0) {
      await supabase.from('trade_offers').update({ status: 'completed' }).eq('id', trade_id)
      return json({ success: true, message: 'No funds to release', status: 'completed' })
    }

    // ── 6. Resolve each payee's wallet up front. If any is missing, release
    //       the claim so the webhook can be retried once they add a wallet,
    //       and abort before sending anything. ──
    const resolved: { to: string; amount: number }[] = []
    for (const p of payouts) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('polygon_wallet')
        .eq('id', p.userId)
        .single()
      if (!profile?.polygon_wallet) {
        await supabase.from('trade_offers').update({ release_claimed_at: null }).eq('id', trade_id)
        return json({
          error: 'A payout recipient has no Polygon wallet on file. They must set a wallet address in their profile before funds can be released.',
        }, 400)
      }
      resolved.push({ to: profile.polygon_wallet, amount: p.amount })
    }

    // ── 7. Transfer USDC from the merchant wallet to each payee. Transfers
    //       run sequentially so nonces order correctly. If one fails partway,
    //       the claim is intentionally left in place (see catch) — funds are
    //       never double-sent; the remainder is reconciled manually. ──
    const provider = new ethers.JsonRpcProvider(rpcUrl)
    const wallet = new ethers.Wallet(merchantPrivateKey, provider)
    const usdc = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, wallet)

    const hashes: string[] = []
    for (const r of resolved) {
      const units = BigInt(Math.round(r.amount * 1e6))
      const tx = await usdc.transfer(r.to, units)
      const receipt = await tx.wait()
      hashes.push(receipt.hash)
    }

    // ── 8. Record the release ──
    await supabase
      .from('trade_offers')
      .update({ status: 'completed', release_txn_hash: hashes.join(',') })
      .eq('id', trade_id)

    return json({ success: true, txn_hash: hashes.join(','), status: 'completed' })
  } catch (error) {
    // The claim is intentionally left in place on a transfer failure so funds
    // are never double-sent; this requires manual reconciliation.
    return json({ error: (error as Error).message }, 500)
  }
})
