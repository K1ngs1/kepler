'use client';

import { useState, useEffect, Suspense, useCallback, useMemo } from 'react';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import PriceBadge from '@/components/PriceBadge';
import TradeValueSummary from '@/components/TradeValueSummary';
import { createClient } from '@/lib/supabase/client';
import { usePrices } from '@/lib/usePrices';
import { useRouter, useSearchParams } from 'next/navigation';

interface UserCard {
  id: string;
  condition: string;
  quantity: number;
  catalog_card_id: string;
  catalog_cards: {
    name: string;
    set_name: string;
    number: string;
    image_url: string | null;
  };
}

interface Profile {
  id: string;
  username: string | null;
}

/* ── CardPicker is defined OUTSIDE the form so React never remounts it ── */
interface CardPickerProps {
  cards: UserCard[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  label: string;
  prices?: Record<string, number>;
}

function CardPicker({ cards, selected, onToggle, label, prices = {} }: CardPickerProps) {
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: '#555', marginBottom: 12 }}>
        {label}
      </div>
      {cards.length === 0 ? (
        <div style={{ color: '#aaa', fontSize: 13, padding: '20px 0' }}>No cards available for trade.</div>
      ) : (
        <div className="card-picker-grid">
          {cards.map((card) => {
            const sel = selected.has(card.id);
            return (
              <div
                key={card.id}
                onClick={() => onToggle(card.id)}
                style={{
                  border: sel ? '2px solid #111' : '1px solid #e5e5e5',
                  borderRadius: 4, overflow: 'hidden', cursor: 'pointer',
                  background: sel ? '#f7f7f7' : '#fff',
                  transition: 'border-color 0.12s, background 0.12s',
                  userSelect: 'none',
                }}
              >
                <div style={{ height: 90, background: '#f8f8f8', display: 'flex', alignItems: 'center', justifyContent: 'center', borderBottom: '1px solid #f0f0f0' }}>
                  {card.catalog_cards.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={card.catalog_cards.image_url}
                      alt={card.catalog_cards.name}
                      loading="lazy"
                      style={{ maxHeight: 82, maxWidth: '88%', objectFit: 'contain' }}
                    />
                  ) : (
                    <div style={{ color: '#ccc', fontSize: 11 }}>No image</div>
                  )}
                </div>
                <div style={{ padding: '8px 10px' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#111', marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {card.catalog_cards.name}
                  </div>
                  <div style={{ fontSize: 10.5, color: '#888' }}>
                    {card.catalog_cards.set_name} · #{card.catalog_cards.number}
                  </div>
                  <div style={{ fontSize: 10.5, color: '#777', marginTop: 2 }}>{card.condition}</div>
                  <PriceBadge price={prices[card.catalog_card_id]} />
                  {sel && (
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: '#111', marginTop: 4 }}>✓ Selected</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Main form component ── */
function NewTradeForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const withUserId = searchParams.get('with');

  const [myCards, setMyCards] = useState<UserCard[]>([]);
  const [theirCards, setTheirCards] = useState<UserCard[]>([]);
  const [recipient, setRecipient] = useState<Profile | null>(null);
  const [offered, setOffered] = useState<Set<string>>(new Set());
  const [requested, setRequested] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const showToast = useCallback((msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const toggleOffered = useCallback((id: string) => {
    setOffered((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const toggleRequested = useCallback((id: string) => {
    setRequested((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) { setLoading(false); return; }

    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { setLoading(false); return; }
      setAuthed(true);
      setCurrentUserId(user.id);

      const [myRes, recipientRes] = await Promise.all([
        supabase
          .from('user_cards')
          .select('id, condition, quantity, catalog_card_id, catalog_cards(name, set_name, number, image_url)')
          .eq('user_id', user.id)
          .eq('for_trade', true),
        withUserId
          ? supabase.from('profiles').select('id, username').eq('id', withUserId).single()
          : Promise.resolve({ data: null, error: null }),
      ]);

      setMyCards((myRes.data as unknown as UserCard[]) ?? []);
      if (recipientRes.data) setRecipient(recipientRes.data as unknown as Profile);

      if (withUserId) {
        const { data: theirRes } = await supabase
          .from('user_cards')
          .select('id, condition, quantity, catalog_card_id, catalog_cards(name, set_name, number, image_url)')
          .eq('user_id', withUserId)
          .eq('for_trade', true);
        setTheirCards((theirRes as unknown as UserCard[]) ?? []);
      }

      setLoading(false);
    });
  }, [withUserId]);

  const handleSubmit = async () => {
    if (!withUserId) { showToast('No recipient selected.', false); return; }
    if (offered.size === 0) { showToast('Select at least one card to offer.', false); return; }
    if (requested.size === 0) { showToast('Select at least one card to request.', false); return; }

    setSubmitting(true);

    const supabase = createClient();
    if (!supabase) {
      showToast('Not connected to database. Check your configuration.', false);
      setSubmitting(false);
      return;
    }

    try {
      const offeredIds = Array.from(offered);
      const requestedIds = Array.from(requested);

      const { data, error } = await supabase.rpc('propose_trade', {
        p_recipient_id: withUserId,
        p_offered_card_ids: offeredIds,
        p_requested_card_ids: requestedIds,
      });

      if (error) {
        console.error('[propose_trade] RPC error:', error);
        showToast(error.message || 'Failed to propose trade.', false);
        setSubmitting(false);
        return;
      }

      if (!data) {
        showToast('Trade was not created — please try again.', false);
        setSubmitting(false);
        return;
      }

      router.push(`/trades/${data}`);
    } catch (err: unknown) {
      console.error('[propose_trade] Unexpected error:', err);
      const msg = err instanceof Error ? err.message : 'Unexpected error — please try again.';
      showToast(msg, false);
      setSubmitting(false);
    }
  };

  // Price estimation
  const allCatalogIds = useMemo(() =>
    [...myCards, ...theirCards].map((c) => c.catalog_card_id),
    [myCards, theirCards]
  );
  const prices = usePrices(allCatalogIds);
  const offerTotal = myCards.filter((c) => offered.has(c.id)).reduce((s, c) => s + (prices[c.catalog_card_id] ?? 0), 0);
  const requestTotal = theirCards.filter((c) => requested.has(c.id)).reduce((s, c) => s + (prices[c.catalog_card_id] ?? 0), 0);

  const canSubmit = !submitting && !!withUserId && offered.size > 0 && requested.size > 0;

  return (
    <>
      <Nav />
      {toast && (
        <div style={{
          position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)',
          background: toast.ok ? '#111' : '#c0392b', color: '#fff',
          padding: '11px 22px', borderRadius: 6, fontSize: 13.5, fontWeight: 500,
          zIndex: 1000, boxShadow: '0 4px 24px rgba(0,0,0,0.22)', whiteSpace: 'nowrap',
          pointerEvents: 'none',
        }}>
          {toast.msg}
        </div>
      )}

      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 20px' }}>
        <div className="listing-toolbar" style={{ marginBottom: 24 }}>
          <button
            onClick={() => router.push('/trades')}
            style={{ background: 'none', border: 'none', fontSize: 13, color: '#777', cursor: 'pointer', padding: 0 }}
          >
            ← Trades
          </button>
          <div className="listing-title" style={{ flex: 1 }}>Propose a Trade</div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#aaa', fontSize: 13 }}>Loading…</div>
        ) : !authed ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#888', fontSize: 14 }}>Sign in to propose a trade.</div>
        ) : withUserId && currentUserId && withUserId === currentUserId ? (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <div style={{ fontSize: 14, color: '#c0392b', fontWeight: 600, marginBottom: 8 }}>You cannot propose a trade with yourself.</div>
            <button
              onClick={() => router.push('/auctions')}
              style={{ fontSize: 13, padding: '8px 18px', border: '1.5px solid #111', borderRadius: 4, background: '#fff', color: '#111', cursor: 'pointer' }}
            >
              Browse cards to trade
            </button>
          </div>
        ) : (
          <>
            {/* Recipient info */}
            <div style={{ background: '#f7f7f7', border: '1px solid #e5e5e5', borderRadius: 4, padding: '12px 16px', marginBottom: 24, fontSize: 13 }}>
              {recipient ? (
                <span>Trading with: <strong>{recipient.username ?? 'Unknown user'}</strong></span>
              ) : (
                <span style={{ color: '#c0392b' }}>No recipient selected. Add <code>?with=USER_ID</code> to the URL.</span>
              )}
            </div>

            {/* Selection summary */}
            {(offered.size > 0 || requested.size > 0) && (
              <div style={{ background: '#f0f8f0', border: '1px solid #c8e6c9', borderRadius: 4, padding: '10px 16px', marginBottom: 20, fontSize: 12.5, color: '#2e7d32' }}>
                {offered.size} card{offered.size !== 1 ? 's' : ''} to offer · {requested.size} card{requested.size !== 1 ? 's' : ''} to request
              </div>
            )}

            {/* Card pickers */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32, marginBottom: 28 }}>
              <CardPicker
                cards={myCards}
                selected={offered}
                onToggle={toggleOffered}
                label={`Your cards to offer (${offered.size} selected)`}
                prices={prices}
              />
              <CardPicker
                cards={theirCards}
                selected={requested}
                onToggle={toggleRequested}
                label={`Their cards to request (${requested.size} selected)`}
                prices={prices}
              />
            </div>

            {/* Trade value summary */}
            <TradeValueSummary offerTotal={offerTotal} requestTotal={requestTotal} />

            {myCards.length === 0 && (
              <div style={{ marginBottom: 20, fontSize: 13, color: '#888' }}>
                You have no cards marked for trade. Go to{' '}
                <a href="/collection" style={{ color: '#111', fontWeight: 600 }}>My Collection</a>{' '}
                and toggle &ldquo;For Trade&rdquo; on the cards you want to offer.
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', alignItems: 'center' }}>
              {!canSubmit && offered.size === 0 && !submitting && (
                <span style={{ fontSize: 12, color: '#aaa' }}>Select cards on both sides to continue</span>
              )}
              <button
                className="btn-watchlist"
                style={{ padding: '10px 24px', fontSize: 13 }}
                onClick={() => router.push('/trades')}
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                className="btn-place-bid"
                style={{ padding: '10px 32px', fontSize: 13, opacity: canSubmit ? 1 : 0.45, cursor: canSubmit ? 'pointer' : 'not-allowed' }}
                onClick={handleSubmit}
                disabled={!canSubmit}
              >
                {submitting ? 'Sending…' : 'Propose Trade'}
              </button>
            </div>
          </>
        )}
      </div>
      <Footer />
    </>
  );
}

export default function NewTradePage() {
  return (
    <Suspense fallback={<><Nav /><div style={{ textAlign: 'center', padding: '80px 0', color: '#aaa' }}>Loading…</div><Footer /></>}>
      <NewTradeForm />
    </Suspense>
  );
}
