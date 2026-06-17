import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Row-Level-Security negative tests: prove a user who is NOT party to a trade
 * cannot read or mutate it, and that listings can only be created as oneself.
 *
 * Pure DB-level (no browser). Seeding/teardown uses a service-role client and
 * the suite self-skips when SUPABASE_SERVICE_ROLE_KEY is absent.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const PASSWORD = 'rls-test-pw-123!';

let admin: SupabaseClient;
let buyerId: string;
let sellerId: string;
let outsiderId: string;
let outsiderEmail: string;
let listingId: string;
let offerId: string;

test.describe.serial('RLS isolation', () => {
  test.skip(!SERVICE_ROLE_KEY, 'Requires SUPABASE_SERVICE_ROLE_KEY to seed/teardown test data.');

  test.beforeAll(async () => {
    admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const stamp = Date.now();
    const mk = async (role: string) => {
      const email = `rls-${role}-${stamp}@kepler-test.dev`;
      const u = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
      if (u.error) throw u.error;
      return { id: u.data.user.id, email };
    };

    const buyer = await mk('buyer');
    const seller = await mk('seller');
    const outsider = await mk('outsider');
    buyerId = buyer.id;
    sellerId = seller.id;
    outsiderId = outsider.id;
    outsiderEmail = outsider.email;

    const listing = await admin
      .from('listings')
      .insert({ seller_id: sellerId, title: 'RLS E2E Lot', description: 'seeded by rls.spec', status: 'active' })
      .select('id')
      .single();
    if (listing.error) throw listing.error;
    listingId = listing.data.id;

    const offer = await admin
      .from('trade_offers')
      .insert({
        initiator_id: buyerId,
        recipient_id: sellerId,
        listing_id: listingId,
        offer_type: 'purchase',
        status: 'accepted',
        cash_amount: 10,
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
    for (const id of [buyerId, sellerId, outsiderId]) {
      if (id) await admin.auth.admin.deleteUser(id);
    }
  });

  test('a non-participant cannot read the trade offer', async () => {
    const outsider = await signedInClient(outsiderEmail, PASSWORD);
    const { data, error } = await outsider.from('trade_offers').select('id').eq('id', offerId);
    // RLS filters the row out: no error, just an empty result set.
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  test('a non-participant cannot update the trade offer', async () => {
    const outsider = await signedInClient(outsiderEmail, PASSWORD);
    await outsider.from('trade_offers').update({ status: 'cancelled' }).eq('id', offerId);

    // The update matched no visible row — confirm the real value is unchanged.
    const { data } = await admin.from('trade_offers').select('status').eq('id', offerId).single();
    expect(data?.status).toBe('accepted');
  });

  test('a user can create a listing as themselves but not as another user', async () => {
    const outsider = await signedInClient(outsiderEmail, PASSWORD);

    const ownListing = await outsider
      .from('listings')
      .insert({ seller_id: outsiderId, title: 'My own listing', status: 'active' })
      .select('id')
      .single();
    expect(ownListing.error, 'creating a listing as oneself should succeed').toBeNull();
    if (ownListing.data?.id) await admin.from('listings').delete().eq('id', ownListing.data.id);

    const spoofed = await outsider
      .from('listings')
      .insert({ seller_id: sellerId, title: 'Spoofed listing', status: 'active' })
      .select('id')
      .single();
    expect(spoofed.error, 'creating a listing as someone else must be rejected by RLS').not.toBeNull();
  });
});

/** A supabase-js client authenticated as the given user. */
async function signedInClient(email: string, password: string): Promise<SupabaseClient> {
  const client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return client;
}
