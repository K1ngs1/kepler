'use client';

import { useState, useEffect, useRef } from 'react';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import { createClient } from '@/lib/supabase/client';
import { useParams, useRouter } from 'next/navigation';

interface CardInfo {
  name: string;
  set_name: string;
  number: string;
  image_url: string | null;
}

interface TradeItem {
  id: string;
  direction: 'offer' | 'request';
  user_card_id: string;
  user_cards: {
    condition: string;
    catalog_cards: CardInfo | null;
  } | null;
}

interface TradeMessage {
  id: string;
  sender_id: string;
  content: string;
  sent_at: string;
  profiles: { username: string | null } | null;
}

interface Trade {
  id: string;
  status: string;
  initiator_id: string;
  recipient_id: string;
  initiator_confirmed: boolean;
  recipient_confirmed: boolean;
  created_at: string;
  updated_at: string;
  initiator: { username: string | null; reputation_score: number | null } | null;
  recipient: { username: string | null; reputation_score: number | null } | null;
}

const STATUS_LABELS: Record<string, string> = {
  proposed: 'Proposed', countered: 'Countered', accepted: 'Accepted',
  completed: 'Completed', cancelled: 'Cancelled',
};

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
  const currentIdx = TIMELINE_STEPS.indexOf(status === 'countered' ? 'proposed' : status);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 20 }}>
      {TIMELINE_STEPS.map((step, i) => {
        const done = i <= currentIdx;
        const active = i === currentIdx;
        return (
          <div key={step} style={{ display: 'flex', alignItems: 'center', flex: i < TIMELINE_STEPS.length - 1 ? 1 : 'none' }}>
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
            {i < TIMELINE_STEPS.length - 1 && (
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
  const [items, setItems] = useState<TradeItem[]>([]);
  const [messages, setMessages] = useState<TradeMessage[]>([]);
  const [msgInput, setMsgInput] = useState('');
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [rated, setRated] = useState(false);
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
        if (data) setTrade(data as Trade);
      };

      const loadItems = async () => {
        const res = await fetch(`/api/trade-items/${id}`);
        if (res.ok) {
          const data = await res.json();
          setItems(data as TradeItem[]);
        }
      };

      const loadMessages = async () => {
        const { data } = await supabase
          .from('trade_messages')
          .select('id, sender_id, content, sent_at, profiles(username)')
          .eq('trade_id', id)
          .order('sent_at', { ascending: true });
        if (data) setMessages(data as TradeMessage[]);
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      };

      // check if current user already rated this trade
      const checkRated = async () => {
        const { data } = await supabase
          .from('trade_ratings')
          .select('id')
          .eq('trade_id', id)
          .eq('rater_id', user.id)
          .maybeSingle();
        if (data) setRated(true);
      };

      await Promise.all([loadTrade(), loadItems(), loadMessages(), checkRated()]);
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

  const RPC_LABELS: Record<string, string> = {
    accept_trade: 'Trade accepted!',
    cancel_trade: 'Trade cancelled.',
    complete_trade: 'Receipt confirmed!',
  };

  const rpc = async (fn: string) => {
    setActionLoading(true);
    const supabase = createClient();
    if (!supabase) return;
    const { error } = await supabase.rpc(fn, { p_trade_id: id });
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
  const offered = items.filter((i) => i.direction === 'offer');
  const requested = items.filter((i) => i.direction === 'request');
  const myConfirmed = isInitiator ? trade.initiator_confirmed : trade.recipient_confirmed;

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
          <button onClick={() => router.push('/trades')} style={{ background: 'none', border: 'none', fontSize: 13, color: '#777', cursor: 'pointer', padding: 0 }}>← Trades</button>
          <div className="listing-title" style={{ flex: 1 }}>
            Trade with {partnerName}
            <ReputationStars score={partnerRep ?? null} />
          </div>
        </div>

        {/* Timeline */}
        <TradeTimeline status={trade.status} />

        <div className="trade-detail-grid">
          {/* Left: trade items + actions */}
          <div>
            {/* Cards */}
            <div className="trade-cards-grid" style={{ marginBottom: 24 }}>
              {/* Offered */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: '#555', marginBottom: 10 }}>
                  {isInitiator ? 'You Offer' : `${trade.initiator?.username ?? 'They'} Offer`}
                </div>
                {offered.length === 0 ? (
                  <div style={{ color: '#ccc', fontSize: 12 }}>No cards</div>
                ) : offered.map((item) => {
                  const card = item.user_cards?.catalog_cards;
                  return (
                    <div key={item.id} className="collection-card" style={{ marginBottom: 10 }}>
                      <div className="collection-card-img">
                        {card?.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={card.image_url} alt={card.name} loading="lazy" style={{ maxHeight: 110, maxWidth: '85%', objectFit: 'contain' }} />
                        ) : <div style={{ color: '#ccc', fontSize: 11 }}>{card ? 'No image' : 'Card unavailable'}</div>}
                      </div>
                      <div className="collection-card-body">
                        <div className="collection-card-name">{card?.name ?? 'Card no longer available'}</div>
                        <div className="collection-card-set">{card ? `${card.set_name} · #${card.number}` : '—'}</div>
                        <div style={{ fontSize: 11, color: '#888' }}>{item.user_cards?.condition ?? ''}</div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Requested */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: '#555', marginBottom: 10 }}>
                  {isInitiator ? 'You Request' : `${trade.recipient?.username ?? 'They'} Request`}
                </div>
                {requested.length === 0 ? (
                  <div style={{ color: '#ccc', fontSize: 12 }}>No cards</div>
                ) : requested.map((item) => {
                  const card = item.user_cards?.catalog_cards;
                  return (
                    <div key={item.id} className="collection-card" style={{ marginBottom: 10 }}>
                      <div className="collection-card-img">
                        {card?.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={card.image_url} alt={card.name} loading="lazy" style={{ maxHeight: 110, maxWidth: '85%', objectFit: 'contain' }} />
                        ) : <div style={{ color: '#ccc', fontSize: 11 }}>{card ? 'No image' : 'Card unavailable'}</div>}
                      </div>
                      <div className="collection-card-body">
                        <div className="collection-card-name">{card?.name ?? 'Card no longer available'}</div>
                        <div className="collection-card-set">{card ? `${card.set_name} · #${card.number}` : '—'}</div>
                        <div style={{ fontSize: 11, color: '#888' }}>{item.user_cards?.condition ?? ''}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Action buttons */}
            {trade.status !== 'completed' && trade.status !== 'cancelled' && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
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

            {/* Star rating — shown when completed and user hasn't rated yet */}
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
            {trade.status !== 'completed' && trade.status !== 'cancelled' && (
              <div style={{ padding: '10px 14px', borderTop: '1px solid #e5e5e5', display: 'flex', gap: 8 }}>
                <input
                  className="login-field-input"
                  style={{ flex: 1, marginBottom: 0, padding: '8px 12px', fontSize: 13 }}
                  placeholder="Type a message…"
                  value={msgInput}
                  onChange={(e) => setMsgInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') sendMessage(); }}
                />
                <button className="modal-confirm" style={{ padding: '8px 14px', fontSize: 13 }} onClick={sendMessage}>Send</button>
              </div>
            )}
          </div>
        </div>
      </div>
      <Footer />
    </>
  );
}
