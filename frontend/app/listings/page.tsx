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

export default function ListingsPage() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchListings = async () => {
      const supabase = createClient();
      if (!supabase) return;

      const { data, error } = await supabase
        .from('listings')
        .select(`
          id, title, price_min, price_max, cover_photo_url,
          seller:profiles!listings_seller_id_fkey(username, reputation_score),
          items:listing_items(id)
        `)
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      if (data) {
        const formatted = data.map((d: any) => ({
          ...d,
          item_count: d.items ? d.items.length : 0
        }));
        setListings(formatted);
      }
      setLoading(false);
    };

    fetchListings();
  }, []);

  return (
    <>
      <Nav />
      <div className="section" style={{ minHeight: '60vh' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div className="section-hd-title" style={{ fontSize: 24, margin: 0 }}>Marketplace Listings</div>
          <Link href="/listings/new" className="nav-sell" style={{ textDecoration: 'none', display: 'inline-block' }}>
            Create Listing
          </Link>
        </div>

        <div style={{ display: 'flex', gap: 16, marginBottom: 24, borderBottom: '1px solid #e5e5e5', paddingBottom: 16 }}>
          <Link href="/auctions" style={{ fontSize: 14, color: '#777', textDecoration: 'none', fontWeight: 600 }}>Individual Cards</Link>
          <Link href="/listings" style={{ fontSize: 14, color: '#111', textDecoration: 'none', fontWeight: 700, borderBottom: '2px solid #111', paddingBottom: 16, marginBottom: -17 }}>Collections & Lots</Link>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '80px 0', color: '#aaa', fontSize: 13 }}>Loading listings...</div>
        ) : listings.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 0' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#333', marginBottom: 8 }}>No active listings</div>
            <div style={{ fontSize: 13, color: '#888' }}>Be the first to create a listing!</div>
          </div>
        ) : (
          <div className="catalog-grid">
            {listings.map(listing => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </div>
        )}
      </div>
      <Footer />
    </>
  );
}
