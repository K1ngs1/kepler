'use client';

import { useState, useEffect, useRef } from 'react';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import DepositSection from '@/components/DepositSection';
import { createClient } from '@/lib/supabase/client';
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
  listing_id?: string | null;
  offered_cards?: OfferedCard[] | null;
  requested_listing_item_ids?: string[] | null;
  deposit_amount?: number | null;
  initiator_deposit_locked?: boolean;
  recipient_deposit_locked?: boolean;
  middleman_id?: string | null;
  middleman_status?: string | null;
  middleman_fee?: number | null;
  middleman_confirmed?: boolean;
  middleman_requested_by?: string[] | null;
  tracking_number?: string | null;
  created_at: string;
  updated_at: string;
  initiator: { username: string | null; reputation_score: number | null } | null;
  recipient: { username: string | null; reputation_score: number | null } | null;
}

const TIMELINE_STEPS_BASIC = ['proposed', 'accepted', 'completed'];
const TIMELINE_STEPS_MIDDLEMAN = ['proposed', 'inspection', 'accepted', 'completed'];

function TradeTimeline({ status, hasMiddleman }: { status: string; hasMiddleman: boolean }) {
  if (status === 'cancelled') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 20 }}>
        <span className="trade-status-chip trade-status-cancelled" style={{ fontSize: 12 }}>Cancelled</span>
        <span style={{ fontSize: 12, color: '#999' }}>This trade was cancelled.</span>
      </div>
    );
  }
  const steps = hasMiddleman ? TIMELINE_STEPS_MIDDLEMAN : TIMELINE_STEPS_BASIC;
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
  const [actionLoading, setActionLoading] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [rated, setRated] = useState(false);
  const [middlemanRequested, setMiddlemanRequested] = useState(false);
  const [shippingAddresses, setShippingAddresses] = useState<ShippingAddr[]>([]);
  const [shippingLoading, setShippingLoading] = useState(false);
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

    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { setLoading(false); return; }
      setUserId(user.id);

      const loadTrade = async () => {
        const { data } = await supabase
          .from('trade_offers')
          .select('*, initiator:profiles!trade_offers_initiator_id_fkey(username, reputation_score), recipient:profiles!trade_offers_recipient_id_fkey(username, reputation_score)')
          .eq('id', id)
          .single();
        if (data) {
          setTrade(data as unknown as Trade);
          const requestedBy: string[] = data.middleman_requested_by || [];
          setMiddlemanRequested(requestedBy.includes(user.id));

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
          if (['accepted', 'inspection', 'completed'].includes(data.status)) {
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
        } catch { /* ignore */ }
        setShippingLoading(false);
      };

      const loadMessages = async () => {
        const { data } = await supabase
          .from('trade_messages')
          .select('id, sender_id, content, sent_at, profiles(username)')
          .eq('trade_id', id)
          .order('sent_at', { ascending: true });
        if (data) setMessages(data as unknown as TradeMessage[]);
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      };

      const checkRated = async () => {
        const { data } = await supabase
          .from('trade_ratings')
          .select('id')
          .eq('trade_id', id)
          .eq('rater_id', user.id)
          .maybeSingle();
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

    return () => { tradeSub?.unsubscribe(); msgSub?.unsubscribe(); };
  }, [id]);

  const sendMessage = async () => {
    if (!msgInput.trim() || !userId) return;
    const supabase = createClient();
    if (!supabase) return;
    const { error } = await supabase.from('trade_messages').insert({ trade_id: id, sender_id: userId, content: msgInput.trim() });
    if (error) showToast(error.message, false);
    else setMsgInput('');
  };

  const MIDDLEMAN_ID = process.env.NEXT_PUBLIC_MIDDLEMAN_ID || null;

  const RPC_LABELS: Record<string, string> = {
    accept_trade: 'Trade accepted!',
    cancel_trade: 'Trade cancelled.',
    complete_trade: 'Receipt confirmed!',
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

  const handleMiddlemanToggle = async () => {
    if (!userId || !trade) return;
    const supabase = createClient();
    if (!supabase) return;

    const currentRequests: string[] = trade.middleman_requested_by || [];
    let newRequests: string[];
    let updates: Record<string, unknown> = {};

    if (currentRequests.includes(userId)) {
      // Remove request
      newRequests = currentRequests.filter(u => u !== userId);
      setMiddlemanRequested(false);
    } else {
      // Add request
      newRequests = [...currentRequests, userId];
      setMiddlemanRequested(true);
    }

    updates.middleman_requested_by = newRequests;

    // If both parties have requested, assign the middleman
    const bothRequested = newRequests.includes(trade.initiator_id) && newRequests.includes(trade.recipient_id);
    if (bothRequested && MIDDLEMAN_ID) {
      updates.middleman_id = MIDDLEMAN_ID;
      updates.middleman_fee = (trade.deposit_amount || 0) * 0.05; // 5% fee
    } else if (!bothRequested) {
      updates.middleman_id = null;
      updates.middleman_fee = 0;
    }

    await supabase.from('trade_offers').update(updates).eq('id', trade.id);
  };

  const handleRate = async (rating: number) => {
    const supabase = createClient();
    if (!supabase) return;
    const { error } = await supabase.rpc('rate_trade', { p_trade_id: id, p_rating: rating });
    if (error) showToast(error.message, false);
    else { setRated(true); showToast('Rating submitted!'); }
  };

  if (loading) return (
    <>
      <Nav />
      <div style={{ textAlign: 'center', padding: '80px 0', color: '#aaa', fontSize: 13 }}>Loading trade…</div>
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
  const offeredCards: OfferedCard[] = trade.offered_cards || [];

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
        <TradeTimeline status={trade.status} hasMiddleman={!!trade.middleman_id} />

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

            {/* Middleman request checkbox (only before acceptance) */}
            {(isInitiator || isRecipient) && ['proposed', 'countered'].includes(trade.status) && MIDDLEMAN_ID && (
              <div style={{ marginTop: 12, padding: '10px 12px', border: '1px solid #e5e5e5', borderRadius: 6, background: '#fafafa' }}>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={middlemanRequested}
                    onChange={handleMiddlemanToggle}
                    style={{ marginTop: 2, accentColor: '#111', width: 14, height: 14, flexShrink: 0 }}
                  />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#111' }}>Request Middleman</div>
                    <div style={{ fontSize: 11.5, color: '#888', marginTop: 2 }}>
                      A trusted middleman will verify items before completing the trade.
                      {trade.middleman_id ? (
                        <span style={{ display: 'block', marginTop: 3, color: '#3db56c', fontWeight: 600 }}>Both parties agreed — middleman assigned.</span>
                      ) : (
                        <span style={{ display: 'block', marginTop: 3, color: '#e5a000' }}>
                          Both parties must agree.
                          {(() => {
                            const reqs = trade.middleman_requested_by || [];
                            const otherRequested = isInitiator ? reqs.includes(trade.recipient_id) : reqs.includes(trade.initiator_id);
                            if (middlemanRequested && !otherRequested) return ' Waiting for the other party…';
                            if (!middlemanRequested && otherRequested) return ' The other party has requested a middleman.';
                            return '';
                          })()}
                        </span>
                      )}
                    </div>
                  </div>
                </label>
              </div>
            )}

            {/* Middleman status display (during inspection) */}
            {trade.status === 'inspection' && trade.middleman_id && (
              <div style={{ marginTop: 12, padding: '10px 12px', border: '1px solid #e5e5e5', borderRadius: 6, background: '#fafafa' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#111', marginBottom: 4 }}>Middleman Inspection</div>
                <div style={{ fontSize: 12, color: '#555' }}>
                  Status: <span className="trade-status-chip" style={{ fontSize: 11, background: '#fff3cd', color: '#856404' }}>{trade.middleman_status || 'pending'}</span>
                </div>
                <div style={{ fontSize: 11.5, color: '#888', marginTop: 6 }}>
                  The middleman is inspecting the items. The trade will move to &quot;accepted&quot; once verification and shipping are complete.
                </div>
              </div>
            )}

            {/* Middleman actions (only visible to the middleman user) */}
            {trade.status === 'inspection' && trade.middleman_id === userId && (
              <div style={{ marginTop: 12, padding: '12px', border: '1px solid #cce5ff', borderRadius: 6, background: '#f0f7ff' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#004085', marginBottom: 8 }}>Middleman Actions</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {['received', 'verified', 'shipped'].map((s) => (
                    <button
                      key={s}
                      className="btn-outline-ext"
                      style={{ width: 'auto', padding: '7px 14px', fontSize: 12, marginTop: 0, textTransform: 'capitalize' }}
                      disabled={actionLoading}
                      onClick={() => rpc('update_middleman_status', { p_status: s })}
                    >
                      Mark as {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Action buttons */}
            {trade.status !== 'completed' && trade.status !== 'cancelled' && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
                {isRecipient && trade.status === 'proposed' && (
                  <button className="btn-place-bid" style={{ flex: 1, fontSize: 13 }} disabled={actionLoading} onClick={() => rpc('accept_trade')}>
                    Accept Trade
                  </button>
                )}
                {(isInitiator || isRecipient) && ['proposed', 'countered', 'accepted'].includes(trade.status) && (
                  <button className="btn-watchlist" style={{ flex: 1, fontSize: 13 }} disabled={actionLoading} onClick={() => rpc('cancel_trade')}>
                    Cancel
                  </button>
                )}
                {trade.status === 'accepted' && !myConfirmed && (
                  <button className="btn-place-bid" style={{ flex: 1, fontSize: 13 }} disabled={actionLoading} onClick={() => rpc('complete_trade')}>
                    Confirm Receipt
                  </button>
                )}
                {trade.status === 'accepted' && myConfirmed && (
                  <div style={{ fontSize: 12.5, color: '#555', padding: '8px 0' }}>
                    Waiting for the other party to confirm receipt…
                  </div>
                )}
              </div>
            )}

            {/* Security Deposit Section */}
            {(trade.status === 'accepted' || trade.status === 'completed' || trade.status === 'inspection') && (
              <DepositSection
                tradeId={trade.id}
                depositAmount={trade.deposit_amount ?? null}
                initiatorLocked={trade.initiator_deposit_locked ?? false}
                recipientLocked={trade.recipient_deposit_locked ?? false}
                isInitiator={isInitiator}
                partnerName={partnerName}
                middlemanId={trade.middleman_id}
                middlemanStatus={trade.middleman_status}
                middlemanFee={trade.middleman_fee}
                middlemanConfirmed={trade.middleman_confirmed}
              />
            )}

            {/* Shipping Info Section */}
            {['accepted', 'inspection', 'completed'].includes(trade.status) && (isInitiator || isRecipient) && (
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
      <Footer />
    </>
  );
}
