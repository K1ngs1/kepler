'use client';

import { useState, useEffect, useCallback } from 'react';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import { createClient } from '@/lib/supabase/client';
import { useAccount } from 'wagmi';

interface Trade {
  id: string;
  status: string;
  created_at: string;
  updated_at: string;
  initiator_id: string;
  recipient_id: string;
  initiator: { username: string | null } | null;
  recipient: { username: string | null } | null;
}

interface PurchaseOffer {
  id: string;
  listing_id: string;
  buyer_id: string;
  seller_id: string;
  amount: number;
  cards_wanted: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  buyer: { username: string | null } | null;
  listing: { title: string | null } | null;
}

const TRADE_STATUS_LABELS: Record<string, string> = {
  proposed: 'Proposed', countered: 'Countered', accepted: 'Accepted',
  completed: 'Completed', cancelled: 'Cancelled',
};

const OFFER_STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  pending: { bg: '#fef9e7', text: '#b7950b', border: '#f0e1a0' },
  accepted: { bg: '#eafaf1', text: '#1a8c49', border: '#a3d9b1' },
  rejected: { bg: '#fdf0ef', text: '#c0392b', border: '#f5c6c2' },
  paid: { bg: '#eef6ff', text: '#2471a3', border: '#aed2f0' },
  completed: { bg: '#eafaf1', text: '#1a8c49', border: '#a3d9b1' },
  cancelled: { bg: '#f5f5f5', text: '#888', border: '#ddd' },
};

function OfferStatusBadge({ status }: { status: string }) {
  const colors = OFFER_STATUS_COLORS[status] || OFFER_STATUS_COLORS.pending;
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

export default function OffersPage() {
  const [tab, setTab] = useState<'trades' | 'buy_offers' | 'history'>('trades');
  const [trades, setTrades] = useState<Trade[]>([]);
  const [purchaseOffers, setPurchaseOffers] = useState<PurchaseOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [authed, setAuthed] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const { isConnected, address } = useAccount();

  const loadPurchaseOffers = useCallback(async (uid: string) => {
    const supabase = createClient();
    if (!supabase) return;

    const { data } = await supabase
      .from('purchase_offers')
      .select('id, listing_id, buyer_id, seller_id, amount, cards_wanted, status, created_at, updated_at, buyer:profiles!purchase_offers_buyer_id_fkey(username), listing:listings!purchase_offers_listing_id_fkey(title)')
      .or(`buyer_id.eq.${uid},seller_id.eq.${uid}`)
      .order('created_at', { ascending: false });

    if (data) setPurchaseOffers(data as unknown as PurchaseOffer[]);
  }, []);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) { setLoading(false); return; }

    const ref: { tradeChannel: ReturnType<typeof supabase.channel> | null; offerChannel: ReturnType<typeof supabase.channel> | null } = { tradeChannel: null, offerChannel: null };

    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { setLoading(false); return; }
      setAuthed(true);
      setUserId(user.id);

      const loadTrades = async () => {
        const { data } = await supabase
          .from('trade_offers')
          .select('id, status, created_at, updated_at, initiator_id, recipient_id, initiator:profiles!trade_offers_initiator_id_fkey(username), recipient:profiles!trade_offers_recipient_id_fkey(username)')
          .or(`initiator_id.eq.${user.id},recipient_id.eq.${user.id}`)
          .order('updated_at', { ascending: false });
        setTrades((data as unknown as Trade[]) ?? []);
      };

      await Promise.all([loadTrades(), loadPurchaseOffers(user.id)]);
      setLoading(false);

      ref.tradeChannel = supabase.channel(`trades-list-${user.id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'trade_offers' }, loadTrades)
        .subscribe();

      ref.offerChannel = supabase.channel(`purchase-offers-list-${user.id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'purchase_offers' }, () => loadPurchaseOffers(user.id))
        .subscribe();
    });

    return () => { ref.tradeChannel?.unsubscribe(); ref.offerChannel?.unsubscribe(); };
  }, [loadPurchaseOffers]);

  const activeTrades = trades.filter((t) => ['proposed', 'countered', 'accepted'].includes(t.status));
  const historyTrades = trades.filter((t) => ['completed', 'cancelled'].includes(t.status));

  const activeBuyOffers = purchaseOffers.filter((o) => ['pending', 'accepted'].includes(o.status));
  const historyBuyOffers = purchaseOffers.filter((o) => ['rejected', 'paid', 'completed', 'cancelled'].includes(o.status));

  const partnerName = (t: Trade) => {
    if (!userId) return '—';
    if (t.initiator_id === userId) return t.recipient?.username ?? 'Unknown';
    return t.initiator?.username ?? 'Unknown';
  };

  const role = (t: Trade) => (t.initiator_id === userId ? 'Initiator' : 'Recipient');

  const fmtDate = (s: string) =>
    new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const fmtDateTime = (s: string) =>
    new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

  const handleAcceptOffer = async (offerId: string) => {
    if (!isConnected || !address) {
      setErrorMsg('Please connect your wallet first to receive crypto payments.');
      setTimeout(() => setErrorMsg(null), 4000);
      return;
    }

    setActionLoading(offerId);
    const supabase = createClient();
    if (!supabase) return;

    // Save seller's wallet address to their profile
    if (userId) {
      await supabase.from('profiles').update({ polygon_wallet: address }).eq('id', userId);
    }

    await supabase
      .from('purchase_offers')
      .update({ status: 'accepted', updated_at: new Date().toISOString() })
      .eq('id', offerId);
    if (userId) await loadPurchaseOffers(userId);
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
    if (userId) await loadPurchaseOffers(userId);
    setActionLoading(null);
  };

  const tabCounts = {
    trades: activeTrades.length,
    buy_offers: activeBuyOffers.length,
    history: historyTrades.length + historyBuyOffers.length,
  };

  return (
    <>
      <Nav />
      {errorMsg && (
        <div style={{ position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)', background: '#c0392b', color: '#fff', padding: '11px 22px', borderRadius: 6, fontSize: 13.5, fontWeight: 500, zIndex: 1000, boxShadow: '0 4px 24px rgba(0,0,0,0.22)', whiteSpace: 'nowrap', pointerEvents: 'none' }}>
          {errorMsg}
        </div>
      )}
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 20px' }}>
        <div className="listing-toolbar">
          <div className="listing-title">Offers</div>
        </div>

        <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #e5e5e5', marginBottom: 20 }}>
          {([
            { key: 'trades' as const, label: 'Trades' },
            { key: 'buy_offers' as const, label: 'Buy Offers' },
            { key: 'history' as const, label: 'History' },
          ]).map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{ padding: '8px 20px', fontSize: 13.5, fontWeight: 600, background: 'none', border: 'none', borderBottom: tab === t.key ? '2px solid #111' : '2px solid transparent', cursor: 'pointer', color: tab === t.key ? '#111' : '#777', marginBottom: -1 }}>
              {t.label} ({tabCounts[t.key]})
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#aaa', fontSize: 13 }}>Loading offers…</div>
        ) : !authed ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#888', fontSize: 14 }}>Sign in to see your offers.</div>
        ) : tab === 'trades' ? (
          /* ── TRADES TAB ── */
          activeTrades.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 0' }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#333', marginBottom: 8 }}>No active trades</div>
              <div style={{ fontSize: 13, color: '#888', marginBottom: 24, maxWidth: 400, margin: '0 auto 24px' }}>
                Browse the catalog and find a listing to start a trade.
              </div>
              <a href="/listings" style={{ background: '#111', color: '#fff', borderRadius: 5, padding: '10px 24px', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
                Browse Listings
              </a>
            </div>
          ) : (
            <div className="trades-table-wrap">
              <table className="trades-table">
                <thead>
                  <tr>
                    <th>Partner</th>
                    <th>Your Role</th>
                    <th>Status</th>
                    <th>Last Updated</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {activeTrades.map((trade) => (
                    <tr key={trade.id} style={{ cursor: 'pointer' }} onClick={() => window.location.href = `/trades/${trade.id}`}>
                      <td style={{ fontWeight: 600 }}>{partnerName(trade)}</td>
                      <td style={{ color: '#777' }}>{role(trade)}</td>
                      <td>
                        <span className={`trade-status-chip trade-status-${trade.status}`}>
                          {TRADE_STATUS_LABELS[trade.status]}
                        </span>
                      </td>
                      <td style={{ color: '#999' }}>{fmtDate(trade.updated_at)}</td>
                      <td>
                        <a href={`/trades/${trade.id}`} style={{ fontSize: 12.5, color: '#555', textDecoration: 'underline', textUnderlineOffset: 2 }}>View →</a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : tab === 'buy_offers' ? (
          /* ── BUY OFFERS TAB ── */
          activeBuyOffers.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 0' }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#333', marginBottom: 8 }}>No active buy offers</div>
              <div style={{ fontSize: 13, color: '#888', maxWidth: 400, margin: '0 auto 24px' }}>
                When someone makes an offer on your listing, or you make an offer on someone else&apos;s listing, it will appear here.
              </div>
              <a href="/listings" style={{ background: '#111', color: '#fff', borderRadius: 5, padding: '10px 24px', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
                Browse Listings
              </a>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {activeBuyOffers.map((offer) => {
                const isSeller = offer.seller_id === userId;
                const isBuyer = offer.buyer_id === userId;
                return (
                  <div key={offer.id} className="offer-card" style={{ padding: '16px 20px', border: '1px solid #e5e5e5', borderRadius: 8, background: '#fff' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                      <div>
                        <a
                          href={`/listings/${offer.listing_id}`}
                          style={{ fontSize: 14, fontWeight: 700, color: '#111', textDecoration: 'none' }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {offer.listing?.title ?? 'Untitled Listing'}
                        </a>
                        <div style={{ fontSize: 12, color: '#777', marginTop: 3 }}>
                          {isSeller ? (
                            <>From: <span style={{ fontWeight: 600, color: '#333' }}>{offer.buyer?.username ?? 'Unknown'}</span></>
                          ) : (
                            <>You sent this offer</>
                          )}
                          <span style={{ marginLeft: 8, color: '#bbb' }}>·</span>
                          <span style={{ marginLeft: 8, color: '#999' }}>{fmtDateTime(offer.created_at)}</span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ fontSize: 18, fontWeight: 700, color: '#111' }}>
                          ${offer.amount.toFixed(2)}
                        </div>
                        <OfferStatusBadge status={offer.status} />
                      </div>
                    </div>

                    {offer.cards_wanted && (
                      <div style={{
                        fontSize: 12, color: '#555', background: '#f9f9f9', padding: '8px 12px',
                        borderRadius: 4, marginBottom: 12, whiteSpace: 'pre-wrap', lineHeight: 1.5,
                        maxHeight: 80, overflow: 'hidden',
                      }}>
                        {offer.cards_wanted}
                      </div>
                    )}

                    {/* Seller actions */}
                    {isSeller && offer.status === 'pending' && (
                      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                        <button
                          className="offer-accept-btn"
                          onClick={() => handleAcceptOffer(offer.id)}
                          disabled={actionLoading === offer.id}
                          style={{ padding: '7px 20px', fontSize: 13, fontWeight: 600 }}
                        >
                          {actionLoading === offer.id ? '…' : 'Accept'}
                        </button>
                        <button
                          className="offer-reject-btn"
                          onClick={() => handleRejectOffer(offer.id)}
                          disabled={actionLoading === offer.id}
                          style={{ padding: '7px 20px', fontSize: 13, fontWeight: 600 }}
                        >
                          Reject
                        </button>
                        <a
                          href={`/listings/${offer.listing_id}`}
                          style={{ padding: '7px 16px', fontSize: 12.5, color: '#555', textDecoration: 'underline', textUnderlineOffset: 2, display: 'flex', alignItems: 'center' }}
                        >
                          View Listing →
                        </a>
                      </div>
                    )}

                    {/* Buyer status messages */}
                    {isBuyer && offer.status === 'pending' && (
                      <div style={{ fontSize: 12, color: '#b7950b', marginTop: 4 }}>
                        ⏳ Waiting for seller to respond…
                      </div>
                    )}
                    {isBuyer && offer.status === 'accepted' && (
                      <a
                        href={`/listings/${offer.listing_id}`}
                        style={{ display: 'inline-block', marginTop: 4, background: '#111', color: '#fff', borderRadius: 5, padding: '8px 20px', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}
                      >
                        Pay Now — ${offer.amount.toFixed(2)}
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          )
        ) : (
          /* ── HISTORY TAB ── */
          historyTrades.length === 0 && historyBuyOffers.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 0' }}>
              <div style={{ fontSize: 13, color: '#888' }}>No completed or cancelled offers yet.</div>
            </div>
          ) : (
            <div>
              {/* Trade history */}
              {historyTrades.length > 0 && (
                <>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>
                    Trade History
                  </div>
                  <div className="trades-table-wrap" style={{ marginBottom: 32 }}>
                    <table className="trades-table">
                      <thead>
                        <tr>
                          <th>Partner</th>
                          <th>Status</th>
                          <th>Date</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {historyTrades.map((trade) => (
                          <tr key={trade.id} style={{ cursor: 'pointer' }} onClick={() => window.location.href = `/trades/${trade.id}`}>
                            <td style={{ fontWeight: 600 }}>{partnerName(trade)}</td>
                            <td>
                              <span className={`trade-status-chip trade-status-${trade.status}`}>
                                {TRADE_STATUS_LABELS[trade.status]}
                              </span>
                            </td>
                            <td style={{ color: '#999' }}>{fmtDate(trade.updated_at)}</td>
                            <td>
                              <a href={`/trades/${trade.id}`} style={{ fontSize: 12.5, color: '#555', textDecoration: 'underline', textUnderlineOffset: 2 }}>View →</a>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {/* Buy offer history */}
              {historyBuyOffers.length > 0 && (
                <>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>
                    Buy Offer History
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {historyBuyOffers.map((offer) => {
                      const isSeller = offer.seller_id === userId;
                      return (
                        <div key={offer.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', border: '1px solid #f0f0f0', borderRadius: 6, background: '#fafafa' }}>
                          <div>
                            <a href={`/listings/${offer.listing_id}`} style={{ fontSize: 13, fontWeight: 600, color: '#333', textDecoration: 'none' }}>
                              {offer.listing?.title ?? 'Untitled Listing'}
                            </a>
                            <div style={{ fontSize: 11.5, color: '#999', marginTop: 2 }}>
                              {isSeller ? `From ${offer.buyer?.username ?? 'Unknown'}` : 'You sent this offer'}
                              <span style={{ marginLeft: 6 }}>· {fmtDate(offer.created_at)}</span>
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{ fontSize: 14, fontWeight: 600, color: '#555' }}>${offer.amount.toFixed(2)}</span>
                            <OfferStatusBadge status={offer.status} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )
        )}
      </div>
      <Footer />
    </>
  );
}
