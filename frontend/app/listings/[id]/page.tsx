'use client';

import { useState, useEffect, useCallback } from 'react';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import ListingPhotoGallery from '@/components/ListingPhotoGallery';
import BuyNowModal from '@/components/BuyNowModal';
import PaymentModal from '@/components/PaymentModal';
import DepositSection from '@/components/DepositSection';
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

interface OfferedCard {
  card_name: string;
  set_name?: string;
  condition?: string;
}

interface Offer {
  id: string;
  initiator_id: string;
  recipient_id: string;
  offer_type: string;
  status: string;
  cash_amount: number | null;
  offered_cards: OfferedCard[] | null;
  deposit_amount: number | null;
  initiator_deposit_locked: boolean;
  recipient_deposit_locked: boolean;
  initiator_confirmed: boolean;
  recipient_confirmed: boolean;
  payment_status: string | null;
  payment_txn_hash: string | null;
  first_confirmed_at: string | null;
  disputed_by: string | null;
  dispute_reason: string | null;
  disputed_at: string | null;
  tracking_number: string | null;
  created_at: string;
  initiator: { username: string | null } | null;
}

interface ShippingAddr {
  id: string;
  user_id: string;
  name: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  country: string;
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
  proposed: { bg: '#fef9e7', text: '#b7950b', border: '#f0e1a0' },
  accepted: { bg: '#eafaf1', text: '#1a8c49', border: '#a3d9b1' },
  completed: { bg: '#eafaf1', text: '#1a8c49', border: '#a3d9b1' },
  cancelled: { bg: '#f5f5f5', text: '#888', border: '#ddd' },
  disputed: { bg: '#fdf0ef', text: '#c0392b', border: '#f5c6c2' },
};

function OfferStatusBadge({ status }: { status: string }) {
  const colors = STATUS_COLORS[status] || STATUS_COLORS.proposed;
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

function OfferTypeBadge({ type }: { type: string }) {
  return (
    <span style={{
      display: 'inline-block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
      letterSpacing: 0.5, padding: '2px 8px', borderRadius: 999,
      background: type === 'trade' ? '#f0e6ff' : '#e6f0ff',
      color: type === 'trade' ? '#6b21a8' : '#1e40af',
      border: `1px solid ${type === 'trade' ? '#d4b5ff' : '#93c5fd'}`,
    }}>
      {type}
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
  const [offers, setOffers] = useState<Offer[]>([]);
  const [payingOffer, setPayingOffer] = useState<Offer | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activeDeal, setActiveDeal] = useState<Offer | null>(null);
  const [shippingAddresses, setShippingAddresses] = useState<ShippingAddr[]>([]);
  const [shippingLoading, setShippingLoading] = useState(false);
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [disputeReason, setDisputeReason] = useState('');
  const { isConnected, address } = useAccount();

  const showError = (msg: string) => {
    setErrorMsg(msg);
    setTimeout(() => setErrorMsg(null), 4000);
  };

  const loadOffers = useCallback(async (uid: string) => {
    const supabase = createClient();
    if (!supabase || !id) return;

    const { data } = await supabase
      .from('trade_offers')
      .select('id, initiator_id, recipient_id, offer_type, status, cash_amount, offered_cards, deposit_amount, initiator_deposit_locked, recipient_deposit_locked, initiator_confirmed, recipient_confirmed, payment_status, payment_txn_hash, first_confirmed_at, disputed_by, dispute_reason, disputed_at, tracking_number, created_at, initiator:profiles!trade_offers_initiator_id_fkey(username)')
      .eq('listing_id', id)
      .or(`initiator_id.eq.${uid},recipient_id.eq.${uid}`)
      .order('created_at', { ascending: false });

    if (data) {
      const typed = data as unknown as Offer[];
      setOffers(typed);
      // Find the active deal (accepted/disputed) for this user
      const deal = typed.find(o =>
        ['accepted', 'disputed'].includes(o.status) &&
        (o.initiator_id === uid || o.recipient_id === uid)
      );
      setActiveDeal(deal || null);
    }
  }, [id]);

  const loadShippingAddresses = useCallback(async (tradeId: string) => {
    setShippingLoading(true);
    try {
      const resp = await fetch(`/api/shipping/${tradeId}`);
      if (resp.ok) {
        const json = await resp.json();
        setShippingAddresses(json.addresses || []);
      }
    } catch { /* ignore */ }
    setShippingLoading(false);
  }, []);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase || !id) return;

    let offerSub: ReturnType<typeof supabase.channel> | null = null;

    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setUserId(data.user.id);
        loadOffers(data.user.id);

        offerSub = supabase.channel(`offers-${id}`)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'trade_offers', filter: `listing_id=eq.${id}` },
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

  // Load shipping when active deal exists
  useEffect(() => {
    if (activeDeal && ['accepted', 'disputed'].includes(activeDeal.status)) {
      loadShippingAddresses(activeDeal.id);
    }
  }, [activeDeal, loadShippingAddresses]);

  const handleAcceptOffer = async (offerId: string) => {
    if (!isConnected || !address) {
      showError('Please connect your wallet first to receive crypto payments.');
      return;
    }
    setActionLoading(offerId);
    const supabase = createClient();
    if (!supabase) return;

    if (userId) {
      await supabase.from('profiles').update({ polygon_wallet: address }).eq('id', userId);
    }

    const { error } = await supabase.rpc('accept_trade', { p_trade_id: offerId });
    if (error) showError(error.message);
    if (userId) await loadOffers(userId);
    setActionLoading(null);
  };

  const handleRejectOffer = async (offerId: string) => {
    setActionLoading(offerId);
    const supabase = createClient();
    if (!supabase) return;
    const { error } = await supabase.rpc('cancel_trade', { p_trade_id: offerId });
    if (error) showError(error.message);
    if (userId) await loadOffers(userId);
    setActionLoading(null);
  };

  const handleConfirmReceipt = async (offerId: string) => {
    setActionLoading(offerId);
    const supabase = createClient();
    if (!supabase) return;
    const { error } = await supabase.rpc('complete_trade', { p_trade_id: offerId });
    if (error) showError(error.message);
    else setErrorMsg(null);
    if (userId) await loadOffers(userId);
    setActionLoading(null);
  };

  const handleOpenDispute = async () => {
    if (!activeDeal || !disputeReason.trim()) return;
    setActionLoading(activeDeal.id);
    const supabase = createClient();
    if (!supabase) return;
    const { error } = await supabase.rpc('open_dispute', { p_trade_id: activeDeal.id, p_reason: disputeReason.trim() });
    if (error) showError(error.message);
    setDisputeOpen(false);
    setDisputeReason('');
    if (userId) await loadOffers(userId);
    setActionLoading(null);
  };

  const fmtDate = (s: string) =>
    new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

  if (loading) return <><Nav /><div style={{ textAlign: 'center', padding: '80px 0', color: '#aaa', fontSize: 13 }}>Loading…</div><Footer /></>;
  if (!listing) return <><Nav /><div style={{ textAlign: 'center', padding: '80px 0', color: '#888' }}>Listing not found.</div><Footer /></>;

  const isSeller = userId === listing.seller_id;
  const myOffers = offers.filter(o => o.initiator_id === userId);
  const incomingOffers = offers.filter(o => o.recipient_id === userId && o.initiator_id !== userId);

  // For active deal
  const isInitiator = activeDeal?.initiator_id === userId;
  const myConfirmed = activeDeal ? (isInitiator ? activeDeal.initiator_confirmed : activeDeal.recipient_confirmed) : false;
  const partnerName = activeDeal
    ? (isInitiator ? (listing.seller?.username ?? 'Seller') : (activeDeal.initiator?.username ?? 'Buyer'))
    : '';

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
              <button className="btn-outline-ext" onClick={() => router.push(`/listings/${listing.id}/edit`)}>
                Edit Listing
              </button>
            ) : (
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn-buy-now" onClick={() => setBuyModalOpen(true)}>
                  Make Offer
                </button>
                <button
                  className="btn-outline-ext"
                  onClick={() => router.push(`/trades/new?fromListing=${listing.id}`)}
                  style={{ marginTop: 0 }}
                >
                  Propose Trade
                </button>
              </div>
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

          {/* ══════ ACTIVE DEAL DASHBOARD ══════ */}
          {activeDeal && (
            <div style={{ marginTop: 24, padding: 20, border: '2px solid #111', borderRadius: 8, background: '#fafafa' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#111' }}>
                  Active Deal
                  <span style={{ marginLeft: 8 }}><OfferTypeBadge type={activeDeal.offer_type} /></span>
                </div>
                <OfferStatusBadge status={activeDeal.status} />
              </div>

              {/* What's being exchanged */}
              {activeDeal.offer_type === 'trade' && activeDeal.offered_cards && activeDeal.offered_cards.length > 0 && (
                <div style={{ marginBottom: 12, padding: '8px 12px', background: '#fff', border: '1px solid #e5e5e5', borderRadius: 4 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#555', marginBottom: 6 }}>
                    {isInitiator ? 'You Offer' : `${activeDeal.initiator?.username ?? 'They'} Offer`}
                  </div>
                  {activeDeal.offered_cards.map((card, i) => (
                    <div key={i} style={{ fontSize: 12.5, color: '#333', padding: '2px 0' }}>
                      {card.card_name}
                      {card.set_name && <span style={{ color: '#777' }}> — {card.set_name}</span>}
                      {card.condition && <span style={{ color: '#999' }}> ({card.condition})</span>}
                    </div>
                  ))}
                </div>
              )}
              {activeDeal.cash_amount != null && activeDeal.cash_amount > 0 && (
                <div style={{ marginBottom: 12, padding: '6px 12px', background: '#edf9f1', border: '1px solid #7bc99b', borderRadius: 4, fontSize: 13, color: '#1a6b3a', fontWeight: 600 }}>
                  {activeDeal.offer_type === 'purchase' ? 'Price' : 'Cash included'}: ${activeDeal.cash_amount.toFixed(2)}
                </div>
              )}

              {/* Purchase: Pay Now button */}
              {activeDeal.offer_type === 'purchase' && activeDeal.status === 'accepted' && isInitiator && !activeDeal.payment_status && (
                <button
                  className="btn-place-bid"
                  style={{ fontSize: 13, marginBottom: 12 }}
                  onClick={() => setPayingOffer(activeDeal)}
                >
                  Pay Now — ${(activeDeal.cash_amount ?? 0).toFixed(2)}
                </button>
              )}
              {activeDeal.payment_status === 'paid' && (
                <div style={{ fontSize: 12, color: '#1a8c49', fontWeight: 600, marginBottom: 12 }}>
                  Payment sent
                </div>
              )}

              {/* Action buttons */}
              {activeDeal.status === 'accepted' && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                  {!myConfirmed && (
                    <button
                      className="btn-place-bid"
                      style={{ flex: 1, fontSize: 13 }}
                      disabled={actionLoading === activeDeal.id}
                      onClick={() => handleConfirmReceipt(activeDeal.id)}
                    >
                      Confirm Receipt
                    </button>
                  )}
                  <button
                    className="btn-watchlist"
                    style={{ flex: 1, fontSize: 13, color: '#c0392b', borderColor: '#c0392b' }}
                    disabled={actionLoading === activeDeal.id}
                    onClick={() => setDisputeOpen(true)}
                  >
                    Open Dispute
                  </button>
                </div>
              )}
              {activeDeal.status === 'accepted' && myConfirmed && (
                <div style={{ fontSize: 12.5, color: '#555', marginBottom: 12 }}>
                  Waiting for the other party to confirm receipt…
                  {activeDeal.first_confirmed_at && (() => {
                    const deadline = new Date(activeDeal.first_confirmed_at).getTime() + 7 * 24 * 60 * 60 * 1000;
                    const remaining = deadline - Date.now();
                    if (remaining <= 0) return <span style={{ display: 'block', marginTop: 4, fontSize: 11.5, color: '#e5a000' }}>Auto-completing soon...</span>;
                    const days = Math.floor(remaining / (24 * 60 * 60 * 1000));
                    const hours = Math.floor((remaining % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
                    return (
                      <span style={{ display: 'block', marginTop: 4, fontSize: 11.5, color: '#888' }}>
                        Trade will auto-complete in {days}d {hours}h if no response.
                      </span>
                    );
                  })()}
                </div>
              )}

              {/* Disputed status */}
              {activeDeal.status === 'disputed' && (
                <div style={{ padding: 12, border: '1px solid #f5c6cb', borderRadius: 6, background: '#fff5f5', marginBottom: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#c0392b', marginBottom: 6 }}>Trade Disputed</div>
                  <div style={{ fontSize: 12, color: '#555', marginBottom: 4 }}>
                    Opened by {activeDeal.disputed_by === userId ? 'you' : partnerName}
                    {activeDeal.disputed_at && <span> on {new Date(activeDeal.disputed_at).toLocaleDateString()}</span>}
                  </div>
                  {activeDeal.dispute_reason && (
                    <div style={{ fontSize: 12, color: '#333', padding: '6px 10px', background: '#fff', border: '1px solid #e5e5e5', borderRadius: 4, marginBottom: 6 }}>
                      {activeDeal.dispute_reason}
                    </div>
                  )}
                  <div style={{ fontSize: 11.5, color: '#888' }}>
                    An admin will review and determine the outcome. Deposits remain locked.
                  </div>
                </div>
              )}

              {/* Escrow deposit */}
              <DepositSection
                tradeId={activeDeal.id}
                depositAmount={activeDeal.deposit_amount ?? null}
                initiatorLocked={activeDeal.initiator_deposit_locked ?? false}
                recipientLocked={activeDeal.recipient_deposit_locked ?? false}
                isInitiator={!!isInitiator}
                partnerName={partnerName}
              />

              {/* Shipping info */}
              <div style={{ marginTop: 16, padding: 12, border: '1px solid #ebebeb', borderRadius: 6, background: '#fff' }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, color: '#111' }}>Shipping Info</div>
                <div style={{ fontSize: 12, color: '#555', marginBottom: 8 }}>
                  Ship items to your trade partner&apos;s address below.
                </div>
                {shippingLoading ? (
                  <div style={{ fontSize: 12, color: '#aaa' }}>Loading address…</div>
                ) : shippingAddresses.length > 0 ? (
                  shippingAddresses.map((addr) => (
                    <div key={addr.id} style={{ padding: '8px 10px', border: '1px solid #e5e5e5', borderRadius: 4, background: '#fafafa', marginBottom: 4 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#111' }}>{addr.name}</div>
                      <div style={{ fontSize: 12, color: '#555', marginTop: 2, lineHeight: 1.5 }}>
                        {addr.street}<br />
                        {addr.city}, {addr.state} {addr.zip}<br />
                        {addr.country}
                      </div>
                    </div>
                  ))
                ) : (
                  <div style={{ fontSize: 12, color: '#999' }}>
                    No shipping address on file. Ask your trade partner to add one in Settings.
                  </div>
                )}
                {activeDeal.tracking_number && (
                  <div style={{ marginTop: 6, fontSize: 12, color: '#555' }}>
                    Tracking: <span style={{ fontFamily: 'monospace', color: '#333', fontWeight: 600 }}>{activeDeal.tracking_number}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ══════ SELLER: Incoming Offers ══════ */}
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
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: '#111' }}>
                            {offer.initiator?.username ?? 'Unknown'}
                          </span>
                          <OfferTypeBadge type={offer.offer_type} />
                        </div>
                        <div style={{ fontSize: 11, color: '#999' }}>{fmtDate(offer.created_at)}</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {offer.cash_amount != null && offer.cash_amount > 0 && (
                          <div style={{ fontSize: 16, fontWeight: 700, color: '#111' }}>
                            ${offer.cash_amount.toFixed(2)}
                          </div>
                        )}
                        <OfferStatusBadge status={offer.status} />
                      </div>
                    </div>

                    {/* Show offered cards for trade offers */}
                    {offer.offer_type === 'trade' && offer.offered_cards && offer.offered_cards.length > 0 && (
                      <div style={{ fontSize: 12, color: '#555', background: '#f9f9f9', padding: '8px 10px', borderRadius: 4, marginBottom: 10 }}>
                        {offer.offered_cards.map((card, i) => (
                          <div key={i}>
                            {card.card_name}
                            {card.set_name && <span style={{ color: '#999' }}> — {card.set_name}</span>}
                          </div>
                        ))}
                      </div>
                    )}

                    {offer.status === 'proposed' && (
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

          {/* ══════ BUYER: My Offers ══════ */}
          {!isSeller && myOffers.length > 0 && !activeDeal && (
            <div style={{ marginTop: 24 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#111', marginBottom: 12 }}>
                Your Offers
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {myOffers.map((offer) => (
                  <div key={offer.id} className="offer-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {offer.cash_amount != null && offer.cash_amount > 0 && (
                          <span style={{ fontSize: 15, fontWeight: 700, color: '#111' }}>
                            ${offer.cash_amount.toFixed(2)}
                          </span>
                        )}
                        <OfferTypeBadge type={offer.offer_type} />
                      </div>
                      <OfferStatusBadge status={offer.status} />
                    </div>

                    {offer.offer_type === 'trade' && offer.offered_cards && offer.offered_cards.length > 0 && (
                      <div style={{ fontSize: 12, color: '#555', background: '#f9f9f9', padding: '8px 10px', borderRadius: 4, marginBottom: 8 }}>
                        {offer.offered_cards.map((card, i) => (
                          <div key={i}>
                            {card.card_name}
                            {card.set_name && <span style={{ color: '#999' }}> — {card.set_name}</span>}
                          </div>
                        ))}
                      </div>
                    )}

                    <div style={{ fontSize: 11, color: '#999', marginBottom: 8 }}>
                      Submitted {fmtDate(offer.created_at)}
                    </div>

                    {offer.status === 'proposed' && (
                      <div style={{ fontSize: 12, color: '#b7950b' }}>
                        Waiting for seller to respond…
                      </div>
                    )}
                    {offer.status === 'cancelled' && (
                      <div style={{ fontSize: 12, color: '#888' }}>
                        This offer was declined.
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

      {/* Dispute modal */}
      {disputeOpen && (
        <div className="modal-bg">
          <div className="login-modal" style={{ width: 400 }}>
            <button className="login-close" onClick={() => setDisputeOpen(false)}>×</button>
            <div className="login-heading">Open a Dispute</div>
            <div className="login-sub">
              Describe the issue. An admin will review and determine the outcome. Deposits remain locked until resolved.
            </div>
            <textarea
              className="login-field-input"
              style={{ height: 80, resize: 'vertical', fontSize: 13, fontFamily: 'inherit' }}
              placeholder="What went wrong? (e.g., wrong card, item not as described, never arrived...)"
              value={disputeReason}
              onChange={(e) => setDisputeReason(e.target.value)}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
              <button className="btn-watchlist" style={{ width: 'auto', padding: '8px 16px', fontSize: 13, marginTop: 0 }} onClick={() => { setDisputeOpen(false); setDisputeReason(''); }}>
                Cancel
              </button>
              <button
                className="btn-place-bid"
                style={{ width: 'auto', padding: '8px 16px', fontSize: 13, marginTop: 0, background: '#c0392b' }}
                disabled={!disputeReason.trim() || !!actionLoading}
                onClick={handleOpenDispute}
              >
                Submit Dispute
              </button>
            </div>
          </div>
        </div>
      )}

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
          amount={payingOffer.cash_amount ?? 0}
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
