'use client';

import { useState, useEffect, useCallback } from 'react';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import ListingCard from '@/components/ListingCard';
import LoginModal from '@/components/LoginModal';
import ErrorState from '@/components/ErrorState';
import { createClient } from '@/lib/supabase/client';
import { handleError, friendlyMessage } from '@/lib/error-handler';
import { useRouter } from 'next/navigation';

const PAGE_SIZE = 24;

interface Listing {
  id: string;
  title: string;
  price_min: number | null;
  price_max: number | null;
  cover_photo_url: string | null;
  seller: { username: string | null; reputation_score: number | null } | null;
  item_count: number;
}

function SkeletonGrid() {
  return (
    <div className="catalog-grid" aria-busy="true" aria-label="Loading listings">
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} className="listing-card--skel" aria-hidden="true">
          <div className="listing-card--skel__img" />
          <div className="listing-card--skel__body">
            <div className="listing-card__skel-line listing-card__skel-line--title" />
            <div className="listing-card__skel-line listing-card__skel-line--sub" />
            <div className="listing-card__skel-line listing-card__skel-line--price" />
            <div className="listing-card__skel-line listing-card__skel-line--btn" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ListingsPage() {
  const router = useRouter();
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);
  const [showLoginModal, setShowLoginModal] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) return;
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setUserId(data.user.id);
    });
  }, []);

  const fetchListings = useCallback(async () => {
    setLoading(true);
    setError(null);
    const supabase = createClient();
    if (!supabase) {
      setError('The app is not configured correctly. Please try again later.');
      setLoading(false);
      return;
    }

    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const { data, count, error: queryError } = await supabase
      .from('listings')
      .select(`
        id, title, price_min, price_max, cover_photo_url,
        seller:profiles!listings_seller_id_fkey(username, reputation_score),
        items:listing_items(id)
      `, { count: 'exact' })
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .range(from, to);

    if (queryError) {
      setError(friendlyMessage(handleError(queryError, { where: 'listings.fetch', page })));
    } else if (data) {
      setListings(data.map((d: any) => ({
        ...d,
        item_count: d.items ? d.items.length : 0,
      })));
      if (count != null) setTotal(count);
    }
    setLoading(false);
  }, [page]);

  useEffect(() => {
    fetchListings();
  }, [fetchListings]);

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const showPagination = !loading && total > PAGE_SIZE;

  return (
    <>
      <Nav />
      <div className="section" style={{ minHeight: '60vh', paddingTop: 32 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h1 className="section-hd-title" style={{ fontSize: 24, margin: 0 }}>Marketplace Listings</h1>
          <button className="nav-sell" style={{ padding: '9px 22px', fontSize: 15 }} onClick={() => {
            if (!userId) { setShowLoginModal(true); return; }
            router.push('/listings/new');
          }}>
            Create Listing
          </button>
        </div>

        {loading ? (
          <SkeletonGrid />
        ) : error ? (
          <ErrorState message={error} onRetry={fetchListings} />
        ) : listings.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 0' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#333', marginBottom: 8 }}>No active listings</div>
            <div style={{ fontSize: 13, color: '#888' }}>Be the first to create a listing!</div>
          </div>
        ) : (
          <>
            <div className="catalog-grid">
              {listings.map(listing => (
                <ListingCard key={listing.id} listing={listing} />
              ))}
            </div>

            {showPagination && (
              <nav className="pagination" aria-label="Listings pagination">
                <button
                  className="pagination__btn"
                  onClick={() => setPage(p => p - 1)}
                  disabled={page === 0}
                  aria-label="Previous page"
                >
                  ← Previous
                </button>
                <span className="pagination__info">
                  Page {page + 1} of {totalPages}
                </span>
                <button
                  className="pagination__btn"
                  onClick={() => setPage(p => p + 1)}
                  disabled={page >= totalPages - 1}
                  aria-label="Next page"
                >
                  Next →
                </button>
              </nav>
            )}
          </>
        )}
      </div>
      <Footer />
      {showLoginModal && (
        <LoginModal
          onClose={() => setShowLoginModal(false)}
          onSuccess={() => {
            setShowLoginModal(false);
            router.push('/listings/new');
          }}
        />
      )}
    </>
  );
}
