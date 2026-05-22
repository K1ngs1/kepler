'use client';

import { useState, useMemo, useEffect } from 'react';
import { parseUnits } from 'viem';
import { useAccount, useSendTransaction, useWaitForTransactionReceipt } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { createClient } from '@/lib/supabase/client';

const MERCHANT_WALLET = process.env.NEXT_PUBLIC_MERCHANT_WALLET as `0x${string}` | undefined;

interface Props {
  onClose: () => void;
  offerId: string;
  amount: number;
}

type TxStage = 'idle' | 'wallet' | 'submitted' | 'confirming' | 'confirmed' | 'error';

export default function PaymentModal({ onClose, offerId, amount }: Props) {
  const { address, isConnected } = useAccount();

  const [error, setError] = useState('');
  const [txStage, setTxStage] = useState<TxStage>('idle');

  const { sendTransaction, data: txHash, isPending: isSigning, error: writeError } = useSendTransaction();

  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash: txHash,
    query: { enabled: !!txHash },
  });

  const derivedStage: TxStage = useMemo(() => {
    if (txStage === 'error') return 'error';
    if (isConfirmed) return 'confirmed';
    if (isConfirming) return 'confirming';
    if (txHash) return 'submitted';
    if (isSigning) return 'wallet';
    return txStage;
  }, [txStage, isConfirmed, isConfirming, txHash, isSigning]);

  useEffect(() => {
    if (isConfirmed && txHash && txStage !== 'confirmed') {
      setTxStage('confirmed');
      const supabase = createClient();
      if (supabase) {
        // Update purchase offer status to paid
        supabase
          .from('purchase_offers')
          .update({ status: 'paid', payment_txn_hash: txHash })
          .eq('id', offerId)
          .then(() => {});

        // Also call polygon-verify if available
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

  const handlePayment = async () => {
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

    try {
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
        <div className="login-heading">Complete Payment</div>
        <div className="login-sub">
          Your offer of <strong>${amount.toFixed(2)}</strong> was accepted! Connect your wallet and pay to complete the purchase.
        </div>

        {error && <div className="auth-error" style={{ marginBottom: 14 }}>{error}</div>}

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
                    background: '#111', color: '#fff', border: 'none',
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: '#555' }}>
                Wallet:{' '}
                <span style={{ fontFamily: 'monospace', color: '#333' }}>
                  {address?.slice(0, 6)}…{address?.slice(-4)}
                </span>
              </div>
            </div>

            <div style={{
              padding: '14px 16px', background: '#f8fdf9', border: '1px solid #c8e6d0',
              borderRadius: 6, marginBottom: 16, textAlign: 'center',
            }}>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>Amount to Pay</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#111' }}>${amount.toFixed(2)}</div>
              <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>USDC on Polygon</div>
            </div>

            <button
              className="login-submit-btn"
              onClick={handlePayment}
              disabled={isProcessing || derivedStage === 'confirmed'}
              style={{ marginTop: 8 }}
            >
              {isProcessing
                ? 'Processing…'
                : derivedStage === 'confirmed'
                ? '✓ Payment Complete'
                : `Pay $${amount.toFixed(2)} with USDC`}
            </button>

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
                  {derivedStage === 'confirmed' && 'Payment confirmed! 🎉'}
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
                  <div style={{ marginTop: 8, width: 18, height: 18, border: '2.5px solid #e5e5e5', borderTopColor: '#111', borderRadius: '50%', animation: 'keplerSpin 0.8s linear infinite' }} />
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
