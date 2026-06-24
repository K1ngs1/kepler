import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { ethers } from "https://esm.sh/ethers@6?target=deno"

// Restrict to the app origin in production via ALLOWED_ORIGIN; default '*'
// keeps local/dev usable.
const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') || '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  })

// USDC ERC-20 Transfer event signature
const USDC_ABI = ["event Transfer(address indexed from, address indexed to, uint256 value)"]

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
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const rpcUrl = Deno.env.get('POLYGON_RPC_URL') || 'https://polygon-rpc.com'
    const merchantWallet = Deno.env.get('MERCHANT_WALLET')!

    // ── 0. Authenticate the caller (verify_jwt=true guarantees a valid JWT;
    //       we still need the user id to authorize against the trade). ──
    const authHeader = req.headers.get('Authorization') || ''
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: userErr } = await userClient.auth.getUser()
    if (userErr || !user) {
      return json({ error: 'Unauthorized' }, 401)
    }

    const { trade_id, tx_hash } = await req.json()
    if (!trade_id || !tx_hash) {
      return json({ error: 'trade_id and tx_hash are required' }, 400)
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // ── 1. Fetch the trade offer ──
    const { data: trade, error: tradeErr } = await supabase
      .from('trade_offers')
      .select('id, initiator_id, offer_type, cash_amount, payment_status, payment_txn_hash')
      .eq('id', trade_id)
      .single()

    if (tradeErr || !trade) {
      return json({ error: 'Trade offer not found' }, 404)
    }

    // ── 2. Authorize: only the payer (initiator) may verify a payment ──
    if (trade.initiator_id !== user.id) {
      return json({ error: 'Only the offer initiator can record a payment.' }, 403)
    }

    // Idempotent: already verified for this same tx is a success.
    if (trade.payment_status === 'verified' || trade.payment_status === 'paid') {
      return json({ success: true, status: trade.payment_status })
    }

    // Only money-carrying offers require a payment.
    const cashAmount = Number(trade.cash_amount || 0)
    if (trade.offer_type !== 'purchase' && cashAmount <= 0) {
      return json({ error: 'This offer does not require a payment.' }, 400)
    }

    // ── 3. Replay protection: reject a tx hash already used elsewhere ──
    const { data: dupe } = await supabase
      .from('trade_offers')
      .select('id')
      .eq('payment_txn_hash', tx_hash)
      .maybeSingle()
    if (dupe && dupe.id !== trade_id) {
      return json({ error: 'This transaction has already been used for another offer.' }, 409)
    }

    // ── 4. Verify the on-chain transaction ──
    const provider = new ethers.JsonRpcProvider(rpcUrl)
    const receipt = await provider.getTransactionReceipt(tx_hash)
    if (!receipt || receipt.status !== 1) {
      return json({ error: 'Transaction not confirmed or reverted' }, 400)
    }

    // ── 5. A USDC Transfer to the merchant wallet for >= the owed amount ──
    const iface = new ethers.Interface(USDC_ABI)
    const expectedAmount = BigInt(Math.round(cashAmount * 1e6)) // USDC 6 decimals
    let verified = false
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
        // Not a matching Transfer event — skip
      }
    }

    if (!verified) {
      return json({ error: 'No valid USDC transfer to the merchant wallet was found in this transaction.' }, 400)
    }

    // ── 6. Record the verified payment (service role; the DB trigger blocks
    //       this column for end users, so this is the only sanctioned path). ──
    const { error: updateErr } = await supabase
      .from('trade_offers')
      .update({ payment_status: 'verified', payment_txn_hash: tx_hash })
      .eq('id', trade_id)

    if (updateErr) {
      return json({ error: 'Failed to record payment: ' + updateErr.message }, 500)
    }

    return json({ success: true, status: 'verified' })
  } catch (error) {
    return json({ error: (error as Error).message }, 500)
  }
})
