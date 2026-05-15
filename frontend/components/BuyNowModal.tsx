'use client';

import { useState, useMemo, useEffect } from 'react';
import { parseUnits } from 'viem';
import { useAccount, useSendTransaction, useWaitForTransactionReceipt } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { createClient } from '@/lib/supabase/client';

const MERCHANT_WALLET = process.env.NEXT_PUBLIC_MERCHANT_WALLET as `0x${string}` | undefined;

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

type TxStage = 'idle' | 'wallet' | 'submitted' | 'confirming' | 'confirmed' | 'error';

export default function BuyNowModal({ onClose, listingId, sellerId, items, prices }: Props) {
  const { address, isConnected } = useAccount();

  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(
    new Set(items.map((i) => i.id))
  );
  const [error, setError] = useState('');
  const [txStage, setTxStage] = useState<TxStage>('idle');
  const [offerId, setOfferId] = useState<string | null>(null);

  const calculatedTotal = useMemo(() => {
    let sum = 0;
    items.forEach((item) => {
      if (selectedItemIds.has(item.id) && item.custom_price != null) {
        sum += item.custom_price;
      }
    });
    return sum;
  }, [items, selectedItemIds]);

  const [offerAmount, setOfferAmount] = useState(calculatedTotal.toString());

  // Send native transaction hook (USDC is native on Arc)
  const { sendTransaction, data: txHash, isPending: isSigning, error: writeError } = useSendTransaction();

  // Wait for receipt
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash: txHash,
    query: { enabled: !!txHash },
  });

  // Derive stage from wagmi state
  const derivedStage: TxStage = useMemo(() => {
    if (txStage === 'error') return 'error';
    if (isConfirmed) return 'confirmed';
    if (isConfirming) return 'confirming';
    if (txHash) return 'submitted';
    if (isSigning) return 'wallet';
    return txStage;
  }, [txStage, isConfirmed, isConfirming, txHash, isSigning]);

  // Verify payment on backend when confirmed
  useEffect(() => {
    if (isConfirmed && txHash && offerId && txStage !== 'confirmed') {
      setTxStage('confirmed');
      const supabase = createClient();
      if (supabase) {
        supabase.functions.invoke('polygon-verify', {
          body: { purchase_offer_id: offerId, tx_hash: txHash },
        }).catch((err) => console.error('Verification error:', err));
      }
    }
  }, [isConfirmed, txHash, offerId, txStage]);

  useEffect(() => {
    if (writeError && txStage !== 'error') {
      setTxStage('error');
      setError(writeError.message.split('\n')[0]);
    }
  }, [writeError, txStage]);

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
    if (!isConnected || !address) {
      setError('Please connect your wallet first.');
      return;
    }
    if (!MERCHANT_WALLET) {
      setError('Merchant wallet is not configured.');
      return;
    }
    setError('');
    setTxStage('wallet');

    const supabase = createClient();
    if (!supabase) {
      setError('Supabase is not configured.');
      setTxStage('error');
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError('You must be logged in to buy.');
      setTxStage('error');
      return;
    }

    try {
      // 1. Create purchase offer record
      const { data, error: insertError } = await supabase
        .from('purchase_offers')
        .insert({
          listing_id: listingId,
          buyer_id: user.id,
          seller_id: sellerId,
          amount,
          status: 'pending',
        })
        .select('id')
        .single();

      if (insertError) throw insertError;
      setOfferId(data.id);

      // 2. Send native USDC transfer (USDC is native gas token on Arc)
      const amountInWei = parseUnits(amount.toString(), 18);
      sendTransaction({
        to: MERCHANT_WALLET,
        value: amountInWei,
      });
    } catch (err: any) {
      setError(err.message || 'Something went wrong.');
      setTxStage('error');
    }
  };

  const isProcessing = derivedStage === 'wallet' || derivedStage === 'submitted' || derivedStage === 'confirming';

  const explorerBase = process.env.NEXT_PUBLIC_CHAIN === 'mainnet'
    ? 'https://polygonscan.com/tx/'
    : 'https://testnet.arcscan.app/tx/';

  return (
    <div className="modal-bg" onClick={isProcessing ? undefined : onClose}>
      <div className="login-modal" onClick={(e) => e.stopPropagation()} style={{ width: 480 }}>
        <button className="login-close" onClick={onClose} disabled={isProcessing}>×</button>
        <div className="login-logo">Kepler</div>
        <div className="login-heading">Buy Cards</div>
        <div className="login-sub">Select the cards you want to purchase with USDC.</div>

        {error && <div className="auth-error" style={{ marginBottom: 14 }}>{error}</div>}

        {/* Wallet connection step */}
        {!isConnected ? (
          <div style={{ marginBottom: 20, textAlign: 'center' }}>
            <div style={{ fontSize: 13, color: '#555', marginBottom: 12 }}>Connect your wallet to continue</div>
            <ConnectButton.Custom>
              {({ openConnectModal, mounted }) => (
                <button
                  onClick={openConnectModal}
                  disabled={!mounted}
                  style={{
                    display: 'inline-flex', alignItems: 'center',
                    background: '#e5342a', color: '#fff', border: 'none',
                    borderRadius: 999, padding: '12px 28px', fontSize: 14,
                    fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  Connect Wallet
                </button>
              )}
            </ConnectButton.Custom>
          </div>
        ) : (
          <>
            {/* Connected wallet info */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: '#555' }}>
                Wallet:{' '}
                <span style={{ fontFamily: 'monospace', color: '#333' }}>
                  {address?.slice(0, 6)}…{address?.slice(-4)}
                </span>
              </div>
            </div>

            {/* Card selection */}
            <div style={{ maxHeight: 200, overflowY: 'auto', marginBottom: 16, border: '1px solid #e5e5e5', borderRadius: 6 }}>
              {items.map((item) => (
                <label
                  key={item.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                    borderBottom: '1px solid #f0f0f0', cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selectedItemIds.has(item.id)}
                    onChange={() => handleToggle(item.id)}
                    style={{ width: 16, height: 16, accentColor: '#111' }}
                    disabled={isProcessing}
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

            <label className="login-field-label">Offer Amount (USDC)</label>
            <input
              className="login-field-input"
              type="number"
              step="0.01"
              placeholder="0.00"
              value={offerAmount}
              onChange={(e) => setOfferAmount(e.target.value)}
              disabled={isProcessing}
            />

            <button
              className="login-submit-btn"
              onClick={handlePurchase}
              disabled={isProcessing || derivedStage === 'confirmed'}
              style={{ marginTop: 16 }}
            >
              {isProcessing
                ? 'Processing…'
                : derivedStage === 'confirmed'
                ? 'Payment Complete'
                : 'Pay with USDC'}
            </button>

            {/* Transaction status */}
            {derivedStage !== 'idle' && (
              <div style={{
                marginTop: 16, padding: 16, background: '#fff',
                border: '1px solid #e5e5e5', borderRadius: 8,
                fontSize: 13, color: '#555',
              }}>
                <div style={{
                  fontWeight: 600, marginBottom: 6,
                  color: derivedStage === 'error' ? '#c0392b'
                    : derivedStage === 'confirmed' ? '#3db56c' : '#111',
                }}>
                  {derivedStage === 'wallet' && 'Waiting for wallet confirmation…'}
                  {derivedStage === 'submitted' && 'Transaction submitted'}
                  {derivedStage === 'confirming' && 'Waiting for block confirmations…'}
                  {derivedStage === 'confirmed' && 'Payment confirmed!'}
                  {derivedStage === 'error' && 'Transaction failed'}
                </div>
                {txHash && (
                  <div style={{ fontSize: 12, color: '#777' }}>
                    tx:{' '}
                    <a
                      href={`${explorerBase}${txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: '#555', textDecoration: 'underline', fontFamily: 'monospace' }}
                    >
                      {txHash.slice(0, 6)}…{txHash.slice(-4)}
                    </a>
                  </div>
                )}
                {(derivedStage === 'wallet' || derivedStage === 'confirming') && (
                  <div style={{ marginTop: 8, width: 18, height: 18, border: '2.5px solid #e5e5e5', borderTopColor: '#e5342a', borderRadius: '50%', animation: 'keplerSpin 0.8s linear infinite' }} />
                )}
                <style>{`@keyframes keplerSpin { to { transform: rotate(360deg); } }`}</style>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
