'use client';

import { useState, useEffect, useCallback } from 'react';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import { createClient } from '@/lib/supabase/client';

interface CollectionCard {
  id: string;
  condition: string;
  quantity: number;
  for_trade: boolean;
  wanted: boolean;
  catalog_cards: {
    id: string;
    name: string;
    set_name: string;
    number: string;
    rarity: string | null;
    image_url: string | null;
  };
}

export default function CollectionPage() {
  const [collection, setCollection] = useState<CollectionCard[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [authed, setAuthed] = useState(false);

  const loadCollection = useCallback(async () => {
    const supabase = createClient();
    if (!supabase) { setLoading(false); return; }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); setAuthed(false); return; }
    setAuthed(true);

    const { data } = await supabase
      .from('user_cards')
      .select('id, condition, quantity, for_trade, wanted, catalog_cards(id, name, set_name, number, rarity, image_url)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    setCollection((data as CollectionCard[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { loadCollection(); }, [loadCollection]);

  const updateCard = async (userCardId: string, patch: Partial<Pick<CollectionCard, 'for_trade' | 'wanted'>>) => {
    const supabase = createClient();
    if (!supabase) return;
    await supabase.from('user_cards').update(patch).eq('id', userCardId);
    setCollection((prev) => prev.map((c) => c.id === userCardId ? { ...c, ...patch } : c));
  };

  const removeCard = async (userCardId: string) => {
    const supabase = createClient();
    if (!supabase) return;
    await supabase.from('user_cards').delete().eq('id', userCardId);
    setCollection((prev) => prev.filter((c) => c.id !== userCardId));
  };

  const filtered = collection.filter((c) =>
    !search || c.catalog_cards.name.toLowerCase().includes(search.toLowerCase()) ||
    c.catalog_cards.set_name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      <Nav />
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 20px' }}>
        <div className="listing-toolbar">
          <div className="listing-title">My Collection</div>
          {!loading && authed && (
            <span style={{ fontSize: 12, color: '#aaa' }}>
              {collection.length} card{collection.length !== 1 ? 's' : ''}
              {collection.filter((c) => c.for_trade).length > 0 && (
                <> · <span style={{ color: '#3db56c', fontWeight: 600 }}>{collection.filter((c) => c.for_trade).length} for trade</span></>
              )}
              {collection.filter((c) => c.wanted).length > 0 && (
                <> · {collection.filter((c) => c.wanted).length} wanted</>
              )}
            </span>
          )}
          <div className="toolbar-search">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="7" cy="7" r="5" /><path d="M11 11l3 3" />
            </svg>
            <input placeholder="Search my cards…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <a href="/catalog" style={{ background: '#111', color: '#fff', borderRadius: 4, padding: '7px 16px', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
            + Browse Catalog
          </a>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '80px 0', color: '#aaa', fontSize: 13 }}>
            Loading your collection…
          </div>
        ) : !authed ? (
          <div style={{ textAlign: 'center', padding: '80px 0' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#333', marginBottom: 8 }}>Sign in to see your collection</div>
            <div style={{ fontSize: 13, color: '#888', marginBottom: 20 }}>Your collection is saved to your account.</div>
          </div>
        ) : filtered.length === 0 && search ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#888', fontSize: 14 }}>
            No cards match your search.
          </div>
        ) : collection.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 0' }}>
            <div style={{ fontSize: 36, marginBottom: 14 }}>🃏</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#333', marginBottom: 8 }}>Your collection is empty</div>
            <div style={{ fontSize: 13, color: '#888', marginBottom: 24 }}>Browse the catalog and click "+ Add to Collection" on any card.</div>
            <a href="/catalog" style={{ background: '#111', color: '#fff', borderRadius: 5, padding: '10px 24px', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
              Browse Catalog
            </a>
          </div>
        ) : (
          <div className="collection-grid">
            {filtered.map((card) => (
              <div key={card.id} className="collection-card">
                <div className="collection-card-img">
                  {card.catalog_cards.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={card.catalog_cards.image_url} alt={card.catalog_cards.name} loading="lazy" style={{ maxHeight: 130, maxWidth: '90%', objectFit: 'contain' }} />
                  ) : (
                    <div style={{ color: '#ccc', fontSize: 11 }}>No image</div>
                  )}
                </div>
                <div className="collection-card-body">
                  <div className="collection-card-name">{card.catalog_cards.name}</div>
                  <div className="collection-card-set">
                    {card.catalog_cards.set_name} · #{card.catalog_cards.number}
                  </div>
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 8 }}>
                    {card.condition}{card.quantity > 1 ? ` · Qty ${card.quantity}` : ''}
                  </div>
                  <div className="collection-card-toggles">
                    <div className="toggle-row">
                      <span>For Trade</span>
                      <label className="toggle-switch">
                        <input type="checkbox" checked={card.for_trade} onChange={() => updateCard(card.id, { for_trade: !card.for_trade })} />
                        <span className="toggle-slider" />
                      </label>
                    </div>
                    <div className="toggle-row">
                      <span>Wanted</span>
                      <label className="toggle-switch">
                        <input type="checkbox" checked={card.wanted} onChange={() => updateCard(card.id, { wanted: !card.wanted })} />
                        <span className="toggle-slider" />
                      </label>
                    </div>
                    <button
                      onClick={() => removeCard(card.id)}
                      style={{ marginTop: 8, fontSize: 11.5, color: '#c0392b', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0 }}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <Footer />
    </>
  );
}
