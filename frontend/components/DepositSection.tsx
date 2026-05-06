'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

interface Props {
  tradeId: string;
  depositAmount: number | null;
  initiatorPaid: boolean;
  recipientPaid: boolean;
  isInitiator: boolean;
  partnerName: string;
}

export default function DepositSection({ tradeId, depositAmount, initiatorPaid, recipientPaid, isInitiator, partnerName }: Props) {
  const [proposedAmount, setProposedAmount] = useState(depositAmount ? depositAmount.toString() : '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handlePropose = async () => {
    const amount = parseFloat(proposedAmount);
    if (isNaN(amount) || amount < 0) {
      setError('Please enter a valid amount.');
      return;
    }

    setLoading(true);
    setError('');
    const supabase = createClient();
    if (!supabase) return;

    // Update the deposit amount on the trade
    const { error: updateError } = await supabase
      .from('trade_offers')
      .update({ deposit_amount: amount })
      .eq('id', tradeId);

    if (updateError) {
      setError(updateError.message);
    } else {
      // Refresh logic would ideally happen via the realtime subscription in the parent
    }
    setLoading(false);
  };

  const handleMarkPaid = async () => {
    setLoading(true);
    setError('');
    const supabase = createClient();
    if (!supabase) return;

    const updates = isInitiator ? { initiator_deposit_paid: true } : { recipient_deposit_paid: true };

    const { error: updateError } = await supabase
      .from('trade_offers')
      .update(updates)
      .eq('id', tradeId);

    if (updateError) {
      setError(updateError.message);
    }
    setLoading(false);
  };

  const myPaid = isInitiator ? initiatorPaid : recipientPaid;
  const theirPaid = isInitiator ? recipientPaid : initiatorPaid;

  return (
    <div style={{ marginTop: 24, padding: '16px', border: '1px solid #e5e5e5', borderRadius: 4, background: '#fafafa' }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6, color: '#111' }}>
        Security Deposit (Escrow)
      </div>
      <div style={{ fontSize: 12, color: '#555', marginBottom: 12 }}>
        To protect against fraud, both parties can agree on a refundable deposit.
      </div>

      {error && <div className="auth-error" style={{ marginBottom: 10, padding: 8 }}>{error}</div>}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16 }}>
        <input
          className="login-field-input"
          type="number"
          step="1"
          placeholder="0"
          value={proposedAmount}
          onChange={(e) => setProposedAmount(e.target.value)}
          style={{ marginBottom: 0, width: 120, padding: '8px 12px' }}
          disabled={myPaid || theirPaid}
        />
        <button
          className="btn-outline-ext"
          style={{ marginTop: 0, width: 'auto', padding: '8px 14px' }}
          onClick={handlePropose}
          disabled={loading || myPaid || theirPaid}
        >
          {loading ? '...' : 'Propose Amount'}
        </button>
      </div>

      {depositAmount != null && depositAmount > 0 && (
        <div style={{ background: '#fff', border: '1px solid #ddd', borderRadius: 4, padding: '12px', fontSize: 13 }}>
          <div style={{ marginBottom: 8, fontWeight: 600 }}>Agreed Deposit: ${depositAmount.toFixed(2)}</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ color: myPaid ? '#3db56c' : '#888' }}>
              You: {myPaid ? '✓ Paid' : 'Waiting for payment'}
            </span>
            <span style={{ color: theirPaid ? '#3db56c' : '#888' }}>
              {partnerName}: {theirPaid ? '✓ Paid' : 'Waiting for payment'}
            </span>
          </div>
          
          {!myPaid && (
            <button
              className="btn-place-bid"
              style={{ marginTop: 0, padding: '10px 16px', fontSize: 13 }}
              onClick={handleMarkPaid}
              disabled={loading}
            >
              {loading ? '...' : 'Mark as Paid (Manual)'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
