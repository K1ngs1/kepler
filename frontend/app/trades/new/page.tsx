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

interface ListingItem {
  id: string;
  user_card_id: string | null;
  catalog_card_id: string;
  condition: string;
  custom_price: number | null;
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

interface CatalogCard {
  id: string;
  name: string;
  set_name: string;
  number: string;
  image_url: string | null;
}

interface NewCardOffer {
  catalog_card: CatalogCard;
  condition: string;
  is_owned: boolean;
  owned_id?: string;
}

/* ── CardPicker is defined OUTSIDE the form so React never remounts it ── */
interface CardPickerProps {
  cards: any[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  label: string;
  prices?: Record<string, number>;
  isListingItems?: boolean;
}

function CardPicker({ cards, selected, onToggle, label, prices = {}, isListingItems = false }: CardPickerProps) {
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: '#555', marginBottom: 12 }}>
        {label}
      </div>
      {cards.length === 0 ? (
        <div style={{ color: '#aaa', fontSize: 13, padding: '20px 0' }}>No cards available.</div>
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
                  
                  {isListingItems && card.custom_price != null ? (
                    <div style={{ fontSize: 12, fontWeight: 600, marginTop: 4 }}>${card.custom_price.toFixed(2)}</div>
                  ) : (
                    <PriceBadge price={prices[card.catalog_card_id]} />
                  )}
                  
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

function NewTradeForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const withUserId = searchParams.get('with');
  const fromListingId = searchParams.get('fromListing');

  const [myCards, setMyCards] = useState<UserCard[]>([]);
  const [theirCards, setTheirCards] = useState<UserCard[]>([]);
  const [listingItems, setListingItems] = useState<ListingItem[]>([]);
  const [listingPhotos, setListingPhotos] = useState<string[]>([]);
  const [recipient, setRecipient] = useState<Profile | null>(null);
  
  const [offered, setOffered] = useState<Set<string>>(new Set());
  const [requested, setRequested] = useState<Set<string>>(new Set());
  
  const [cashAmount, setCashAmount] = useState('');
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<CatalogCard[]>([]);
  const [newCardOffers, setNewCardOffers] = useState<NewCardOffer[]>([]);

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

      let targetUserId = withUserId;

      if (fromListingId) {
        // Fetch listing info
        const { data: listingData } = await supabase
          .from('listings')
          .select('seller_id, cover_photo_url')
          .eq('id', fromListingId)
          .single();
          
        if (listingData) {
          targetUserId = listingData.seller_id;
          
          const { data: itemsData } = await supabase
            .from('listing_items')
            .select('id, user_card_id, catalog_card_id, condition, custom_price, catalog_cards(name, set_name, number, image_url)')
            .eq('listing_id', fromListingId);
            
          if (itemsData) setListingItems(itemsData as unknown as ListingItem[]);
          
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
        }
      }

      const [myRes, recipientRes] = await Promise.all([
        supabase
          .from('user_cards')
          .select('id, condition, quantity, catalog_card_id, catalog_cards(name, set_name, number, image_url)')
          .eq('user_id', user.id)
          .eq('for_trade', true),
        targetUserId
          ? supabase.from('profiles').select('id, username').eq('id', targetUserId).single()
          : Promise.resolve({ data: null, error: null }),
      ]);

      setMyCards((myRes.data as unknown as UserCard[]) ?? []);
      if (recipientRes.data) setRecipient(recipientRes.data as unknown as Profile);

      if (targetUserId && !fromListingId) {
        const { data: theirRes } = await supabase
          .from('user_cards')
          .select('id, condition, quantity, catalog_card_id, catalog_cards(name, set_name, number, image_url)')
          .eq('user_id', targetUserId)
          .eq('for_trade', true);
        setTheirCards((theirRes as unknown as UserCard[]) ?? []);
      }

      setLoading(false);
    });
  }, [withUserId, fromListingId]);

  const handleSearch = async (query: string) => {
    setSearch(query);
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }
    const supabase = createClient();
    if (!supabase) return;
    const { data } = await supabase
      .from('catalog_cards')
      .select('id, name, set_name, number, image_url')
      .ilike('name', `%${query}%`)
      .limit(8);
    if (data) setSearchResults(data as CatalogCard[]);
  };

  const addSearchCard = (card: CatalogCard) => {
    // Check if in collection
    const owned = myCards.find(c => c.catalog_card_id === card.id);
    setNewCardOffers([...newCardOffers, {
      catalog_card: card,
      condition: 'NM',
      is_owned: !!owned,
      owned_id: owned?.id
    }]);
    setSearch('');
    setSearchResults([]);
  };

  const removeNewOffer = (index: number) => {
    setNewCardOffers(newCardOffers.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!recipient) { showToast('No recipient selected.', false); return; }
    if (offered.size === 0 && newCardOffers.length === 0 && (!cashAmount || parseFloat(cashAmount) <= 0)) { 
      showToast('Select at least one card or add cash to offer.', false); return; 
    }
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
      const cash = cashAmount ? parseFloat(cashAmount) : 0;

      let tradeId: string;

      if (fromListingId) {
        // Prepare new cards JSON array for RPC
        const newCardsArr = newCardOffers.filter(o => !o.is_owned).map(o => ({
          catalog_card_id: o.catalog_card.id,
          condition: o.condition
        }));

        // Add already owned manual selections to offeredIds
        newCardOffers.filter(o => o.is_owned && o.owned_id).forEach(o => {
          if (!offeredIds.includes(o.owned_id!)) offeredIds.push(o.owned_id!);
        });

        const { data, error } = await supabase.rpc('propose_trade_from_listing', {
          p_listing_id: fromListingId,
          p_recipient_id: recipient.id,
          p_selected_item_ids: requestedIds, // these are listing_items.id
          p_offered_card_ids: offeredIds,
          p_cash_amount: cash,
          p_new_cards: newCardsArr
        });

        if (error) throw error;
        tradeId = data;
      } else {
        const { data, error } = await supabase.rpc('propose_trade', {
          p_recipient_id: recipient.id,
          p_offered_card_ids: offeredIds,
          p_requested_card_ids: requestedIds,
        });
        if (error) throw error;
        tradeId = data;
        
        // MVP: standard trades don't support cash yet without another migration on propose_trade, 
        // so we'd update it afterwards if cash > 0.
        if (cash > 0) {
          await supabase.from('trade_offers').update({ cash_amount: cash }).eq('id', tradeId);
        }
      }

      router.push(`/trades/${tradeId}`);
    } catch (err: any) {
      console.error('Unexpected error:', err);
      showToast(err.message || 'Unexpected error — please try again.', false);
      setSubmitting(false);
    }
  };

  // Price estimation
  const allCatalogIds = useMemo(() => {
    const ids = [
      ...myCards.map((c) => c.catalog_card_id),
      ...theirCards.map((c) => c.catalog_card_id),
      ...listingItems.map((c) => c.catalog_card_id),
      ...newCardOffers.map((c) => c.catalog_card.id)
    ];
    return Array.from(new Set(ids));
  }, [myCards, theirCards, listingItems, newCardOffers]);
  
  const prices = usePrices(allCatalogIds);
  
  const offerTotal = useMemo(() => {
    let total = myCards.filter((c) => offered.has(c.id)).reduce((s, c) => s + (prices[c.catalog_card_id] ?? 0), 0);
    total += newCardOffers.reduce((s, c) => s + (prices[c.catalog_card.id] ?? 0), 0);
    total += cashAmount ? parseFloat(cashAmount) || 0 : 0;
    return total;
  }, [myCards, offered, newCardOffers, prices, cashAmount]);

  const requestTotal = useMemo(() => {
    if (fromListingId) {
      return listingItems.filter((c) => requested.has(c.id)).reduce((s, c) => {
        if (c.custom_price != null) return s + c.custom_price;
        return s + (prices[c.catalog_card_id] ?? 0);
      }, 0);
    }
    return theirCards.filter((c) => requested.has(c.id)).reduce((s, c) => s + (prices[c.catalog_card_id] ?? 0), 0);
  }, [listingItems, theirCards, requested, prices, fromListingId]);

  const canSubmit = !submitting && !!recipient && (offered.size > 0 || newCardOffers.length > 0 || (cashAmount && parseFloat(cashAmount) > 0)) && requested.size > 0;

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
            </div>

            {/* Listing Strip */}
            {fromListingId && listingPhotos.length > 0 && (
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

            {/* Card pickers */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32, marginBottom: 28 }}>
              
              <div>
                <CardPicker
                  cards={myCards}
                  selected={offered}
                  onToggle={toggleOffered}
                  label={`Your cards to offer (${offered.size} selected)`}
                  prices={prices}
                />
                
                {fromListingId && (
                  <div style={{ marginTop: 24 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: '#555', marginBottom: 12 }}>
                      Add cards not in collection
                    </div>
                    <div className="toolbar-search" style={{ marginBottom: 12 }}>
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="7" cy="7" r="5" /><path d="M11 11l3 3" /></svg>
                      <input 
                        placeholder="Search cards to offer..." 
                        value={search} 
                        onChange={(e) => handleSearch(e.target.value)}
                        style={{ width: '100%', padding: '8px 14px 8px 32px' }}
                      />
                    </div>
                    {searchResults.length > 0 && (
                      <div style={{ border: '1px solid #ccc', borderRadius: 4, maxHeight: 150, overflowY: 'auto', marginBottom: 16 }}>
                        {searchResults.map(card => (
                          <div 
                            key={card.id} 
                            style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f0f0f0', fontSize: 13 }}
                            onClick={() => addSearchCard(card)}
                          >
                            <span style={{ fontWeight: 600 }}>{card.name}</span>
                            <span style={{ color: '#777', marginLeft: 8 }}>{card.set_name}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    
                    {newCardOffers.map((offer, i) => (
                      <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px', border: '1px solid #e5e5e5', borderRadius: 4, background: '#fafafa', marginBottom: 8 }}>
                        <div style={{ flex: 1, fontSize: 12 }}>
                          <div style={{ fontWeight: 600 }}>{offer.catalog_card.name}</div>
                          <div style={{ color: '#888' }}>
                            {offer.is_owned ? "Owned (Will add copy)" : "Not in your collection – will be added"}
                          </div>
                        </div>
                        <select 
                          className="login-field-input" 
                          style={{ width: 80, marginBottom: 0, padding: '4px 8px', fontSize: 12 }}
                          value={offer.condition}
                          onChange={(e) => {
                            const updated = [...newCardOffers];
                            updated[i].condition = e.target.value;
                            setNewCardOffers(updated);
                          }}
                        >
                          {['Mint', 'NM', 'LP', 'MP', 'HP', 'Damaged'].map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                        <button onClick={() => removeNewOffer(i)} style={{ background: 'none', border: 'none', color: '#c0392b', cursor: 'pointer' }}>✕</button>
                      </div>
                    ))}

                    <div style={{ marginTop: 24 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: '#555', marginBottom: 12 }}>
                        Add Cash
                      </div>
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
                )}
              </div>

              {fromListingId ? (
                <CardPicker
                  cards={listingItems}
                  selected={requested}
                  onToggle={toggleRequested}
                  label={`Cards from listing to request (${requested.size} selected)`}
                  prices={prices}
                  isListingItems={true}
                />
              ) : (
                <CardPicker
                  cards={theirCards}
                  selected={requested}
                  onToggle={toggleRequested}
                  label={`Their cards to request (${requested.size} selected)`}
                  prices={prices}
                />
              )}
            </div>

            {/* Trade value summary */}
            <TradeValueSummary offerTotal={offerTotal} requestTotal={requestTotal} />

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', alignItems: 'center', marginTop: 24 }}>
              {!canSubmit && offered.size === 0 && newCardOffers.length === 0 && !cashAmount && !submitting && (
                <span style={{ fontSize: 12, color: '#aaa' }}>Select cards or cash on both sides to continue</span>
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
