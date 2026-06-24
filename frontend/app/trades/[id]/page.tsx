'use client';

import { useState, useEffect, useRef } from 'react';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import DepositSection from '@/components/DepositSection';
import PaymentModal from '@/components/PaymentModal';
import ErrorState from '@/components/ErrorState';
import { createClient } from '@/lib/supabase/client';
import { handleError, friendlyMessage } from '@/lib/error-handler';
import { useParams, useRouter } from 'next/navigation';

interface TradeMessage {
  id: string;
  sender_id: string;
  content: string;
  sent_at: string;
  profiles: { username: string | null } | null;
}

interface OfferedCard {
  card_name: string;
  set_name?: string;
  condition?: string;
}

interface RequestedItem {
  id: string;
  card_name: string;
  set_name: string | null;
  condition_text: string | null;
  custom_price: number | null;
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

interface Trade {
  id: string;
  status: string;
  initiator_id: string;
  recipient_id: string;
  initiator_confirmed: boolean;
  recipient_confirmed: boolean;
  cash_amount?: number | null;
  offer_type?: string | null;
  payment_status?: string | null;
  listing_id?: string | null;
  offered_cards?: OfferedCard[] | null;
  requested_listing_item_ids?: string[] | null;
  deposit_amount?: number | null;
  initiator_deposit_locked?: boolean;
  recipient_deposit_locked?: boolean;
  tracking_number?: string | null;
  carrier?: string | null;
  shipped_at?: string | null;
  disputed_by?: string | null;
  dispute_reason?: string | null;
  disputed_at?: string | null;
  first_confirmed_at?: string | null;
  dispute_resolution?: string | null;
  created_at: string;
  updated_at: string;
  initiator: { username: string | null; reputation_score: number | null } | null;
  recipient: { username: string | null; reputation_score: number | null } | null;
}

// offered_cards is a jsonb column. Legacy rows were double-encoded (stored as a
// JSON string), so normalize both shapes to an array before rendering.
function normalizeCards(value: OfferedCard[] | string | null | undefined): OfferedCard[] {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

const TIMELINE_STEPS = ['proposed', 'accepted', 'completed'];

function TradeTimeline({ status }: { status: string }) {
  if (status === 'cancelled') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 20 }}>
        <span className="trade-status-chip trade-status-cancelled" style={{ fontSize: 12 }}>Cancelled</span>
        <span style={{ fontSize: 12, color: '#999' }}>This trade was cancelled.</span>
      </div>
    );
  }
  if (status === 'disputed') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 20 }}>
        <span className="trade-status-chip trade-status-disputed" style={{ fontSize: 12 }}>Disputed</span>
        <span style={{ fontSize: 12, color: '#999' }}>This trade is under review.</span>
      </div>
    );
  }
  const steps = TIMELINE_STEPS;
  const currentIdx = steps.indexOf(status === 'countered' ? 'proposed' : status);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 20 }}>
      {steps.map((step, i) => {
        const done = i <= currentIdx;
        const active = i === currentIdx;
        return (
          <div key={step} style={{ display: 'flex', alignItems: 'center', flex: i < steps.length - 1 ? 1 : 'none' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                background: done ? '#111' : '#e5e5e5',
                border: active ? '2.5px solid #111' : 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'background 0.2s',
              }}>
                {done && (
                  <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="#fff" strokeWidth="2.2">
                    <path d="M2.5 7l3.5 3.5 5.5-6" />
                  </svg>
                )}
              </div>
              <span style={{ fontSize: 10.5, color: done ? '#111' : '#aaa', fontWeight: done ? 600 : 400, whiteSpace: 'nowrap', textTransform: 'capitalize' }}>
                {step}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div style={{ flex: 1, height: 2, background: i < currentIdx ? '#111' : '#e5e5e5', margin: '0 4px', marginBottom: 18, transition: 'background 0.2s' }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function ReputationStars({ score }: { score: number | null }) {
  if (!score) return null;
  return (
    <span style={{ fontSize: 11, color: '#e5a000', marginLeft: 4 }}>
      {'★'.repeat(Math.round(score))}
      <span style={{ color: '#ddd' }}>{'★'.repeat(5 - Math.round(score))}</span>
    </span>
  );
}

function StarRatingWidget({ onRate }: { onRate: (n: number) => void }) {
  const [hover, setHover] = useState(0);
  const [selected, setSelected] = useState(0);
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(0)}
          onClick={() => { setSelected(n); onRate(n); }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, color: n <= (hover || selected) ? '#e5a000' : '#ddd', padding: '0 1px', lineHeight: 1 }}
        >
          ★
        </button>
      ))}
    </div>
  );
}

export default function TradeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [trade, setTrade] = useState<Trade | null>(null);
  const [requestedItems, setRequestedItems] = useState<RequestedItem[]>([]);
  const [messages, setMessages] = useState<TradeMessage[]>([]);
  const [msgInput, setMsgInput] = useState('');
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [actionLoading, setActionLoading] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [rated, setRated] = useState(false);
  const [shippingAddresses, setShippingAddresses] = useState<ShippingAddr[]>([]);
  const [shippingLoading, setShippingLoading] = useState(false);
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [disputeReason, setDisputeReason] = useState('');
  const [counterOpen, setCounterOpen] = useState(false);
  const [confirmShipmentOpen, setConfirmShipmentOpen] = useState(false);
  const [shipOpen, setShipOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [trackingInput, setTrackingInput] = useState('');
  const [carrierInput, setCarrierInput] = useState('');
  const [counterCards, setCounterCards] = useState<{ card_name: string; set_name: string; condition: string }[]>([]);
  const [counterCash, setCounterCash] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  };

  useEffect(() => {
    const supabase = createClient();
    if (!supabase || !id) return;

    let tradeSub: ReturnType<typeof supabase.channel> | null = null;
    let msgSub: ReturnType<typeof supabase.channel> | null = null;

    setLoadError(null);
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { setLoading(false); return; }
      setUserId(user.id);

      const loadTrade = async () => {
        const { data, error } = await supabase
          .from('trade_offers')
          .select('*, initiator:profiles!trade_offers_initiator_id_fkey(username, reputation_score), recipient:profiles!trade_offers_recipient_id_fkey(username, reputation_score)')
          .eq('id', id)
          .single();
        if (error) {
          if (error.code !== 'PGRST116') {
            setLoadError(friendlyMessage(handleError(error, { where: 'trade.load', id })));
          }
          return;
        }
        if (data) {
          setTrade(data as unknown as Trade);

          // Load requested listing items if we have item IDs
          const itemIds = data.requested_listing_item_ids;
          if (itemIds && itemIds.length > 0) {
            const { data: items } = await supabase
              .from('listing_items')
              .select('id, card_name, set_name, condition_text, custom_price')
              .in('id', itemIds);
            if (items) setRequestedItems(items as unknown as RequestedItem[]);
          }

          // Load shipping addresses if trade is in an appropriate state
          if (['accepted', 'completed', 'disputed'].includes(data.status)) {
            loadShippingAddresses();
          }
        }
      };

      const loadShippingAddresses = async () => {
        setShippingLoading(true);
        try {
          const resp = await fetch(`/api/shipping/${id}`);
          if (resp.ok) {
            const json = await resp.json();
            setShippingAddresses(json.addresses || []);
          }
        } catch (e) { handleError(e, { where: 'trade.loadShipping', id }); }
        setShippingLoading(false);
      };

      const loadMessages = async () => {
        const { data, error } = await supabase
          .from('trade_messages')
          .select('id, sender_id, content, sent_at, profiles(username)')
          .eq('trade_id', id)
          .order('sent_at', { ascending: true });
        if (error) { handleError(error, { where: 'trade.loadMessages', id }); return; }
        if (data) setMessages(data as unknown as TradeMessage[]);
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      };

      const checkRated = async () => {
        const { data, error } = await supabase
          .from('trade_ratings')
          .select('id')
          .eq('trade_id', id)
          .eq('rater_id', user.id)
          .maybeSingle();
        if (error) { handleError(error, { where: 'trade.checkRated', id }); return; }
        if (data) setRated(true);
      };

      await Promise.all([loadTrade(), loadMessages(), checkRated()]);
      setLoading(false);

      tradeSub = supabase.channel(`trade-${id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'trade_offers', filter: `id=eq.${id}` }, loadTrade)
        .subscribe();

      msgSub = supabase.channel(`trade-msgs-${id}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'trade_messages', filter: `trade_id=eq.${id}` }, loadMessages)
        .subscribe();
    });

    return () => { if (tradeSub) supabase.removeChannel(tradeSub); if (msgSub) supabase.removeChannel(msgSub); };
  }, [id, reloadKey]);

  const sendMessage = async () => {
    if (!msgInput.trim() || !userId) return;
    const supabase = createClient();
    if (!supabase) return;
    const { error } = await supabase.from('trade_messages').insert({ trade_id: id, sender_id: userId, content: msgInput.trim() });
    if (error) showToast(error.message, false);
    else setMsgInput('');
  };

  const RPC_LABELS: Record<string, string> = {
    accept_trade: 'Trade accepted!',
    cancel_trade: 'Trade cancelled.',
    complete_trade: 'Receipt confirmed!',
    open_dispute: 'Dispute opened.',
    counter_trade: 'Counter-offer sent!',
    mark_shipped: 'Shipment recorded!',
  };

  const rpc = async (fn: string, extraParams?: Record<string, unknown>) => {
    setActionLoading(true);
    const supabase = createClient();
    if (!supabase) return;
    const { error } = await supabase.rpc(fn, { p_trade_id: id, ...extraParams });
    if (error) showToast(error.message, false);
    else showToast(RPC_LABELS[fn] ?? 'Done!');
    setActionLoading(false);
  };

  const handleRate = async (rating: number) => {
    const supabase = createClient();
    if (!supabase) return;
    const { error } = await supabase.rpc('rate_trade', { p_trade_id: id, p_rating: rating });
    if (error) showToast(error.message, false);
    else { setRated(true); showToast('Rating submitted!'); }
  };

  const handleCounter = async () => {
    const validCards = counterCards.filter((c) => c.card_name.trim());
    const cash = parseFloat(counterCash) || 0;
    if (validCards.length === 0 && cash <= 0) {
      showToast('Add at least one card or a cash amount.', false);
      return;
    }
    await rpc('counter_trade', {
      p_offered_cards: validCards,
      p_cash_amount: cash,
    });
    setCounterOpen(false);
    setCounterCards([]);
    setCounterCash('');
  };

  const addCounterCard = () => {
    setCounterCards([...counterCards, { card_name: '', set_name: '', condition: '' }]);
  };

  const updateCounterCard = (idx: number, field: string, value: string) => {
    setCounterCards(counterCards.map((c, i) => i === idx ? { ...c, [field]: value } : c));
  };

  const removeCounterCard = (idx: number) => {
    setCounterCards(counterCards.filter((_, i) => i !== idx));
  };

  if (loading) return (
    <>
      <Nav />
      <div style={{ textAlign: 'center', padding: '80px 0', color: '#aaa', fontSize: 13 }}>Loading trade…</div>
      <Footer />
    </>
  );

  if (loadError) return (
    <>
      <Nav />
      <ErrorState message={loadError} onRetry={() => { setLoading(true); setReloadKey(k => k + 1); }} />
      <Footer />
    </>
  );

  if (!trade) return (
    <>
      <Nav />
      <div style={{ textAlign: 'center', padding: '80px 0', color: '#888' }}>Trade not found.</div>
      <Footer />
    </>
  );

  const isInitiator = trade.initiator_id === userId;
  const isRecipient = trade.recipient_id === userId;
  const partnerName = isInitiator ? (trade.recipient?.username ?? 'Unknown') : (trade.initiator?.username ?? 'Unknown');
  const partnerRep = isInitiator ? trade.recipient?.reputation_score : trade.initiator?.reputation_score;
  const myConfirmed = isInitiator ? trade.initiator_confirmed : trade.recipient_confirmed;
  const offeredCards: OfferedCard[] = normalizeCards(trade.offered_cards);
  // Money-carrying deals must be escrowed before they can proceed: the buyer
  // (initiator) funds, then shipping/confirmation unlocks. Mirrors the gate the
  // server enforces in complete_trade (migration 018).
  const needsEscrow = trade.offer_type === 'purchase' || (trade.cash_amount ?? 0) > 0;
  const escrowFunded = ['paid', 'verified'].includes(trade.payment_status ?? '');
  const escrowBlocking = needsEscrow && !escrowFunded;

  return (
    <>
      <Nav />
      {toast && (
        <div style={{ position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)', background: toast.ok ? '#111' : '#c0392b', color: '#fff', padding: '11px 22px', borderRadius: 6, fontSize: 13.5, fontWeight: 500, zIndex: 1000, boxShadow: '0 4px 24px rgba(0,0,0,0.22)', whiteSpace: 'nowrap', pointerEvents: 'none' }}>
          {toast.msg}
        </div>
      )}

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 20px' }}>
        {/* Header */}
        <div className="listing-toolbar" style={{ marginBottom: 12 }}>
          <button onClick={() => router.push('/trades')} style={{ background: 'none', border: 'none', fontSize: 13, color: '#777', cursor: 'pointer', padding: 0 }}>← Offers</button>
          <div className="listing-title" style={{ flex: 1 }}>
            Trade with {partnerName}
            <ReputationStars score={partnerRep ?? null} />
            {trade.listing_id && (
              <a href={`/listings/${trade.listing_id}`} style={{ marginLeft: 16, fontSize: 12, fontWeight: 500, color: '#555', textDecoration: 'underline' }}>
                View Listing
              </a>
            )}
          </div>
        </div>

        {/* Timeline */}
        <TradeTimeline status={trade.status} />

        <div className="trade-detail-grid">
          {/* Left: trade items + actions */}
          <div>
            <div className="trade-cards-grid" style={{ marginBottom: 24 }}>
              {/* Offered cards */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: '#555', marginBottom: 10 }}>
                  {isInitiator ? 'You Offer' : `${trade.initiator?.username ?? 'They'} Offer`}
                </div>
                {offeredCards.length === 0 ? (
                  <div style={{ color: '#ccc', fontSize: 12 }}>No cards offered</div>
                ) : (
                  <div style={{ border: '1px solid #e5e5e5', borderRadius: 6, overflow: 'hidden' }}>
                    {offeredCards.map((card, i) => (
                      <div key={i} style={{
                        padding: '10px 14px',
                        borderBottom: i < offeredCards.length - 1 ? '1px solid #f0f0f0' : 'none',
                        background: '#fff',
                      }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#111' }}>{card.card_name}</div>
                        <div style={{ fontSize: 11, color: '#777', marginTop: 2 }}>
                          {card.set_name && <span>{card.set_name}</span>}
                          {card.set_name && card.condition && <span> · </span>}
                          {card.condition && <span>{card.condition}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Requested items */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: '#555', marginBottom: 10 }}>
                  {isInitiator ? 'You Request' : `${trade.recipient?.username ?? 'They'} Request`}
                </div>
                {requestedItems.length === 0 ? (
                  <div style={{ color: '#ccc', fontSize: 12 }}>No cards requested</div>
                ) : (
                  <div style={{ border: '1px solid #e5e5e5', borderRadius: 6, overflow: 'hidden' }}>
                    {requestedItems.map((item, i) => (
                      <div key={item.id} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '10px 14px',
                        borderBottom: i < requestedItems.length - 1 ? '1px solid #f0f0f0' : 'none',
                        background: '#fff',
                      }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#111' }}>{item.card_name}</div>
                          <div style={{ fontSize: 11, color: '#777', marginTop: 2 }}>
                            {item.set_name && <span>{item.set_name}</span>}
                            {item.set_name && item.condition_text && <span> · </span>}
                            {item.condition_text && <span>{item.condition_text}</span>}
                          </div>
                        </div>
                        {item.custom_price != null && (
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#333' }}>
                            ${item.custom_price.toFixed(2)}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Cash offer */}
            {trade.cash_amount != null && trade.cash_amount > 0 && (
              <div style={{ marginBottom: 12, padding: '8px 12px', background: '#edf9f1', border: '1px solid #7bc99b', borderRadius: 4, display: 'inline-block', fontSize: 13, color: '#1a6b3a', fontWeight: 600 }}>
                Includes Cash Offer: ${trade.cash_amount.toFixed(2)}
              </div>
            )}

            {/* Escrow: the buyer funds the cash owed before the deal proceeds */}
            {needsEscrow && trade.status === 'accepted' && !escrowFunded && isInitiator && (
              <button
                style={{ fontSize: 15, fontWeight: 700, fontFamily: 'inherit', padding: '14px 20px', border: 'none', borderRadius: 4, cursor: 'pointer', background: '#1e8a4a', color: '#fff', marginTop: 16, width: '100%' }}
                disabled={actionLoading}
                onClick={() => setPayOpen(true)}
              >
                Pay Now — ${(trade.cash_amount ?? 0).toFixed(2)}
              </button>
            )}
            {needsEscrow && trade.status === 'accepted' && !escrowFunded && !isInitiator && (
              <div style={{ fontSize: 12.5, color: '#555', marginTop: 16 }}>
                Waiting for the buyer to fund escrow before the deal can proceed.
              </div>
            )}
            {needsEscrow && escrowFunded && ['accepted', 'completed'].includes(trade.status) && (
              <div style={{ fontSize: 12, color: '#1a8c49', fontWeight: 600, marginTop: 16 }}>
                ✓ Payment held in escrow
              </div>
            )}

            {/* Action buttons */}
            {trade.status !== 'completed' && trade.status !== 'cancelled' && trade.status !== 'disputed' && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
                {isRecipient && ['proposed', 'countered'].includes(trade.status) && (
                  <button style={{ flex: 1, fontSize: 15, fontWeight: 700, fontFamily: 'inherit', padding: '14px 20px', border: 'none', borderRadius: 4, cursor: 'pointer', background: '#1e8a4a', color: '#fff' }} disabled={actionLoading} onClick={() => rpc('accept_trade')}>
                    Accept
                  </button>
                )}
                {isRecipient && ['proposed', 'countered'].includes(trade.status) && (
                  <button
                    style={{ flex: 1, fontSize: 15, fontWeight: 700, fontFamily: 'inherit', padding: '14px 20px', border: 'none', borderRadius: 4, cursor: 'pointer', background: '#1d6fa8', color: '#fff' }}
                    disabled={actionLoading}
                    onClick={() => { setCounterCards([{ card_name: '', set_name: '', condition: '' }]); setCounterOpen(true); }}
                  >
                    Counter
                  </button>
                )}
                {isRecipient && ['proposed', 'countered'].includes(trade.status) && (
                  <button style={{ flex: 1, fontSize: 15, fontWeight: 700, fontFamily: 'inherit', padding: '14px 20px', border: 'none', borderRadius: 4, cursor: 'pointer', background: '#c03535', color: '#fff' }} disabled={actionLoading} onClick={() => rpc('cancel_trade')}>
                    Reject
                  </button>
                )}
                {(isInitiator || isRecipient) && trade.status === 'accepted' && (
                  <button style={{ flex: 1, fontSize: 13, fontWeight: 600, fontFamily: 'inherit', padding: '14px 20px', background: '#fff', color: '#111', border: '1.5px solid #111', borderRadius: 4, cursor: 'pointer', margin: 0 }} disabled={actionLoading} onClick={() => rpc('cancel_trade')}>
                    Cancel
                  </button>
                )}
                {trade.status === 'accepted' && !trade.shipped_at && !escrowBlocking && (
                  <button style={{ flex: 1, fontSize: 13, fontWeight: 600, fontFamily: 'inherit', padding: '14px 20px', background: '#fff', color: '#111', border: '1.5px solid #111', borderRadius: 4, cursor: 'pointer', margin: 0 }} disabled={actionLoading} onClick={() => { setTrackingInput(''); setCarrierInput(''); setShipOpen(true); }}>
                    Mark as Shipped
                  </button>
                )}
                {trade.status === 'accepted' && !myConfirmed && !escrowBlocking && (
                  <button style={{ flex: 1, fontSize: 13, fontWeight: 600, fontFamily: 'inherit', padding: '14px 20px', background: '#111', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', margin: 0 }} disabled={actionLoading} onClick={() => setConfirmShipmentOpen(true)}>
                    Confirm Receipt
                  </button>
                )}
                {trade.status === 'accepted' && (isInitiator || isRecipient) && (
                  <button
                    style={{ flex: 1, fontSize: 13, fontWeight: 600, fontFamily: 'inherit', padding: '14px 20px', background: '#fff', color: '#c0392b', border: '1.5px solid #c0392b', borderRadius: 4, cursor: 'pointer', margin: 0 }}
                    disabled={actionLoading}
                    onClick={() => setDisputeOpen(true)}
                  >
                    Open Dispute
                  </button>
                )}
                {trade.status === 'accepted' && myConfirmed && (
                  <div style={{ fontSize: 12.5, color: '#555', padding: '8px 0', width: '100%' }}>
                    Waiting for the other party to confirm receipt…
                    {trade.first_confirmed_at && (() => {
                      const deadline = new Date(trade.first_confirmed_at).getTime() + 7 * 24 * 60 * 60 * 1000;
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
              </div>
            )}

            {/* Dispute modal */}
            {disputeOpen && (
              <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ background: '#fff', borderRadius: 8, padding: 24, width: 400, maxWidth: '90vw' }}>
                  <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, color: '#111' }}>Open a Dispute</div>
                  <div style={{ fontSize: 12.5, color: '#555', marginBottom: 12 }}>
                    Describe the issue. An admin will review and determine the outcome. Deposits will remain locked until the dispute is resolved.
                  </div>
                  <textarea
                    className="login-field-input"
                    style={{ width: '100%', minHeight: 80, padding: '8px 12px', fontSize: 13, marginBottom: 12, resize: 'vertical' }}
                    placeholder="What went wrong? (e.g., wrong card received, item not as described, never arrived...)"
                    value={disputeReason}
                    onChange={(e) => setDisputeReason(e.target.value)}
                  />
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button
                      style={{ minWidth: 130, padding: '10px 20px', fontSize: 14, fontWeight: 600, fontFamily: 'inherit', borderRadius: 4, border: '1.5px solid #111', background: '#fff', color: '#111', cursor: 'pointer' }}
                      onClick={() => { setDisputeOpen(false); setDisputeReason(''); }}
                    >
                      Cancel
                    </button>
                    <button
                      style={{ minWidth: 130, padding: '10px 20px', fontSize: 14, fontWeight: 600, fontFamily: 'inherit', borderRadius: 4, border: 'none', background: '#c0392b', color: '#fff', cursor: 'pointer' }}
                      disabled={!disputeReason.trim() || actionLoading}
                      onClick={async () => {
                        await rpc('open_dispute', { p_reason: disputeReason.trim() });
                        setDisputeOpen(false);
                        setDisputeReason('');
                      }}
                    >
                      Submit Dispute
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Confirm Receipt modal */}
            {confirmShipmentOpen && (
              <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ background: '#fff', borderRadius: 8, padding: 24, width: 400, maxWidth: '90vw' }}>
                  <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10, color: '#111' }}>Confirm Receipt</div>
                  <div style={{ fontSize: 13, color: '#444', marginBottom: 20, lineHeight: 1.5 }}>
                    By confirming, you are verifying that the cards have been physically delivered to your address and you are satisfied with the shipment.
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      style={{ flex: 1, fontSize: 13, fontWeight: 600, fontFamily: 'inherit', padding: '10px 16px', background: '#fff', color: '#111', border: '1.5px solid #111', borderRadius: 4, cursor: 'pointer', margin: 0 }}
                      onClick={() => setConfirmShipmentOpen(false)}
                    >
                      Cancel
                    </button>
                    <button
                      style={{ flex: 1, fontSize: 13, fontWeight: 600, fontFamily: 'inherit', padding: '10px 16px', background: '#111', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', margin: 0 }}
                      disabled={actionLoading}
                      onClick={async () => { setConfirmShipmentOpen(false); await rpc('complete_trade'); }}
                    >
                      Yes, Confirm
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Mark as Shipped modal */}
            {shipOpen && (
              <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ background: '#fff', borderRadius: 8, padding: 24, width: 400, maxWidth: '90vw' }}>
                  <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10, color: '#111' }}>Mark as Shipped</div>
                  <div style={{ fontSize: 12.5, color: '#555', marginBottom: 14, lineHeight: 1.5 }}>
                    Enter the carrier tracking number. This is your proof of shipment — if your partner disputes delivery, the carrier&apos;s delivery scan determines the outcome.
                  </div>
                  <input
                    className="login-field-input"
                    style={{ width: '100%', padding: '8px 12px', fontSize: 13, marginBottom: 8 }}
                    placeholder="Tracking number *"
                    value={trackingInput}
                    onChange={(e) => setTrackingInput(e.target.value)}
                  />
                  <input
                    className="login-field-input"
                    style={{ width: '100%', padding: '8px 12px', fontSize: 13, marginBottom: 14 }}
                    placeholder="Carrier (e.g., USPS, UPS, FedEx) — optional"
                    value={carrierInput}
                    onChange={(e) => setCarrierInput(e.target.value)}
                  />
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button
                      style={{ minWidth: 120, padding: '10px 20px', fontSize: 14, fontWeight: 600, fontFamily: 'inherit', borderRadius: 4, border: '1.5px solid #111', background: '#fff', color: '#111', cursor: 'pointer' }}
                      onClick={() => setShipOpen(false)}
                    >
                      Cancel
                    </button>
                    <button
                      style={{ minWidth: 120, padding: '10px 20px', fontSize: 14, fontWeight: 600, fontFamily: 'inherit', borderRadius: 4, border: 'none', background: '#111', color: '#fff', cursor: 'pointer' }}
                      disabled={!trackingInput.trim() || actionLoading}
                      onClick={async () => {
                        await rpc('mark_shipped', { p_tracking_number: trackingInput.trim(), p_carrier: carrierInput.trim() || null });
                        setShipOpen(false);
                      }}
                    >
                      Save
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Counter-offer modal */}
            {counterOpen && (
              <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ background: '#fff', borderRadius: 8, padding: 24, width: 500, maxWidth: '90vw', maxHeight: '80vh', overflowY: 'auto' }}>
                  <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4, color: '#111' }}>Counter Offer</div>
                  <div style={{ fontSize: 12.5, color: '#555', marginBottom: 16 }}>
                    Propose different terms. Add cards you&apos;re willing to offer and/or a cash amount.
                  </div>

                  <div style={{ fontSize: 12, fontWeight: 600, color: '#333', marginBottom: 8 }}>Cards You Offer</div>
                  {counterCards.map((card, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: 6, marginBottom: 8, alignItems: 'flex-start' }}>
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <input
                          className="login-field-input"
                          style={{ marginBottom: 0, padding: '7px 10px', fontSize: 13 }}
                          placeholder="Card name *"
                          value={card.card_name}
                          onChange={(e) => updateCounterCard(idx, 'card_name', e.target.value)}
                        />
                        <div style={{ display: 'flex', gap: 4 }}>
                          <input
                            className="login-field-input"
                            style={{ marginBottom: 0, padding: '6px 10px', fontSize: 12, flex: 1 }}
                            placeholder="Set (optional)"
                            value={card.set_name}
                            onChange={(e) => updateCounterCard(idx, 'set_name', e.target.value)}
                          />
                          <input
                            className="login-field-input"
                            style={{ marginBottom: 0, padding: '6px 10px', fontSize: 12, flex: 1 }}
                            placeholder="Condition (optional)"
                            value={card.condition}
                            onChange={(e) => updateCounterCard(idx, 'condition', e.target.value)}
                          />
                        </div>
                      </div>
                      <button
                        onClick={() => removeCounterCard(idx)}
                        style={{ background: 'none', border: 'none', color: '#c0392b', fontSize: 18, cursor: 'pointer', padding: '4px 8px', lineHeight: 1 }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={addCounterCard}
                    style={{ background: 'none', border: '1px dashed #ccc', borderRadius: 4, padding: '6px 12px', fontSize: 12, color: '#555', cursor: 'pointer', marginBottom: 16, width: '100%' }}
                  >
                    + Add Card
                  </button>

                  <div style={{ fontSize: 12, fontWeight: 600, color: '#333', marginBottom: 6 }}>Cash Amount (optional)</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 16 }}>
                    <span style={{ fontSize: 14, color: '#555' }}>$</span>
                    <input
                      className="login-field-input"
                      type="number"
                      min="0"
                      step="0.01"
                      style={{ marginBottom: 0, padding: '7px 10px', fontSize: 13, width: 120 }}
                      placeholder="0.00"
                      value={counterCash}
                      onChange={(e) => setCounterCash(e.target.value)}
                    />
                  </div>

                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      style={{ flex: 1, padding: '10px 16px', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', background: '#fff', color: '#111', border: '1.5px solid #111', borderRadius: 4, margin: 0 }}
                      onClick={() => { setCounterOpen(false); setCounterCards([]); setCounterCash(''); }}
                    >
                      Cancel
                    </button>
                    <button
                      style={{ flex: 1, padding: '10px 16px', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', background: '#6b21a8', color: '#fff', border: 'none', borderRadius: 4, margin: 0 }}
                      disabled={actionLoading}
                      onClick={handleCounter}
                    >
                      Send Counter
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Dispute status display */}
            {trade.status === 'disputed' && (
              <div style={{ marginTop: 16, padding: 16, border: '1px solid #f5c6cb', borderRadius: 8, background: '#fff5f5' }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#c0392b', marginBottom: 8 }}>Trade Disputed</div>
                <div style={{ fontSize: 12.5, color: '#555', marginBottom: 8 }}>
                  Opened by {trade.disputed_by === userId ? 'you' : partnerName}
                  {trade.disputed_at && <span> on {new Date(trade.disputed_at).toLocaleDateString()}</span>}
                </div>
                {trade.dispute_reason && (
                  <div style={{ fontSize: 12.5, color: '#333', padding: '8px 12px', background: '#fff', border: '1px solid #e5e5e5', borderRadius: 4, marginBottom: 8 }}>
                    {trade.dispute_reason}
                  </div>
                )}
                <div style={{ fontSize: 12, color: '#888' }}>
                  An admin will review this dispute and determine the outcome. Deposits remain locked until resolved.
                </div>
              </div>
            )}

            {/* Resolved-dispute outcome */}
            {trade.dispute_resolution && (
              <div style={{ marginTop: 16, padding: 16, border: '1px solid #cfe8d6', borderRadius: 8, background: '#f6fbf7' }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#1a8c49', marginBottom: 6 }}>Dispute Resolved</div>
                <div style={{ fontSize: 12.5, color: '#444' }}>
                  {trade.dispute_resolution === 'refund_both'
                    ? 'Both parties were refunded — each got their own funds back.'
                    : trade.dispute_resolution === 'release_to_initiator'
                    ? (isInitiator ? 'Resolved in your favor — escrowed funds were released to you.' : 'Funds were released to the buyer.')
                    : (isRecipient ? 'Resolved in your favor — escrowed funds were released to you.' : 'Funds were released to the seller.')}
                </div>
              </div>
            )}

            {/* Security Deposit Section */}
            {(['accepted', 'completed', 'disputed'].includes(trade.status)) && (
              <DepositSection
                tradeId={trade.id}
                depositAmount={trade.deposit_amount ?? null}
                initiatorLocked={trade.initiator_deposit_locked ?? false}
                recipientLocked={trade.recipient_deposit_locked ?? false}
                isInitiator={isInitiator}
                partnerName={partnerName}
              />
            )}

            {/* Shipping Info Section */}
            {['accepted', 'completed', 'disputed'].includes(trade.status) && (isInitiator || isRecipient) && (
              <div style={{ marginTop: 24, padding: 16, border: '1px solid #ebebeb', borderRadius: 8, background: '#fafafa' }}>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6, color: '#111' }}>
                  Shipping Info
                </div>
                <div style={{ fontSize: 12, color: '#555', marginBottom: 12 }}>
                  {`Ship items to your trade partner's address below.`}
                </div>
                {shippingLoading ? (
                  <div style={{ fontSize: 12, color: '#aaa' }}>Loading address…</div>
                ) : shippingAddresses.length > 0 ? (
                  shippingAddresses.map((addr) => (
                    <div key={addr.id} style={{ padding: '10px 12px', border: '1px solid #e5e5e5', borderRadius: 6, background: '#fff', marginBottom: 6 }}>
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
                {trade.tracking_number && (
                  <div style={{ marginTop: 8, fontSize: 12, color: '#555' }}>
                    Tracking: <span style={{ fontFamily: 'monospace', color: '#333', fontWeight: 600 }}>{trade.tracking_number}</span>
                    {trade.carrier && <span style={{ color: '#777' }}> · {trade.carrier}</span>}
                    {trade.shipped_at && (
                      <span style={{ color: '#999' }}> · shipped {new Date(trade.shipped_at).toLocaleDateString()}</span>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Star rating */}
            {trade.status === 'completed' && (isInitiator || isRecipient) && (
              <div style={{ marginTop: 24, padding: '16px', border: '1px solid #e5e5e5', borderRadius: 4 }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6, color: '#111' }}>
                  Rate your experience with {partnerName}
                </div>
                {rated ? (
                  <div style={{ fontSize: 12.5, color: '#3db56c', fontWeight: 600 }}>✓ Rating submitted — thanks!</div>
                ) : (
                  <>
                    <div style={{ fontSize: 12, color: '#888', marginBottom: 10 }}>How was this trade? Your rating updates their reputation score.</div>
                    <StarRatingWidget onRate={handleRate} />
                  </>
                )}
              </div>
            )}
          </div>

          {/* Right: chat panel */}
          <div style={{ border: '1px solid #e5e5e5', borderRadius: 4, display: 'flex', flexDirection: 'column', height: 480 }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid #e5e5e5', fontSize: 13, fontWeight: 600 }}>
              Messages
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {messages.length === 0 && (
                <div style={{ color: '#ccc', fontSize: 12, textAlign: 'center', marginTop: 20 }}>No messages yet.</div>
              )}
              {messages.map((msg) => {
                const isMe = msg.sender_id === userId;
                return (
                  <div key={msg.id} style={{ alignSelf: isMe ? 'flex-end' : 'flex-start', maxWidth: '80%' }}>
                    <div style={{ fontSize: 10.5, color: '#aaa', marginBottom: 3, textAlign: isMe ? 'right' : 'left' }}>
                      {msg.profiles?.username ?? 'Unknown'}
                    </div>
                    <div style={{ background: isMe ? '#111' : '#f5f5f5', color: isMe ? '#fff' : '#111', padding: '8px 12px', borderRadius: isMe ? '12px 12px 3px 12px' : '12px 12px 12px 3px', fontSize: 13, lineHeight: 1.45 }}>
                      {msg.content}
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>
            {!['completed', 'cancelled'].includes(trade.status) && (
              <div style={{ padding: '10px 14px', borderTop: '1px solid #e5e5e5', display: 'flex', gap: 8 }}>
                <input
                  className="login-field-input"
                  style={{ flex: 1, marginBottom: 0, padding: '8px 12px', fontSize: 13 }}
                  placeholder="Type a message…"
                  value={msgInput}
                  onChange={(e) => setMsgInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') sendMessage(); }}
                />
                <button className="modal-confirm" style={{ padding: '8px 16px', fontSize: 13, flex: 'none', whiteSpace: 'nowrap' }} onClick={sendMessage}>Send</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {payOpen && (
        <PaymentModal
          offerId={trade.id}
          amount={trade.cash_amount ?? 0}
          onClose={() => { setPayOpen(false); setReloadKey((k) => k + 1); }}
        />
      )}

      <Footer />
    </>
  );
}
