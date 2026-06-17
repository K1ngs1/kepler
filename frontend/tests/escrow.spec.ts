import { test, expect, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * End-to-end coverage for the escrow gate on money-carrying offers
 * (migration 018 + the listing-page gating).
 *
 * The on-chain USDC signature cannot run headlessly, so the payment landing is
 * simulated by the exact same DB update PaymentModal makes once the tx confirms
 * (trade_offers.payment_status = 'paid'). Everything else is real: real users,
 * a real accepted offer, the real complete_trade RPC, and the real UI.
 *
 * Seeding/teardown uses a service-role client. The test self-skips when
 * SUPABASE_SERVICE_ROLE_KEY is absent (e.g. local runs without the secret).
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const PASSWORD = 'escrow-test-pw-123!';
const CASH = 42;

let admin: SupabaseClient;
let buyerId: string;
let sellerId: string;
let buyerEmail: string;
let sellerEmail: string;
let listingId: string;
let offerId: string;

test.describe.serial('escrow gate on accepted offers', () => {
  test.skip(!SERVICE_ROLE_KEY, 'Requires SUPABASE_SERVICE_ROLE_KEY to seed/teardown test data.');

  test.beforeAll(async () => {
    admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const stamp = Date.now();
    buyerEmail = `escrow-buyer-${stamp}@kepler-test.dev`;
    sellerEmail = `escrow-seller-${stamp}@kepler-test.dev`;

    // Creating auth users fires the handle_new_user trigger, which seeds profiles.
    const buyer = await admin.auth.admin.createUser({ email: buyerEmail, password: PASSWORD, email_confirm: true });
    if (buyer.error) throw buyer.error;
    buyerId = buyer.data.user.id;

    const seller = await admin.auth.admin.createUser({ email: sellerEmail, password: PASSWORD, email_confirm: true });
    if (seller.error) throw seller.error;
    sellerId = seller.data.user.id;

    const listing = await admin
      .from('listings')
      .insert({ seller_id: sellerId, title: 'Escrow E2E Lot', description: 'seeded by escrow.spec', status: 'active' })
      .select('id')
      .single();
    if (listing.error) throw listing.error;
    listingId = listing.data.id;

    // An accepted, UNPAID purchase offer — the exact state the gate must catch.
    const offer = await admin
      .from('trade_offers')
      .insert({
        initiator_id: buyerId,
        recipient_id: sellerId,
        listing_id: listingId,
        offer_type: 'purchase',
        status: 'accepted',
        cash_amount: CASH,
        payment_status: null,
        requested_listing_item_ids: [],
      })
      .select('id')
      .single();
    if (offer.error) throw offer.error;
    offerId = offer.data.id;
  });

  test.afterAll(async () => {
    if (!SERVICE_ROLE_KEY) return;
    if (offerId) await admin.from('trade_offers').delete().eq('id', offerId);
    if (listingId) await admin.from('listings').delete().eq('id', listingId);
    if (buyerId) await admin.auth.admin.deleteUser(buyerId);
    if (sellerId) await admin.auth.admin.deleteUser(sellerId);
  });

  test('complete_trade is BLOCKED while the purchase is unpaid', async () => {
    const buyer = await signedInClient(buyerEmail, PASSWORD);
    const { error } = await buyer.rpc('complete_trade', { p_trade_id: offerId });
    expect(error, 'unpaid completion must be rejected by the DB').not.toBeNull();
    expect(error!.message).toMatch(/escrow/i);
  });

  test('buyer sees Pay Now and NO Confirm Receipt while unpaid', async ({ page }) => {
    await loginViaUI(page, buyerEmail, PASSWORD);
    await page.goto(`/listings/${listingId}`);

    await expect(page.getByRole('button', { name: /Pay Now/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Confirm Receipt' })).toHaveCount(0);
  });

  test('authenticated buyer CANNOT self-declare payment (migration 020 trigger)', async () => {
    // The old client-side "set payment_status='paid'" path is now a fund-theft
    // vector and must be rejected at the DB level for end users.
    const buyer = await signedInClient(buyerEmail, PASSWORD);
    const { error } = await buyer
      .from('trade_offers')
      .update({ payment_status: 'paid', payment_txn_hash: '0xfakeselfdeclared' })
      .eq('id', offerId);
    expect(error, 'the DB trigger must reject a client-set payment_status').not.toBeNull();
    expect(error!.message).toMatch(/server-managed|cannot be set/i);
  });

  test('funding escrow (server-side) unlocks Confirm Receipt and allows completion', async ({ page }) => {
    // polygon-verify is the only sanctioned writer of payment_status and runs as
    // the service role. Simulate its post-verification DB write.
    const { error: payErr } = await admin
      .from('trade_offers')
      .update({ payment_status: 'verified', payment_txn_hash: '0xverifiedtest' })
      .eq('id', offerId);
    expect(payErr, 'service role records the verified payment').toBeNull();

    // UI now reflects the funded state.
    await loginViaUI(page, buyerEmail, PASSWORD);
    await page.goto(`/listings/${listingId}`);
    await expect(page.getByRole('button', { name: 'Confirm Receipt' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Pay Now/ })).toHaveCount(0);

    // And the DB now accepts the confirmation.
    const buyer = await signedInClient(buyerEmail, PASSWORD);
    const { error } = await buyer.rpc('complete_trade', { p_trade_id: offerId });
    expect(error, 'funded completion should succeed').toBeNull();
  });
});

/** A supabase-js client authenticated as the given user (independent of the browser). */
async function signedInClient(email: string, password: string): Promise<SupabaseClient> {
  const client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return client;
}

/** Drive the real login modal so the browser holds an authenticated session. */
async function loginViaUI(page: Page, email: string, password: string) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Login' }).click();
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  // Modal closes on success — the Login trigger disappears.
  await expect(page.getByRole('button', { name: 'Login' })).toHaveCount(0);
}
