'use client';

import { useState, useMemo, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import TxStatus from './TxStatus';
import type { Stage } from './TxStatus';
import { USDC_ADDRESS, MERCHANT_WALLET, ERC20_ABI, parseUsdc, formatUsdc } from '@/lib/web3/usdc';

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
  const { address, isConnected } = useAccount();

  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(
    new Set(items.map((i) => i.id))
  );
  const [error, setError] = useState('');
  const [txStage, setTxStage] = useState<Stage>('idle');
  const [offerId, setOfferId] = useState<string | null>(null);

  const calculatedTotal = useMemo(() => {
    let sum = 0;
    items.forEach((item) => {
      if (selectedItemIds.has(item.id)) {
        if (item.custom_price != null) {
          sum += item.custom_price;
        }
      }
    });
    return sum;
  }, [items, selectedItemIds]);

  const [offerAmount, setOfferAmount] = useState(calculatedTotal.toString());

  // ── USDC balance ──
  const { data: rawBalance } = useReadContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });
  const usdcBalance = rawBalance != null ? formatUsdc(rawBalance as bigint) : null;

  // ── wagmi write hook ──
  const { writeContract, data: txHash, isPending: isSigning, error: writeError } = useWriteContract();

  // ── wait for receipt ──
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash: txHash,
    query: { enabled: !!txHash },
  });

  // Derive txStage from wagmi state
  const derivedStage: Stage = useMemo(() => {
    if (txStage === 'error') return 'error';
    if (isConfirmed) return 'confirmed';
    if (isConfirming) return 'confirming';
    if (txHash) return 'submitted';
    if (isSigning) return 'wallet';
    return txStage;
  }, [txStage, isConfirmed, isConfirming, txHash, isSigning]);

  // When confirmed, verify on backend
  const verifyPayment = useCallback(async (hash: string, purchaseOfferId: string) => {
    const supabase = createClient();
    if (!supabase) return;

    try {
      const { data, error: fnErr } = await supabase.functions.invoke('polygon-verify', {
        body: { purchase_offer_id: purchaseOfferId, txn_hash: hash },
      });
      if (fnErr) throw fnErr;
      // Payment verified — stage is already 'confirmed' from wagmi
    } catch (err: any) {
      console.error('Verification error:', err);
      // Don't override confirmed state — the on-chain tx succeeded
    }
  }, []);

  // Trigger verification when transaction is confirmed
  if (isConfirmed && txHash && offerId && txStage !== 'confirmed') {
    setTxStage('confirmed');
    verifyPayment(txHash, offerId);
  }

  if (writeError && txStage !== 'error') {
    setTxStage('error');
    setError(writeError.message.split('\n')[0]);
  }

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

    if (usdcBalance !== null && amount > usdcBalance) {
      setError(`Insufficient USDC balance. You have ${usdcBalance.toFixed(2)} USDC.`);
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
          amount: amount,
          status: 'pending',
          buyer_wallet: address,
        })
        .select('id')
        .single();

      if (insertError) throw insertError;
      setOfferId(data.id);

      // 2. Trigger USDC transfer to merchant wallet
      writeContract({
        address: USDC_ADDRESS,
        abi: ERC20_ABI,
        functionName: 'transfer',
        args: [MERCHANT_WALLET, parseUsdc(amount)],
      });
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Something went wrong.');
      setTxStage('error');
    }
  };

  const isProcessing = derivedStage === 'wallet' || derivedStage === 'submitted' || derivedStage === 'confirming';

  return (
    <div className="modal-bg" onClick={isProcessing ? undefined : onClose}>
      <div className="login-modal" onClick={(e) => e.stopPropagation()} style={{ width: 480 }}>
        <button className="login-close" onClick={onClose} disabled={isProcessing}>×</button>
        <div className="login-logo">Kepler</div>
        <div className="login-heading">Buy Cards</div>
        <div className="login-sub">Select the cards you want to purchase with USDC.</div>

        {error && <div className="auth-error" style={{ marginBottom: 14 }}>{error}</div>}

        {/* Wallet connect step */}
        {!isConnected ? (
          <div style={{ marginBottom: 20, textAlign: 'center' }}>
            <div style={{ fontSize: 13, color: '#555', marginBottom: 12 }}>Connect your wallet to continue</div>
            <ConnectButton.Custom>
              {({ openConnectModal, mounted }) => (
                <button
                  onClick={openConnectModal}
                  disabled={!mounted}
                  className="nav-sell"
                  style={{ fontSize: 14, padding: '10px 24px', width: '100%', borderRadius: 6 }}
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
              {usdcBalance !== null && (
                <span style={{
                  display: 'inline-block', fontSize: 11, color: '#555',
                  border: '1px solid #ddd', borderRadius: 3, padding: '2px 8px',
                }}>
                  {usdcBalance.toFixed(2)} USDC
                </span>
              )}
            </div>

            {/* Card selection list */}
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
                ? '✓ Payment Complete'
                : 'Pay with USDC'}
            </button>

            <TxStatus
              stage={derivedStage}
              txHash={txHash}
              error={error}
            />
          </>
        )}
      </div>
    </div>
  );
}
