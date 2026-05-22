'use client';

import { useState, useEffect, Suspense, useCallback } from 'react';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import { createClient } from '@/lib/supabase/client';
import { useRouter, useSearchParams } from 'next/navigation';

interface ListingItem {
  id: string;
  card_name: string;
  set_name: string | null;
  condition_text: string | null;
  custom_price: number | null;
}

interface Profile {
  id: string;
  username: string | null;
}

interface OfferedCard {
  card_name: string;
  set_name: string;
  condition: string;
}

function NewTradeForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromListingId = searchParams.get('fromListing');

  const [listingItems, setListingItems] = useState<ListingItem[]>([]);
  const [listingTitle, setListingTitle] = useState('');
  const [listingPhotos, setListingPhotos] = useState<string[]>([]);
  const [recipient, setRecipient] = useState<Profile | null>(null);

  const [requestedCardsText, setRequestedCardsText] = useState('');
  const [offeredCards, setOfferedCards] = useState<OfferedCard[]>([]);
  const [cashAmount, setCashAmount] = useState('');

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const showToast = useCallback((msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const addOfferedCard = () => {
    setOfferedCards([...offeredCards, { card_name: '', set_name: '', condition: 'NM' }]);
  };

  const updateOfferedCard = (index: number, field: keyof OfferedCard, value: string) => {
    const updated = [...offeredCards];
    updated[index][field] = value;
    setOfferedCards(updated);
  };

  const removeOfferedCard = (index: number) => {
    setOfferedCards(offeredCards.filter((_, i) => i !== index));
  };

  useEffect(() => {
    if (!fromListingId) {
      setLoading(false);
      return;
    }

    const supabase = createClient();
    if (!supabase) { setLoading(false); return; }

    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { setLoading(false); return; }
      setAuthed(true);
      setCurrentUserId(user.id);

      const { data: listingData } = await supabase
        .from('listings')
        .select('seller_id, title, cover_photo_url')
        .eq('id', fromListingId)
        .single();

      if (!listingData) { setLoading(false); return; }

      setListingTitle(listingData.title || '');

      // Fetch recipient profile
      const { data: profileData } = await supabase
        .from('profiles')
        .select('id, username')
        .eq('id', listingData.seller_id)
        .single();
      if (profileData) setRecipient(profileData as unknown as Profile);

      // Fetch listing items
      const { data: itemsData } = await supabase
        .from('listing_items')
        .select('id, card_name, set_name, condition_text, custom_price')
        .eq('listing_id', fromListingId);
      if (itemsData) {
        setListingItems(itemsData as unknown as ListingItem[]);
        // Pre-fill the textbox with all listing item names
        const defaultText = (itemsData as unknown as ListingItem[]).map((item) => {
          let line = item.card_name;
          if (item.set_name) line += ` — ${item.set_name}`;
          if (item.condition_text) line += ` (${item.condition_text})`;
          return line;
        }).join('\n');
        setRequestedCardsText(defaultText);
      }

      // Fetch listing photos
      const { data: photosData } = await supabase
        .from('listing_photos')
        .select('url')
        .eq('listing_id', fromListingId)
        .order('sort_order', { ascending: true });
      const photos = photosData?.map(p => p.url) || [];
      if (listingData.cover_photo_url && !photos.includes(listingData.cover_photo_url)) {
        photos.unshift(listingData.cover_photo_url);
      }
      setListingPhotos(photos);

      setLoading(false);
    });
  }, [fromListingId]);

  const handleSubmit = async () => {
    if (!recipient) { showToast('No recipient found.', false); return; }
    if (offeredCards.filter(c => c.card_name.trim()).length === 0 && (!cashAmount || parseFloat(cashAmount) <= 0)) {
      showToast('Add at least one card or cash to your offer.', false); return;
    }
    if (!requestedCardsText.trim()) { showToast('Describe the cards you want to request.', false); return; }

    setSubmitting(true);
    const supabase = createClient();
    if (!supabase) { showToast('Not connected.', false); setSubmitting(false); return; }

    try {
      const cards = offeredCards
        .filter(c => c.card_name.trim())
        .map(c => ({ card_name: c.card_name.trim(), set_name: c.set_name.trim(), condition: c.condition }));
      const cash = cashAmount ? parseFloat(cashAmount) : 0;

      // Use all listing item IDs since user describes what they want in freetext
      const selectedIds = listingItems.map(i => i.id);

      const { data, error } = await supabase.rpc('propose_mvp_trade', {
        p_listing_id: fromListingId,
        p_recipient_id: recipient.id,
        p_requested_listing_item_ids: selectedIds,
        p_offered_cards: cards,
        p_cash_amount: cash,
      });

      if (error) throw error;

      // Send the free-text description as the first trade message
      if (requestedCardsText.trim()) {
        await supabase.from('trade_messages').insert({
          trade_id: data,
          sender_id: currentUserId,
          content: `📋 Cards I'm interested in:\n${requestedCardsText.trim()}`,
        });
      }

      router.push(`/trades/${data}`);
    } catch (err: any) {
      showToast(err.message || 'Unexpected error.', false);
      setSubmitting(false);
    }
  };

  const canSubmit = !submitting && !!recipient
    && (offeredCards.some(c => c.card_name.trim()) || (cashAmount && parseFloat(cashAmount) > 0))
    && requestedCardsText.trim().length > 0;

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
            onClick={() => router.back()}
            style={{ background: 'none', border: 'none', fontSize: 13, color: '#777', cursor: 'pointer', padding: 0 }}
          >
            ← Back
          </button>
          <div className="listing-title" style={{ flex: 1 }}>Propose a Trade</div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#aaa', fontSize: 13 }}>Loading…</div>
        ) : !authed ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#888', fontSize: 14 }}>Sign in to propose a trade.</div>
        ) : !fromListingId ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#888', fontSize: 14 }}>Navigate to a listing and click &quot;Propose Trade&quot; to start.</div>
        ) : recipient && currentUserId && recipient.id === currentUserId ? (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <div style={{ fontSize: 14, color: '#c0392b', fontWeight: 600, marginBottom: 8 }}>You cannot propose a trade with yourself.</div>
          </div>
        ) : (
          <>
            {/* Recipient info */}
            <div style={{ background: '#f7f7f7', border: '1px solid #e5e5e5', borderRadius: 4, padding: '12px 16px', marginBottom: 24, fontSize: 13 }}>
              {recipient ? (
                <span>Trading with: <strong>{recipient.username ?? 'Unknown user'}</strong></span>
              ) : (
                <span style={{ color: '#c0392b' }}>No recipient selected.</span>
              )}
              {listingTitle && <span style={{ marginLeft: 12, color: '#777' }}>Listing: {listingTitle}</span>}
            </div>

            {/* Listing Strip */}
            {listingPhotos.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: '#555', marginBottom: 8 }}>Listing Photos</div>
                <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 8 }}>
                  {listingPhotos.map((url, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={i} src={url} alt={`Listing photo ${i}`} style={{ height: 60, borderRadius: 4, border: '1px solid #ddd' }} />
                  ))}
                </div>
              </div>
            )}

            {/* Two-column layout */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32, marginBottom: 28 }}>
              {/* Left: Your offer */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: '#555', marginBottom: 12 }}>
                  Your Offer
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#333' }}>Cards you are offering</div>
                  <button
                    onClick={addOfferedCard}
                    style={{ background: '#111', color: '#fff', border: 'none', borderRadius: 4, padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                  >
                    + Add Card
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                  {offeredCards.map((card, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '10px', border: '1px solid #e5e5e5', borderRadius: 4, background: '#fafafa' }}>
                      <input
                        className="login-field-input"
                        style={{ flex: 2, marginBottom: 0, padding: '6px 10px' }}
                        placeholder="Card Name"
                        value={card.card_name}
                        onChange={(e) => updateOfferedCard(i, 'card_name', e.target.value)}
                      />
                      <input
                        className="login-field-input"
                        style={{ flex: 1, marginBottom: 0, padding: '6px 10px' }}
                        placeholder="Set"
                        value={card.set_name}
                        onChange={(e) => updateOfferedCard(i, 'set_name', e.target.value)}
                      />
                      <select
                        className="login-field-input"
                        style={{ width: 80, marginBottom: 0, padding: '6px 10px' }}
                        value={card.condition}
                        onChange={(e) => updateOfferedCard(i, 'condition', e.target.value)}
                      >
                        {['Mint', 'NM', 'LP', 'MP', 'HP', 'Damaged'].map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                      <button
                        onClick={() => removeOfferedCard(i)}
                        style={{ background: 'none', border: 'none', color: '#c0392b', cursor: 'pointer', padding: 6 }}
                      >✕</button>
                    </div>
                  ))}
                  {offeredCards.length === 0 && (
                    <div style={{ fontSize: 13, color: '#aaa', fontStyle: 'italic', padding: '12px 0' }}>
                      No cards added yet. Click &quot;+ Add Card&quot; to offer cards.
                    </div>
                  )}
                </div>

                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#333', marginBottom: 8 }}>Add Cash (USDC)</div>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: 12, top: 10, fontSize: 14, color: '#555' }}>$</span>
                    <input
                      className="login-field-input"
                      type="number"
                      step="1"
                      placeholder="0.00"
                      value={cashAmount}
                      onChange={(e) => setCashAmount(e.target.value)}
                      style={{ paddingLeft: 24 }}
                    />
                  </div>
                </div>
              </div>

              {/* Right: Cards you want from the listing */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: '#555', marginBottom: 12 }}>
                  Cards You Want from Listing
                </div>

                {/* Reference: listing items */}
                {listingItems.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 11.5, color: '#888', marginBottom: 8 }}>Available in this listing:</div>
                    <div style={{ border: '1px solid #eee', borderRadius: 6, background: '#fafafa', padding: '8px 12px', maxHeight: 120, overflowY: 'auto' }}>
                      {listingItems.map((item, i) => (
                        <div key={item.id} style={{ fontSize: 12, color: '#555', padding: '3px 0', borderBottom: i < listingItems.length - 1 ? '1px solid #f0f0f0' : 'none' }}>
                          <span style={{ fontWeight: 600, color: '#333' }}>{item.card_name}</span>
                          {item.set_name && <span> — {item.set_name}</span>}
                          {item.condition_text && <span> ({item.condition_text})</span>}
                          {item.custom_price != null && <span style={{ marginLeft: 8, color: '#111', fontWeight: 600 }}>${item.custom_price.toFixed(2)}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <label className="login-field-label" style={{ marginBottom: 6 }}>Describe the cards you want</label>
                <textarea
                  className="login-field-input"
                  placeholder={"Type the cards you want from this listing...\n\ne.g.\nCharizard VMAX — Darkness Ablaze\nPikachu GX — Hidden Fates"}
                  value={requestedCardsText}
                  onChange={(e) => setRequestedCardsText(e.target.value)}
                  style={{
                    height: 140,
                    resize: 'vertical',
                    fontSize: 13,
                    lineHeight: 1.55,
                    fontFamily: 'inherit',
                  }}
                />
                <div style={{ fontSize: 11, color: '#999', marginTop: -8, marginBottom: 8 }}>
                  One card per line. Edit to remove cards you don&apos;t want.
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', alignItems: 'center', marginTop: 24 }}>
              {!canSubmit && !submitting && (
                <span style={{ fontSize: 12, color: '#aaa' }}>Add cards or cash to your offer and describe what you want</span>
              )}
              <button
                className="btn-watchlist"
                style={{ padding: '10px 24px', fontSize: 13 }}
                onClick={() => router.back()}
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
