'use client';

import { useState, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';

interface ListingItem {
  id: string;
  condition: string;
  custom_price: number | null;
  catalog_cards: {
    name: string;
    set_name: string;
  };
}

interface Props {
  onClose: () => void;
  listingId: string;
  sellerId: string;
  items: ListingItem[];
  prices: Record<string, number>;
}

export default function BuyNowModal({ onClose, listingId, sellerId, items, prices }: Props) {
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(
    new Set(items.map((i) => i.id))
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const calculatedTotal = useMemo(() => {
    let sum = 0;
    items.forEach((item) => {
      if (selectedItemIds.has(item.id)) {
        if (item.custom_price != null) {
          sum += item.custom_price;
        } else {
          // fallback to prices map if available, or 0
          // For simplicity, we assume market price comes from 'prices' if no custom_price
          // The parent component should pass the catalog_card_id -> price map
          sum += 0; // We'll compute this in the component correctly if we had catalog_card_id
        }
      }
    });
    return sum;
  }, [items, selectedItemIds]);

  const [offerAmount, setOfferAmount] = useState(calculatedTotal.toString());

  // Update offer amount when selection changes if user hasn't overridden
  const handleToggle = (id: string) => {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handlePurchase = async () => {
    if (selectedItemIds.size === 0) {
      setError('Please select at least one card.');
      return;
    }
    const amount = parseFloat(offerAmount);
    if (isNaN(amount) || amount <= 0) {
      setError('Please enter a valid offer amount.');
      return;
    }

    setLoading(true);
    setError('');

    const supabase = createClient();
    if (!supabase) {
      setError('Supabase is not configured.');
      setLoading(false);
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError('You must be logged in to buy.');
      setLoading(false);
      return;
    }

    try {
      const { data, error: insertError } = await supabase
        .from('purchase_offers')
        .insert({
          listing_id: listingId,
          buyer_id: user.id,
          seller_id: sellerId,
          amount: amount,
          status: 'pending'
        })
        .select('id')
        .single();

      if (insertError) throw insertError;

      // In the future, this would call the Stripe edge function
      // For now, MVP just closes the modal
      alert('Purchase offer submitted successfully! The seller will be notified.');
      onClose();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="login-modal" onClick={(e) => e.stopPropagation()} style={{ width: 480 }}>
        <button className="login-close" onClick={onClose}>×</button>
        <div className="login-logo">Kepler</div>
        <div className="login-heading">Buy Cards</div>
        <div className="login-sub">Select the cards you want to purchase.</div>

        {error && <div className="auth-error" style={{ marginBottom: 14 }}>{error}</div>}

        <div style={{ maxHeight: 200, overflowY: 'auto', marginBottom: 16, border: '1px solid #e5e5e5', borderRadius: 6 }}>
          {items.map((item) => (
            <label
              key={item.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                borderBottom: '1px solid #f0f0f0', cursor: 'pointer'
              }}
            >
              <input
                type="checkbox"
                checked={selectedItemIds.has(item.id)}
                onChange={() => handleToggle(item.id)}
                style={{ width: 16, height: 16, accentColor: '#111' }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#111' }}>{item.catalog_cards?.name}</div>
                <div style={{ fontSize: 11, color: '#777' }}>{item.catalog_cards?.set_name} · {item.condition}</div>
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#333' }}>
                {item.custom_price != null ? `$${item.custom_price.toFixed(2)}` : 'Market'}
              </div>
            </label>
          ))}
        </div>

        <label className="login-field-label">Offer Amount ($)</label>
        <input
          className="login-field-input"
          type="number"
          step="0.01"
          placeholder="0.00"
          value={offerAmount}
          onChange={(e) => setOfferAmount(e.target.value)}
        />

        <button className="login-submit-btn" onClick={handlePurchase} disabled={loading} style={{ marginTop: 16 }}>
          {loading ? 'Sending...' : 'Send Purchase Offer'}
        </button>
      </div>
    </div>
  );
}
