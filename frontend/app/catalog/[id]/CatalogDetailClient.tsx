'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

interface Card {
  id: string;
  name: string;
  set_name: string;
  number: string;
}

const CONDITIONS = ['GEM MT 10', 'MINT 9', 'NM-MT 8', 'NM 7', 'EX-MT 6', 'EX 5', 'VG-EX 4', 'VG 3', 'GD 2', 'FR 1.5', 'PR 1'];

export default function CatalogDetailClient({ card }: { card: Card }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [condition, setCondition] = useState('NM 7');
  const [quantity, setQuantity] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  const handleAdd = async () => {
    setSubmitting(true);
    const supabase = createClient();
    if (!supabase) { showToast('Please log in first.'); setSubmitting(false); setModalOpen(false); return; }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { showToast('Please log in first.'); setSubmitting(false); setModalOpen(false); return; }
    const { error } = await supabase.from('user_cards').upsert(
      { user_id: user.id, catalog_card_id: card.id, condition, quantity, for_trade: false, wanted: false },
      { onConflict: 'user_id,catalog_card_id,condition' }
    );
    setSubmitting(false);
    setModalOpen(false);
    showToast(error ? 'Error adding card.' : `${card.name} added to your collection!`);
  };

  return (
    <>
      {toast && (
        <div style={{ position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)', background: '#111', color: '#fff', padding: '11px 22px', borderRadius: 6, fontSize: 13.5, fontWeight: 500, zIndex: 1000, boxShadow: '0 4px 24px rgba(0,0,0,0.22)', whiteSpace: 'nowrap' }}>
          {toast}
        </div>
      )}
      <div style={{ display: 'flex', gap: 10 }}>
        <button className="btn-place-bid" style={{ fontSize: 14 }} onClick={() => setModalOpen(true)}>
          + Add to Collection
        </button>
        <a href="/catalog" className="btn-watchlist" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', fontSize: 14, padding: '13px', borderRadius: 4 }}>
          ← Back
        </a>
      </div>
      {modalOpen && (
        <div className="modal-bg" onClick={() => setModalOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">Add to Collection</div>
            <div className="modal-sub">{card.name} · {card.set_name} #{card.number}</div>
            <label className="modal-label">Condition</label>
            <select className="toolbar-select" style={{ width: '100%', marginBottom: 16, padding: '9px 12px', fontSize: 13.5, borderRadius: 5, borderColor: '#ccc' }} value={condition} onChange={(e) => setCondition(e.target.value)}>
              {CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <label className="modal-label">Quantity</label>
            <input className="modal-input" type="number" min={1} max={99} value={quantity} onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))} style={{ fontSize: 20, marginBottom: 20 }} />
            <div className="modal-btns">
              <button className="modal-cancel" onClick={() => setModalOpen(false)}>Cancel</button>
              <button className="modal-confirm" onClick={handleAdd} disabled={submitting}>{submitting ? 'Adding…' : 'Add to Collection'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
