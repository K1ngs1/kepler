'use client';

import { useState, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';

export interface CatalogCard {
  id: string;
  tcgdex_id: string | null;
  name: string;
  set_name: string;
  set_code: string;
  number: string;
  rarity: string | null;
  image_url: string | null;
}

interface Props {
  cards: CatalogCard[];
}

const CONDITIONS = ['GEM MT 10', 'MINT 9', 'NM-MT 8', 'NM 7', 'EX-MT 6', 'EX 5', 'VG-EX 4', 'VG 3', 'GD 2', 'FR 1.5', 'PR 1'];

export default function CatalogClient({ cards }: Props) {
  const [search, setSearch] = useState('');
  const [selectedSet, setSelectedSet] = useState('All Sets');
  const [selectedRarity, setSelectedRarity] = useState('All Rarities');
  const [addingCard, setAddingCard] = useState<CatalogCard | null>(null);
  const [condition, setCondition] = useState('NM 7');
  const [quantity, setQuantity] = useState(1);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [added, setAdded] = useState<Set<string>>(new Set());

  const sets = useMemo(() => {
    const s = new Set(cards.map((c) => c.set_name));
    return ['All Sets', ...Array.from(s).sort()];
  }, [cards]);

  const rarities = useMemo(() => {
    const r = new Set(cards.map((c) => c.rarity).filter(Boolean) as string[]);
    return ['All Rarities', ...Array.from(r).sort()];
  }, [cards]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return cards.filter((c) => {
      const matchSearch = !q || c.name.toLowerCase().includes(q) || c.set_name.toLowerCase().includes(q);
      const matchSet = selectedSet === 'All Sets' || c.set_name === selectedSet;
      const matchRarity = selectedRarity === 'All Rarities' || c.rarity === selectedRarity;
      return matchSearch && matchSet && matchRarity;
    });
  }, [cards, search, selectedSet, selectedRarity]);

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  };

  const openModal = (card: CatalogCard) => {
    setAddingCard(card);
    setCondition('NM 7');
    setQuantity(1);
  };

  const handleAdd = async () => {
    if (!addingCard) return;
    setSubmitting(true);
    const supabase = createClient();
    if (!supabase) {
      showToast('Please log in to add cards to your collection.', false);
      setSubmitting(false);
      setAddingCard(null);
      return;
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      showToast('Please log in to add cards to your collection.', false);
      setSubmitting(false);
      setAddingCard(null);
      return;
    }
    const { error } = await supabase.from('user_cards').upsert(
      { user_id: user.id, catalog_card_id: addingCard.id, condition, quantity, for_trade: false, wanted: false },
      { onConflict: 'user_id,catalog_card_id,condition' }
    );
    if (error) {
      showToast('Could not add card — ' + error.message, false);
    } else {
      setAdded((s) => new Set([...s, addingCard.id]));
      showToast(`${addingCard.name} added to your collection!`);
    }
    setSubmitting(false);
    setAddingCard(null);
  };

  if (cards.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '80px 0' }}>
        <div style={{ fontSize: 38, marginBottom: 14 }}>📦</div>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Catalog is loading…</div>
        <div style={{ fontSize: 13, color: '#777', lineHeight: 1.7 }}>
          Run the seed script to populate cards:<br />
          <code style={{ background: '#f5f5f5', padding: '2px 8px', borderRadius: 4, fontSize: 12 }}>
            node scripts/seed-catalog.mjs
          </code>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Toast */}
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

      {/* Toolbar */}
      <div className="listing-toolbar">
        <div className="listing-title">Card Catalog</div>
        <span style={{ fontSize: 12, color: '#aaa', whiteSpace: 'nowrap' }}>
          {filtered.length.toLocaleString()} cards
        </span>
        <div className="toolbar-search">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="7" cy="7" r="5" /><path d="M11 11l3 3" />
          </svg>
          <input
            placeholder="Search cards…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select className="toolbar-select" value={selectedSet} onChange={(e) => setSelectedSet(e.target.value)}>
          {sets.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select className="toolbar-select" value={selectedRarity} onChange={(e) => setSelectedRarity(e.target.value)}>
          {rarities.map((r) => <option key={r}>{r}</option>)}
        </select>
      </div>

      {/* Grid */}
      <div className="catalog-grid">
        {filtered.map((card) => (
          <div key={card.id} className="catalog-card" style={{ position: 'relative' }}>
            <a href={`/catalog/${card.id}`} style={{ display: 'block', textDecoration: 'none' }}>
              <div className="catalog-card-img">
                {card.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={card.image_url} alt={card.name} loading="lazy" />
                ) : (
                  <div style={{ color: '#ccc', fontSize: 11, textAlign: 'center', padding: '0 8px' }}>
                    No image
                  </div>
                )}
              </div>
            </a>
            <div className="catalog-card-body">
              <a href={`/catalog/${card.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                <div className="catalog-card-name">{card.name}</div>
              </a>
              <div className="catalog-card-set">{card.set_name} · #{card.number}</div>
              {card.rarity && <div className="catalog-card-rarity">{card.rarity}</div>}
              <button
                className="catalog-card-add"
                style={added.has(card.id) ? { background: '#111', color: '#fff', borderColor: '#111' } : {}}
                onClick={() => openModal(card)}
              >
                {added.has(card.id) ? '✓ In Collection' : '+ Add to Collection'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {filtered.length === 0 && cards.length > 0 && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#888', fontSize: 14 }}>
          No cards match your search. Try adjusting the filters.
        </div>
      )}

      {/* Add to Collection Modal */}
      {addingCard && (
        <div className="modal-bg" onClick={() => setAddingCard(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">Add to Collection</div>
            <div className="modal-sub">
              {addingCard.name} &middot; {addingCard.set_name} &middot; #{addingCard.number}
            </div>

            <label className="modal-label">Condition (PSA Grade)</label>
            <select
              className="toolbar-select"
              style={{ width: '100%', marginBottom: 16, padding: '9px 12px', fontSize: 13.5, borderRadius: 5, borderColor: '#ccc' }}
              value={condition}
              onChange={(e) => setCondition(e.target.value)}
            >
              {CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>

            <label className="modal-label">Quantity</label>
            <input
              className="modal-input"
              type="number"
              min={1}
              max={99}
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
              style={{ fontSize: 20, marginBottom: 20 }}
            />

            <div className="modal-btns">
              <button className="modal-cancel" onClick={() => setAddingCard(null)}>
                Cancel
              </button>
              <button className="modal-confirm" onClick={handleAdd} disabled={submitting}>
                {submitting ? 'Adding…' : 'Add to Collection'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
