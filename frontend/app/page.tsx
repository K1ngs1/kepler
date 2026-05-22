import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import ListingCard from '@/components/ListingCard';
import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';

export const revalidate = 60;

interface Listing {
  id: string;
  title: string;
  price_min: number | null;
  price_max: number | null;
  cover_photo_url: string | null;
  seller: { username: string | null; reputation_score: number | null } | null;
  item_count: number;
}

export default async function HomePage() {
  let listings: Listing[] = [];

  try {
    const supabase = createClient();

    const { data } = await supabase
      .from('listings')
      .select(`
        id, title, price_min, price_max, cover_photo_url,
        seller:profiles!listings_seller_id_fkey(username, reputation_score),
        items:listing_items(id)
      `)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(12);

    if (data) {
      listings = data.map((d: any) => ({
        ...d,
        item_count: d.items ? d.items.length : 0,
      }));
    }
  } catch {
    // Supabase not configured — show empty state
  }

  return (
    <>
      <Nav />


      {/* Recent Listings feed */}
      <div className="section" style={{ minHeight: '50vh' }}>
        <div className="section-hd">
          <div className="section-hd-title">Recent Listings</div>
          <Link href="/listings" className="section-hd-link">View All →</Link>
        </div>

        {listings.length > 0 ? (
          <div className="catalog-grid">
            {listings.map((listing) => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <div style={{ fontSize: 38, marginBottom: 14 }}>📦</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#333', marginBottom: 8 }}>
              No listings yet
            </div>
            <div style={{ fontSize: 13, color: '#888', marginBottom: 24 }}>
              Be the first to post your cards for trade or sale!
            </div>
            <Link
              href="/listings/new"
              style={{ background: '#111', color: '#fff', borderRadius: 5, padding: '10px 24px', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}
            >
              Create Listing
            </Link>
          </div>
        )}
      </div>

      <Footer />
    </>
  );
}
