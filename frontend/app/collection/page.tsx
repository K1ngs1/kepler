'use client';

import { useState, useEffect, useCallback } from 'react';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import PhotoUpload from '@/components/PhotoUpload';
import CardImage from '@/components/CardImage';
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
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [binderToast, setBinderToast] = useState<string | null>(null);
  const [exportingImage, setExportingImage] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const loadCollection = useCallback(async () => {
    const supabase = createClient();
    if (!supabase) { setLoading(false); return; }

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError) console.error('[Collection] auth error:', authError.message);
    if (!user) { console.warn('[Collection] No user — not authenticated'); setLoading(false); setAuthed(false); return; }
    console.log('[Collection] Authenticated as:', user.id, user.email);
    setAuthed(true);
    setCurrentUserId(user.id);

    // Fetch username for binder link
    const { data: profile } = await supabase.from('profiles').select('username').eq('id', user.id).single();
    if (profile?.username) setUsername(profile.username);

    const { data, error: fetchError } = await supabase
      .from('user_cards')
      .select('id, condition, quantity, for_trade, wanted, catalog_cards(id, name, set_name, number, rarity, image_url)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (fetchError) console.error('[Collection] fetch error:', fetchError.message);
    console.log('[Collection] Raw user_cards rows:', data?.length, JSON.stringify(data?.slice(0, 3)));

    // Filter out any rows where the catalog_cards join returned null
    const rows = ((data as unknown as CollectionCard[]) ?? []).filter((c) => c.catalog_cards != null);
    console.log('[Collection] After filtering (catalog_cards != null):', rows.length);
    setCollection(rows);
    setLoading(false);
  }, []);

  useEffect(() => { loadCollection(); }, [loadCollection]);

  const updateCard = async (userCardId: string, patch: Partial<Pick<CollectionCard, 'for_trade' | 'wanted'>>) => {
    const supabase = createClient();
    if (!supabase) return;
    await supabase.from('user_cards').update(patch).eq('id', userCardId);
    setCollection((prev) => prev.map((c) => c.id === userCardId ? { ...c, ...patch } : c));
  };

  const bulkUpdate = async (patch: Partial<Pick<CollectionCard, 'for_trade' | 'wanted'>>) => {
    const supabase = createClient();
    if (!supabase || selected.size === 0) return;
    const ids = Array.from(selected);
    await supabase.from('user_cards').update(patch).in('id', ids);
    setCollection((prev) => prev.map((c) => selected.has(c.id) ? { ...c, ...patch } : c));
    setSelected(new Set());
    setSelectMode(false);
  };

  const toggleSelected = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const removeCard = async (userCardId: string) => {
    const supabase = createClient();
    if (!supabase) return;
    await supabase.from('user_cards').delete().eq('id', userCardId);
    setCollection((prev) => prev.filter((c) => c.id !== userCardId));
  };

  const filtered = collection.filter((c) =>
    c.catalog_cards != null &&
    (!search ||
      c.catalog_cards.name.toLowerCase().includes(search.toLowerCase()) ||
      c.catalog_cards.set_name.toLowerCase().includes(search.toLowerCase()))
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
          {authed && collection.length > 0 && (
            <button
              onClick={() => { setSelectMode(!selectMode); setSelected(new Set()); }}
              className="btn-watchlist"
              style={{ padding: '7px 16px', fontSize: 13, width: 'auto', background: selectMode ? '#111' : '#fff', color: selectMode ? '#fff' : '#111' }}
            >
              {selectMode ? 'Cancel Select' : 'Select'}
            </button>
          )}
          {authed && collection.filter((c) => c.for_trade).length > 0 && (
            <>
              {username && (
                <button
                  onClick={() => {
                    const url = `${window.location.origin}/binder/${username}`;
                    navigator.clipboard.writeText(url);
                    setBinderToast('Binder link copied!');
                    setTimeout(() => setBinderToast(null), 3000);
                  }}
                  className="btn-watchlist"
                  style={{ padding: '7px 16px', fontSize: 13, width: 'auto' }}
                >
                  Share Binder
                </button>
              )}
              <button
                onClick={async () => {
                  const grid = document.getElementById('collection-export-grid');
                  if (!grid) return;
                  setExportingImage(true);
                  try {
                    const html2canvas = (await import('html2canvas')).default;
                    const canvas = await html2canvas(grid, { backgroundColor: '#fff', useCORS: true });
                    const link = document.createElement('a');
                    link.download = `kepler-binder-${username || 'export'}.png`;
                    link.href = canvas.toDataURL();
                    link.click();
                  } catch (err) {
                    console.error('Export failed:', err);
                  } finally {
                    setExportingImage(false);
                  }
                }}
                className="btn-watchlist"
                style={{ padding: '7px 16px', fontSize: 13, width: 'auto', opacity: exportingImage ? 0.5 : 1 }}
                disabled={exportingImage}
              >
                {exportingImage ? 'Exporting…' : 'Export Image'}
              </button>
            </>
          )}
        </div>
        {binderToast && (
          <div style={{ position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)', background: '#111', color: '#fff', padding: '11px 22px', borderRadius: 6, fontSize: 13.5, fontWeight: 500, zIndex: 1000, boxShadow: '0 4px 24px rgba(0,0,0,0.22)', whiteSpace: 'nowrap', pointerEvents: 'none' }}>
            {binderToast}
          </div>
        )}

        {/* Bulk action toolbar */}
        {selectMode && selected.size > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', marginBottom: 12,
            background: '#f7f7f7', border: '1px solid #e5e5e5', borderRadius: 4, fontSize: 13,
          }}>
            <span style={{ fontWeight: 600, color: '#111' }}>{selected.size} selected</span>
            <span style={{ color: '#ccc' }}>·</span>
            <button
              onClick={() => bulkUpdate({ for_trade: true })}
              style={{ background: '#111', color: '#fff', border: 'none', borderRadius: 4, padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
            >
              Mark for Trade
            </button>
            <button
              onClick={() => bulkUpdate({ for_trade: false })}
              style={{ background: '#fff', color: '#111', border: '1.5px solid #111', borderRadius: 4, padding: '4px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
            >
              Remove from Trade
            </button>
            <button
              onClick={() => bulkUpdate({ wanted: true })}
              style={{ background: '#fff', color: '#111', border: '1.5px solid #111', borderRadius: 4, padding: '4px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
            >
              Add to Wishlist
            </button>
          </div>
        )}

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
            <div style={{ fontSize: 13, color: '#888', marginBottom: 24 }}>Browse the catalog and click &ldquo;+ Add to Collection&rdquo; on any card.</div>
            <a href="/catalog" style={{ background: '#111', color: '#fff', borderRadius: 5, padding: '10px 24px', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
              Browse Catalog
            </a>
          </div>
        ) : (
          <div className="collection-grid" id="collection-export-grid">
            {filtered.map((card) => (
              <div key={card.id} className="collection-card" style={{ position: 'relative' }} onClick={selectMode ? () => toggleSelected(card.id) : undefined}>
                {selectMode && (
                  <div style={{ position: 'absolute', top: 6, left: 6, zIndex: 5 }}>
                    <input
                      type="checkbox"
                      checked={selected.has(card.id)}
                      onChange={() => toggleSelected(card.id)}
                      style={{ width: 16, height: 16, accentColor: '#111', cursor: 'pointer' }}
                    />
                  </div>
                )}
                <div className="collection-card-img">
                  <CardImage
                    officialUrl={card.catalog_cards.image_url}
                    photoUrl={null}
                    alt={card.catalog_cards.name}
                  />
                </div>
                <div className="collection-card-body">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <div className="collection-card-name" style={{ flex: 1 }}>{card.catalog_cards.name}</div>
                    {currentUserId && (
                      <PhotoUpload
                        userCardId={card.id}
                        userId={currentUserId}
                        currentPhotoUrl={null}
                        onUploaded={() => {}}
                      />
                    )}
                  </div>
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
