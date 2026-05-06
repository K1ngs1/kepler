'use client';

import { useState, useMemo, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import TxStatus from './TxStatus';
import type { Stage } from './TxStatus';
import { USDC_ADDRESS, MERCHANT_WALLET, ERC20_ABI, parseUsdc, formatUsdc } from '@/lib/web3/usdc';

interface Props {
  tradeId: string;
  depositAmount: number | null;
  initiatorPaid: boolean;
  recipientPaid: boolean;
  isInitiator: boolean;
  partnerName: string;
}

export default function DepositSection({ tradeId, depositAmount, initiatorPaid, recipientPaid, isInitiator, partnerName }: Props) {
  const { address, isConnected } = useAccount();
  const [proposedAmount, setProposedAmount] = useState(depositAmount ? depositAmount.toString() : '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [txStage, setTxStage] = useState<Stage>('idle');

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

  const derivedStage: Stage = useMemo(() => {
    if (txStage === 'error') return 'error';
    if (isConfirmed) return 'confirmed';
    if (isConfirming) return 'confirming';
    if (txHash) return 'submitted';
    if (isSigning) return 'wallet';
    return txStage;
  }, [txStage, isConfirmed, isConfirming, txHash, isSigning]);

  // Update DB when confirmed
  const recordDeposit = useCallback(async (hash: string) => {
    const supabase = createClient();
    if (!supabase) return;

    const updates = isInitiator
      ? { initiator_deposit_paid: true, initiator_deposit_txn: hash }
      : { recipient_deposit_paid: true, recipient_deposit_txn: hash };

    await supabase.from('trade_offers').update(updates).eq('id', tradeId);
  }, [isInitiator, tradeId]);

  if (isConfirmed && txHash && txStage !== 'confirmed') {
    setTxStage('confirmed');
    recordDeposit(txHash);
  }

  if (writeError && txStage !== 'error') {
    setTxStage('error');
    setError(writeError.message.split('\n')[0]);
  }

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

    const { error: updateError } = await supabase
      .from('trade_offers')
      .update({ deposit_amount: amount })
      .eq('id', tradeId);

    if (updateError) {
      setError(updateError.message);
    }
    setLoading(false);
  };

  const handleLockDeposit = () => {
    if (!isConnected || !address) {
      setError('Please connect your wallet first.');
      return;
    }
    if (depositAmount == null || depositAmount <= 0) {
      setError('No deposit amount agreed.');
      return;
    }
    if (usdcBalance !== null && depositAmount > usdcBalance) {
      setError(`Insufficient USDC. You have ${usdcBalance.toFixed(2)} USDC.`);
      return;
    }

    setError('');
    setTxStage('wallet');

    writeContract({
      address: USDC_ADDRESS,
      abi: ERC20_ABI,
      functionName: 'transfer',
      args: [MERCHANT_WALLET, parseUsdc(depositAmount)],
    });
  };

  const myPaid = isInitiator ? initiatorPaid : recipientPaid;
  const theirPaid = isInitiator ? recipientPaid : initiatorPaid;
  const isProcessing = derivedStage === 'wallet' || derivedStage === 'submitted' || derivedStage === 'confirming';

  return (
    <div style={{ marginTop: 24, padding: 16, border: '1px solid #ebebeb', borderRadius: 8, background: '#fafafa' }}>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6, color: '#111' }}>
        Security Deposit (USDC Escrow)
      </div>
      <div style={{ fontSize: 12, color: '#555', marginBottom: 12 }}>
        Both parties lock USDC into the merchant wallet. Funds are released on completion or refunded on dispute.
      </div>

      {error && <div className="auth-error" style={{ marginBottom: 10, padding: 8 }}>{error}</div>}

      {/* Propose amount (only before either party pays) */}
      {!myPaid && !theirPaid && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16 }}>
          <input
            className="login-field-input"
            type="number"
            step="1"
            placeholder="0"
            value={proposedAmount}
            onChange={(e) => setProposedAmount(e.target.value)}
            style={{ marginBottom: 0, width: 120, padding: '8px 12px' }}
            disabled={isProcessing}
          />
          <button
            className="btn-outline-ext"
            style={{ marginTop: 0, width: 'auto', padding: '8px 14px' }}
            onClick={handlePropose}
            disabled={loading || isProcessing}
          >
            {loading ? '...' : 'Propose Amount'}
          </button>
        </div>
      )}

      {depositAmount != null && depositAmount > 0 && (
        <div style={{ background: '#fff', border: '1px solid #ddd', borderRadius: 4, padding: 12, fontSize: 13 }}>
          <div style={{ marginBottom: 8, fontWeight: 600 }}>Agreed Deposit: {depositAmount.toFixed(2)} USDC</div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ color: myPaid ? '#3db56c' : '#888' }}>
              You: {myPaid ? '✓ Locked' : 'Not locked'}
            </span>
            <span style={{ color: theirPaid ? '#3db56c' : '#888' }}>
              {partnerName}: {theirPaid ? '✓ Locked' : 'Not locked'}
            </span>
          </div>

          {/* Wallet info */}
          {isConnected && address && !myPaid && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: 12, color: '#555' }}>
                Wallet:{' '}
                <span style={{ fontFamily: 'monospace', color: '#333' }}>
                  {address.slice(0, 6)}…{address.slice(-4)}
                </span>
              </span>
              {usdcBalance !== null && (
                <span style={{
                  display: 'inline-block', fontSize: 11, color: '#555',
                  border: '1px solid #ddd', borderRadius: 3, padding: '2px 8px',
                }}>
                  {usdcBalance.toFixed(2)} USDC
                </span>
              )}
            </div>
          )}

          {!myPaid && (
            <>
              {!isConnected ? (
                <ConnectButton.Custom>
                  {({ openConnectModal, mounted }) => (
                    <button
                      onClick={openConnectModal}
                      disabled={!mounted}
                      className="nav-sell"
                      style={{ fontSize: 13, padding: '10px 16px', width: '100%', borderRadius: 6 }}
                    >
                      Connect Wallet to Lock Deposit
                    </button>
                  )}
                </ConnectButton.Custom>
              ) : (
                <button
                  className="btn-place-bid"
                  style={{ marginTop: 0, padding: '10px 16px', fontSize: 13 }}
                  onClick={handleLockDeposit}
                  disabled={isProcessing || derivedStage === 'confirmed'}
                >
                  {isProcessing
                    ? 'Processing…'
                    : derivedStage === 'confirmed'
                    ? '✓ Deposit Locked'
                    : `Lock ${depositAmount.toFixed(2)} USDC`}
                </button>
              )}

              <TxStatus
                stage={derivedStage}
                txHash={txHash}
                error={error}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}
