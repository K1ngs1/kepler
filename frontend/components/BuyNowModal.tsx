'use client';

import { useState, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';

interface ListingItem {
  id: string;
  card_name: string;
  set_name?: string | null;
  condition_text?: string | null;
  custom_price: number | null;
}

interface Props {
  onClose: () => void;
  listingId: string;
  sellerId: string;
  items: ListingItem[];
  onOfferSent?: () => void;
}

export default function BuyNowModal({ onClose, listingId, sellerId, items, onOfferSent }: Props) {
  // Pre-fill with all card names from the listing
  const defaultCardsText = items.map((i) => {
    let line = i.card_name;
    if (i.set_name) line += ` — ${i.set_name}`;
    if (i.condition_text) line += ` (${i.condition_text})`;
    return line;
  }).join('\n');

  const [cardsWanted, setCardsWanted] = useState(defaultCardsText);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const calculatedTotal = useMemo(() => {
    let sum = 0;
    items.forEach((item) => {
      if (item.custom_price != null) sum += item.custom_price;
    });
    return sum;
  }, [items]);

  const [offerAmount, setOfferAmount] = useState(calculatedTotal > 0 ? calculatedTotal.toString() : '');

  const handleSubmit = async () => {
    if (!cardsWanted.trim()) {
      setError('Please describe which cards you want to buy.');
      return;
    }
    const amount = parseFloat(offerAmount);
    if (isNaN(amount) || amount <= 0) {
      setError('Please enter a valid offer amount.');
      return;
    }
    setError('');
    setSubmitting(true);

    const supabase = createClient();
    if (!supabase) {
      setError('Supabase is not configured.');
      setSubmitting(false);
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError('You must be logged in to submit an offer.');
      setSubmitting(false);
      return;
    }

    try {
      const { error: insertError } = await supabase
        .from('purchase_offers')
        .insert({
          listing_id: listingId,
          buyer_id: user.id,
          seller_id: sellerId,
          amount,
          cards_wanted: cardsWanted.trim(),
          status: 'pending',
        });

      if (insertError) throw insertError;

      setSubmitted(true);
      onOfferSent?.();
    } catch (err: any) {
      setError(err.message || 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-bg" onClick={submitted ? onClose : undefined}>
      <div className="login-modal" onClick={(e) => e.stopPropagation()} style={{ width: 480 }}>
        <button className="login-close" onClick={onClose} disabled={submitting}>×</button>
        <div className="login-logo">Kepler</div>

        {submitted ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>✓</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#111', marginBottom: 8 }}>
              Offer Submitted!
            </div>
            <div style={{ fontSize: 13, color: '#666', lineHeight: 1.6, maxWidth: 340, margin: '0 auto 20px' }}>
              The seller has been notified of your offer. You&apos;ll be able to pay once they accept.
            </div>
            <button
              className="login-submit-btn"
              onClick={onClose}
              style={{ maxWidth: 200, margin: '0 auto' }}
            >
              Done
            </button>
          </div>
        ) : (
          <>
            <div className="login-heading">Make an Offer</div>
            <div className="login-sub">Describe the cards you want and propose a price. The seller will review your offer.</div>

            {error && <div className="auth-error" style={{ marginBottom: 14 }}>{error}</div>}

            <label className="login-field-label">Cards You Want to Buy</label>
            <textarea
              className="login-field-input"
              placeholder={"e.g.\nCharizard VMAX — Darkness Ablaze (NM)\nPikachu GX — Hidden Fates (LP)\n\nType the cards you're interested in..."}
              value={cardsWanted}
              onChange={(e) => setCardsWanted(e.target.value)}
              disabled={submitting}
              style={{
                height: 120,
                resize: 'vertical',
                fontSize: 13,
                lineHeight: 1.55,
                fontFamily: 'inherit',
              }}
            />
            <div style={{ fontSize: 11, color: '#999', marginBottom: 14, marginTop: -8 }}>
              One card per line. You can also describe quantities or specific requests.
            </div>

            <label className="login-field-label">Your Offer (USD)</label>
            <input
              className="login-field-input"
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              value={offerAmount}
              onChange={(e) => setOfferAmount(e.target.value)}
              disabled={submitting}
            />

            <button
              className="login-submit-btn"
              onClick={handleSubmit}
              disabled={submitting}
              style={{ marginTop: 16 }}
            >
              {submitting ? 'Submitting…' : 'Submit Offer'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
