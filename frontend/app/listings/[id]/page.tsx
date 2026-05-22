'use client';

import { useState, useEffect, useCallback } from 'react';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import ListingPhotoGallery from '@/components/ListingPhotoGallery';
import BuyNowModal from '@/components/BuyNowModal';
import PaymentModal from '@/components/PaymentModal';
import ListingMessages from '@/components/ListingMessages';
import { createClient } from '@/lib/supabase/client';
import { useParams, useRouter } from 'next/navigation';
import { useAccount } from 'wagmi';

interface ListingItem {
  id: string;
  card_name: string;
  set_name: string | null;
  condition_text: string | null;
  custom_price: number | null;
}

interface PurchaseOffer {
  id: string;
  buyer_id: string;
  seller_id: string;
  amount: number;
  cards_wanted: string | null;
  status: string;
  created_at: string;
  buyer?: { username: string | null } | null;
}

interface Listing {
  id: string;
  title: string;
  description: string;
  price_min: number | null;
  price_max: number | null;
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

const STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  pending: { bg: '#fef9e7', text: '#b7950b', border: '#f0e1a0' },
  accepted: { bg: '#eafaf1', text: '#1a8c49', border: '#a3d9b1' },
  rejected: { bg: '#fdf0ef', text: '#c0392b', border: '#f5c6c2' },
  paid: { bg: '#eef6ff', text: '#2471a3', border: '#aed2f0' },
  completed: { bg: '#eafaf1', text: '#1a8c49', border: '#a3d9b1' },
  cancelled: { bg: '#f5f5f5', text: '#888', border: '#ddd' },
};

function OfferStatusBadge({ status }: { status: string }) {
  const colors = STATUS_COLORS[status] || STATUS_COLORS.pending;
  return (
    <span style={{
      display: 'inline-block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
      letterSpacing: 0.5, padding: '3px 10px', borderRadius: 999,
      background: colors.bg, color: colors.text, border: `1px solid ${colors.border}`,
    }}>
      {status}
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
  const [chatOpen, setChatOpen] = useState(false);
  const [offers, setOffers] = useState<PurchaseOffer[]>([]);
  const [payingOffer, setPayingOffer] = useState<PurchaseOffer | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const { isConnected, address } = useAccount();

  // Load offers for this listing
  const loadOffers = useCallback(async (uid: string) => {
    const supabase = createClient();
    if (!supabase || !id) return;

    const { data } = await supabase
      .from('purchase_offers')
      .select('id, buyer_id, seller_id, amount, cards_wanted, status, created_at, buyer:profiles!purchase_offers_buyer_id_fkey(username)')
      .eq('listing_id', id)
      .or(`buyer_id.eq.${uid},seller_id.eq.${uid}`)
      .order('created_at', { ascending: false });

    if (data) setOffers(data as unknown as PurchaseOffer[]);
  }, [id]);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase || !id) return;

    let offerSub: ReturnType<typeof supabase.channel> | null = null;

    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setUserId(data.user.id);
        loadOffers(data.user.id);

        // Subscribe to realtime offer changes
        offerSub = supabase.channel(`offers-${id}`)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'purchase_offers', filter: `listing_id=eq.${id}` },
            () => loadOffers(data.user!.id))
          .subscribe();
      }
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
        .select('id, card_name, set_name, condition_text, custom_price')
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

    return () => { offerSub?.unsubscribe(); };
  }, [id, loadOffers]);

  const handleAcceptOffer = async (offerId: string) => {
    if (!isConnected || !address) {
      setErrorMsg('Please connect your wallet first to receive crypto payments.');
      setTimeout(() => setErrorMsg(null), 4000);
      return;
    }

    setActionLoading(offerId);
    const supabase = createClient();
    if (!supabase) return;

    if (userId) {
      await supabase.from('profiles').update({ polygon_wallet: address }).eq('id', userId);
    }

    await supabase
      .from('purchase_offers')
      .update({ status: 'accepted', updated_at: new Date().toISOString() })
      .eq('id', offerId);

    if (userId) await loadOffers(userId);
    setActionLoading(null);
  };

  const handleRejectOffer = async (offerId: string) => {
    setActionLoading(offerId);
    const supabase = createClient();
    if (!supabase) return;

    await supabase
      .from('purchase_offers')
      .update({ status: 'rejected', updated_at: new Date().toISOString() })
      .eq('id', offerId);

    if (userId) await loadOffers(userId);
    setActionLoading(null);
  };

  const fmtDate = (s: string) =>
    new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

  if (loading) return <><Nav /><div style={{ textAlign: 'center', padding: '80px 0', color: '#aaa', fontSize: 13 }}>Loading…</div><Footer /></>;
  if (!listing) return <><Nav /><div style={{ textAlign: 'center', padding: '80px 0', color: '#888' }}>Listing not found.</div><Footer /></>;

  const isSeller = userId === listing.seller_id;
  const myOffers = offers.filter(o => o.buyer_id === userId);
  const incomingOffers = offers.filter(o => o.seller_id === userId && o.buyer_id !== userId);

  return (
    <>
      <Nav />
      {errorMsg && (
        <div style={{ position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)', background: '#c0392b', color: '#fff', padding: '11px 22px', borderRadius: 6, fontSize: 13.5, fontWeight: 500, zIndex: 1000, boxShadow: '0 4px 24px rgba(0,0,0,0.22)', whiteSpace: 'nowrap', pointerEvents: 'none' }}>
          {errorMsg}
        </div>
      )}
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
          </div>

          <div className="detail-action-btns" style={{ marginTop: 24 }}>
            {isSeller ? (
              <button className="btn-outline-ext" onClick={() => alert('Edit flow not implemented yet.')}>
                Edit Listing
              </button>
            ) : (
              <>
                <button className="btn-buy-now" onClick={() => setBuyModalOpen(true)}>
                  Make Offer
                </button>
              </>
            )}
          </div>
          
          {(isSeller || userId) && (
            <div style={{ marginTop: 8 }}>
              <button className="btn-message-seller" onClick={() => setChatOpen(true)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6 }}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                {isSeller ? 'View Messages' : `Message ${listing.seller?.username ?? 'Seller'}`}
              </button>
            </div>
          )}

          {/* ── SELLER: Incoming Offers ── */}
          {isSeller && incomingOffers.length > 0 && (
            <div style={{ marginTop: 24 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#111', marginBottom: 12 }}>
                Incoming Offers ({incomingOffers.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {incomingOffers.map((offer) => (
                  <div key={offer.id} className="offer-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#111' }}>
                          {offer.buyer?.username ?? 'Unknown Buyer'}
                        </div>
                        <div style={{ fontSize: 11, color: '#999' }}>{fmtDate(offer.created_at)}</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ fontSize: 16, fontWeight: 700, color: '#111' }}>
                          ${offer.amount.toFixed(2)}
                        </div>
                        <OfferStatusBadge status={offer.status} />
                      </div>
                    </div>

                    {offer.cards_wanted && (
                      <div style={{
                        fontSize: 12, color: '#555', background: '#f9f9f9', padding: '8px 10px',
                        borderRadius: 4, marginBottom: 10, whiteSpace: 'pre-wrap', lineHeight: 1.5,
                      }}>
                        {offer.cards_wanted}
                      </div>
                    )}

                    {offer.status === 'pending' && (
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          className="offer-accept-btn"
                          onClick={() => handleAcceptOffer(offer.id)}
                          disabled={actionLoading === offer.id}
                        >
                          {actionLoading === offer.id ? '…' : 'Accept'}
                        </button>
                        <button
                          className="offer-reject-btn"
                          onClick={() => handleRejectOffer(offer.id)}
                          disabled={actionLoading === offer.id}
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── BUYER: My Offers ── */}
          {!isSeller && myOffers.length > 0 && (
            <div style={{ marginTop: 24 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#111', marginBottom: 12 }}>
                Your Offers
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {myOffers.map((offer) => (
                  <div key={offer.id} className="offer-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: '#111' }}>
                        ${offer.amount.toFixed(2)}
                      </div>
                      <OfferStatusBadge status={offer.status} />
                    </div>

                    {offer.cards_wanted && (
                      <div style={{
                        fontSize: 12, color: '#555', background: '#f9f9f9', padding: '8px 10px',
                        borderRadius: 4, marginBottom: 8, whiteSpace: 'pre-wrap', lineHeight: 1.5,
                      }}>
                        {offer.cards_wanted}
                      </div>
                    )}

                    <div style={{ fontSize: 11, color: '#999', marginBottom: 8 }}>
                      Submitted {fmtDate(offer.created_at)}
                    </div>

                    {offer.status === 'pending' && (
                      <div style={{ fontSize: 12, color: '#b7950b' }}>
                        ⏳ Waiting for seller to respond…
                      </div>
                    )}
                    {offer.status === 'accepted' && (
                      <button
                        className="offer-pay-btn"
                        onClick={() => setPayingOffer(offer)}
                      >
                        Pay Now — ${offer.amount.toFixed(2)}
                      </button>
                    )}
                    {offer.status === 'rejected' && (
                      <div style={{ fontSize: 12, color: '#c0392b' }}>
                        Offer was declined by the seller.
                      </div>
                    )}
                    {offer.status === 'paid' && (
                      <div style={{ fontSize: 12, color: '#1a8c49', fontWeight: 600 }}>
                        ✓ Payment sent
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

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

        {listing.items.length > 0 ? (
          <div style={{ border: '1px solid #e5e5e5', borderRadius: 6, overflow: 'hidden' }}>
            {listing.items.map((item, i) => (
              <div
                key={item.id}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '12px 16px',
                  borderBottom: i < listing.items.length - 1 ? '1px solid #f0f0f0' : 'none',
                  background: '#fff',
                }}
              >
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#111' }}>{item.card_name}</div>
                  <div style={{ fontSize: 12, color: '#777', marginTop: 2 }}>
                    {item.set_name && <span>{item.set_name}</span>}
                    {item.set_name && item.condition_text && <span> · </span>}
                    {item.condition_text && <span>{item.condition_text}</span>}
                  </div>
                </div>
                {item.custom_price != null && (
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#111' }}>
                    ${item.custom_price.toFixed(2)}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 13, color: '#aaa', fontStyle: 'italic' }}>No specific cards listed.</div>
        )}
      </div>

      <Footer />
      {buyModalOpen && (
        <BuyNowModal
          onClose={() => setBuyModalOpen(false)}
          listingId={listing.id}
          sellerId={listing.seller_id}
          items={listing.items}
          onOfferSent={() => { if (userId) loadOffers(userId); }}
        />
      )}
      {payingOffer && (
        <PaymentModal
          onClose={() => { setPayingOffer(null); if (userId) loadOffers(userId); }}
          offerId={payingOffer.id}
          amount={payingOffer.amount}
        />
      )}
      <ListingMessages
        listingId={listing.id}
        sellerId={listing.seller_id}
        sellerName={listing.seller?.username ?? 'Seller'}
        open={chatOpen}
        onClose={() => setChatOpen(false)}
      />
    </>
  );
}
