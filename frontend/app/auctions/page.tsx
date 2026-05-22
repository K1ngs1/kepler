'use client';

import { useState, useEffect } from 'react';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import ListingCard from '@/components/ListingCard';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';

interface Listing {
  id: string;
  title: string;
  price_min: number | null;
  price_max: number | null;
  cover_photo_url: string | null;
  seller: { username: string | null; reputation_score: number | null } | null;
  item_count: number;
}

export default function AuctionsPage() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      if (!supabase) { setLoading(false); return; }

      const { data } = await supabase
        .from('listings')
        .select(`
          id, title, price_min, price_max, cover_photo_url,
          seller:profiles!listings_seller_id_fkey(username, reputation_score),
          items:listing_items(id)
        `)
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      if (data) {
        setListings(data.map((d: any) => ({
          ...d,
          item_count: d.items ? d.items.length : 0,
        })));
      }
      setLoading(false);
    })();
  }, []);

  const filtered = listings.filter((l) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return l.title.toLowerCase().includes(q) ||
      (l.seller?.username ?? '').toLowerCase().includes(q);
  });

  return (
    <>
      <Nav />
      <div className="section" style={{ minHeight: '60vh' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div className="listing-title">Listings</div>
          <Link href="/listings/new" className="nav-sell" style={{ textDecoration: 'none', display: 'inline-block' }}>
            Create Listing
          </Link>
        </div>

        <div className="listing-toolbar" style={{ marginBottom: 20 }}>
          <div className="toolbar-search">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="7" cy="7" r="5" /><path d="M11 11l3 3" /></svg>
            <input placeholder="Search listings or users…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          {!loading && (
            <span style={{ fontSize: 12, color: '#888', whiteSpace: 'nowrap' }}>
              {filtered.length} listing{filtered.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '80px 0', color: '#aaa', fontSize: 13 }}>
            Loading listings…
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 0' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#333', marginBottom: 8 }}>
              {listings.length === 0 ? 'No active listings' : 'No listings match your search'}
            </div>
            <div style={{ fontSize: 13, color: '#888', marginBottom: 24 }}>
              {listings.length === 0 ? 'Be the first to post your cards!' : 'Try adjusting your search.'}
            </div>
            {listings.length === 0 && (
              <Link href="/listings/new" style={{ background: '#111', color: '#fff', borderRadius: 5, padding: '10px 24px', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
                Create Listing
              </Link>
            )}
          </div>
        ) : (
          <div className="catalog-grid">
            {filtered.map((listing) => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </div>
        )}
      </div>
      <Footer />
    </>
  );
}
