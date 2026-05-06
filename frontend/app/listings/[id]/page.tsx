'use client';

import { useState, useEffect } from 'react';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import ListingPhotoGallery from '@/components/ListingPhotoGallery';
import BuyNowModal from '@/components/BuyNowModal';
import PriceBadge from '@/components/PriceBadge';
import { createClient } from '@/lib/supabase/client';
import { usePrices } from '@/lib/usePrices';
import { useParams, useRouter } from 'next/navigation';

interface ListingItem {
  id: string;
  catalog_card_id: string;
  condition: string;
  custom_price: number | null;
  catalog_cards: {
    name: string;
    set_name: string;
    image_url: string | null;
  };
}

interface Listing {
  id: string;
  title: string;
  description: string;
  price_min: number | null;
  price_max: number | null;
  pricing_mode: 'market' | 'custom';
  trade_preferences: string | null;
  seller_id: string;
  seller: { username: string | null; reputation_score: number | null } | null;
  items: ListingItem[];
  photos: string[];
}

function StarDisplay({ score }: { score: number | null }) {
  if (!score || score === 0) return null;
  return (
    <span style={{ fontSize: 11, color: '#888', display: 'inline-flex', alignItems: 'center', gap: 2 }}>
      {'★'.repeat(Math.round(score))}{'☆'.repeat(5 - Math.round(score))}
      <span style={{ marginLeft: 2 }}>{score}</span>
    </span>
  );
}

export default function ListingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [buyModalOpen, setBuyModalOpen] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase || !id) return;

    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setUserId(data.user.id);
    });

    const fetchListing = async () => {
      const { data: listingData, error } = await supabase
        .from('listings')
        .select(`
          *,
          seller:profiles!listings_seller_id_fkey(username, reputation_score)
        `)
        .eq('id', id)
        .single();
        
      if (error || !listingData) {
        setLoading(false);
        return;
      }

      const { data: itemsData } = await supabase
        .from('listing_items')
        .select('id, catalog_card_id, condition, custom_price, catalog_cards(name, set_name, image_url)')
        .eq('listing_id', id);

      const { data: photosData } = await supabase
        .from('listing_photos')
        .select('url')
        .eq('listing_id', id)
        .order('sort_order', { ascending: true });

      const photos = photosData?.map(p => p.url) || [];
      if (listingData.cover_photo_url && !photos.includes(listingData.cover_photo_url)) {
        photos.unshift(listingData.cover_photo_url);
      }

      setListing({
        ...listingData,
        items: itemsData || [],
        photos,
        seller: listingData.seller,
      });
      setLoading(false);
    };

    fetchListing();
  }, [id]);

  const catalogIds = listing?.items.map(i => i.catalog_card_id) || [];
  const prices = usePrices(catalogIds);

  if (loading) return <><Nav /><div style={{ textAlign: 'center', padding: '80px 0', color: '#aaa', fontSize: 13 }}>Loading…</div><Footer /></>;
  if (!listing) return <><Nav /><div style={{ textAlign: 'center', padding: '80px 0', color: '#888' }}>Listing not found.</div><Footer /></>;

  const isSeller = userId === listing.seller_id;

  return (
    <>
      <Nav />
      <div className="detail-breadcrumb">
        <button onClick={() => router.back()}>← Back</button>
      </div>

      <div className="detail-body">
        <ListingPhotoGallery photos={listing.photos} />

        <div className="detail-bid-col">
          <div className="detail-title" style={{ textAlign: 'left', marginLeft: 0, padding: 0 }}>
            {listing.title}
          </div>
          
          <div style={{ marginTop: 12, fontSize: 13, color: '#555' }}>
            Seller: <span style={{ fontWeight: 600, color: '#111' }}>{listing.seller?.username ?? 'Anonymous'}</span>
            <span style={{ marginLeft: 8 }}><StarDisplay score={listing.seller?.reputation_score ?? null} /></span>
          </div>

          <div style={{ marginTop: 16 }}>
            {listing.price_min != null || listing.price_max != null ? (
              <div className="bid-big-price">
                {listing.price_min != null && listing.price_max != null
                  ? listing.price_min === listing.price_max
                    ? `$${listing.price_min.toFixed(2)}`
                    : `$${listing.price_min.toFixed(2)} - $${listing.price_max.toFixed(2)}`
                  : listing.price_min != null
                  ? `From $${listing.price_min.toFixed(2)}`
                  : `Up to $${listing.price_max?.toFixed(2)}`}
              </div>
            ) : (
              <div className="bid-big-price" style={{ color: '#555', fontSize: 24 }}>Open to Offers</div>
            )}
            <div className="bid-premium-txt">Pricing Mode: {listing.pricing_mode === 'custom' ? 'Custom' : 'Market Values'}</div>
          </div>

          <div className="detail-action-btns" style={{ marginTop: 24 }}>
            {isSeller ? (
              <button className="btn-outline-ext" onClick={() => alert('Edit flow not implemented yet.')}>
                Edit Listing
              </button>
            ) : (
              <>
                <button className="btn-buy-now" onClick={() => setBuyModalOpen(true)}>
                  Buy Now
                </button>
                <button className="btn-trade-now" onClick={() => router.push(`/trades/new?fromListing=${listing.id}`)}>
                  Propose Trade
                </button>
              </>
            )}
          </div>

          <div className="detail-section">
            <div className="detail-section-title">Description</div>
            <div className="detail-section-text" style={{ whiteSpace: 'pre-wrap' }}>
              {listing.description || 'No description provided.'}
            </div>
          </div>

          {listing.trade_preferences && (
            <div className="detail-section" style={{ background: '#f7f7f7', padding: '12px 16px', borderRadius: 6 }}>
              <div className="detail-section-title" style={{ color: '#333' }}>Will Trade For</div>
              <div className="detail-section-text">{listing.trade_preferences}</div>
            </div>
          )}
        </div>
      </div>

      <div className="section" style={{ paddingTop: 0 }}>
        <div className="section-hd">
          <div className="section-hd-title">Included Cards ({listing.items.length})</div>
        </div>
        
        <div className="catalog-grid">
          {listing.items.map((item) => (
            <div key={item.id} className="catalog-card">
              <div className="catalog-card-img">
                {item.catalog_cards.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.catalog_cards.image_url} alt={item.catalog_cards.name} />
                ) : (
                  <div style={{ color: '#ccc', fontSize: 12 }}>No image</div>
                )}
              </div>
              <div className="catalog-card-body">
                <div className="catalog-card-name">{item.catalog_cards.name}</div>
                <div className="catalog-card-set">{item.catalog_cards.set_name}</div>
                <div style={{ fontSize: 11, color: '#555', marginBottom: 8 }}>
                  Condition: <strong>{item.condition}</strong>
                </div>
                {listing.pricing_mode === 'custom' && item.custom_price != null ? (
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#111' }}>
                    ${item.custom_price.toFixed(2)}
                  </div>
                ) : (
                  <PriceBadge price={prices[item.catalog_card_id]} />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <Footer />
      {buyModalOpen && (
        <BuyNowModal
          onClose={() => setBuyModalOpen(false)}
          listingId={listing.id}
          sellerId={listing.seller_id}
          items={listing.items}
          prices={prices}
        />
      )}
    </>
  );
}
