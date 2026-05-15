'use client';

import { useState, useMemo } from 'react';
import { parseAbi, formatUnits } from 'viem';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { createClient } from '@/lib/supabase/client';
import { USDC_DECIMALS } from '@/lib/web3/usdc';
import { USDC_ADDRESS } from '@/lib/web3/config';

const abi = parseAbi([
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
]);

const MERCHANT_WALLET = process.env.NEXT_PUBLIC_MERCHANT_WALLET as `0x${string}` | undefined;

type TxStage = 'idle' | 'wallet' | 'submitted' | 'confirming' | 'confirmed' | 'error';

interface Props {
  tradeId: string;
  depositAmount: number | null;
  initiatorLocked: boolean;
  recipientLocked: boolean;
  isInitiator: boolean;
  partnerName: string;
}

export default function DepositSection({ tradeId, depositAmount, initiatorLocked, recipientLocked, isInitiator, partnerName }: Props) {
  const { address, isConnected } = useAccount();
  const [proposedAmount, setProposedAmount] = useState(depositAmount ? depositAmount.toString() : '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [txStage, setTxStage] = useState<TxStage>('idle');

  // USDC balance
  const { data: rawBalance } = useReadContract({
    address: USDC_ADDRESS as `0x${string}`,
    abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });
  const usdcBalance = rawBalance != null
    ? parseFloat(formatUnits(rawBalance as bigint, USDC_DECIMALS))
    : null;

  // Write contract
  const { writeContract, data: txHash, isPending: isSigning, error: writeError } = useWriteContract();

  // Wait for receipt
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

  // Update DB when confirmed
  if (isConfirmed && txHash && txStage !== 'confirmed') {
    setTxStage('confirmed');
    const supabase = createClient();
    if (supabase) {
      const updates = isInitiator
        ? { initiator_deposit_locked: true, initiator_deposit_txn: txHash }
        : { recipient_deposit_locked: true, recipient_deposit_txn: txHash };
      supabase.from('trade_offers').update(updates).eq('id', tradeId)
        .then(({ error: e }) => { if (e) console.error('Deposit update error:', e); });
    }
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

    if (updateError) setError(updateError.message);
    setLoading(false);
  };

  const handleLockDeposit = () => {
    if (!isConnected || !address) {
      setError('Please connect your wallet first.');
      return;
    }
    if (!MERCHANT_WALLET) {
      setError('Merchant wallet is not configured.');
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

    const amountInUnits = BigInt(Math.round(depositAmount * 10 ** USDC_DECIMALS));
    writeContract({
      address: USDC_ADDRESS as `0x${string}`,
      abi,
      functionName: 'transfer',
      args: [MERCHANT_WALLET, amountInUnits],
    });
  };

  const myLocked = isInitiator ? initiatorLocked : recipientLocked;
  const theirLocked = isInitiator ? recipientLocked : initiatorLocked;
  const isProcessing = derivedStage === 'wallet' || derivedStage === 'submitted' || derivedStage === 'confirming';

  const explorerBase = process.env.NEXT_PUBLIC_CHAIN === 'mainnet'
    ? 'https://polygonscan.com/tx/'
    : 'https://testnet.arcscan.app/tx/';

  return (
    <div style={{ marginTop: 24, padding: 16, border: '1px solid #ebebeb', borderRadius: 8, background: '#fafafa' }}>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6, color: '#111' }}>
        Security Deposit (USDC)
      </div>
      <div style={{ fontSize: 12, color: '#555', marginBottom: 12 }}>
        Both parties lock USDC into the merchant wallet. Funds are released on completion or refunded manually on dispute.
        <span style={{ color: '#999', fontStyle: 'italic' }} title="For MVP, refunds and releases are handled via the polygon-release edge function. Contact support if you need a refund.">
          {' '}(?)
        </span>
      </div>

      {error && <div className="auth-error" style={{ marginBottom: 10, padding: 8 }}>{error}</div>}

      {/* Propose amount (before either party locks) */}
      {!myLocked && !theirLocked && (
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
            <span style={{ color: myLocked ? '#3db56c' : '#888' }}>
              You: {myLocked ? 'Locked' : 'Not locked'}
            </span>
            <span style={{ color: theirLocked ? '#3db56c' : '#888' }}>
              {partnerName}: {theirLocked ? 'Locked' : 'Not locked'}
            </span>
          </div>

          {/* Wallet info */}
          {isConnected && address && !myLocked && (
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
                  background: '#f0f0f0', borderRadius: 12, padding: '3px 10px',
                }}>
                  {usdcBalance.toFixed(2)} USDC
                </span>
              )}
            </div>
          )}

          {!myLocked && (
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
                    ? 'Deposit Locked'
                    : `Lock ${depositAmount.toFixed(2)} USDC`}
                </button>
              )}

              {/* Transaction status */}
              {derivedStage !== 'idle' && (
                <div style={{
                  marginTop: 12, padding: 12, background: '#fff',
                  border: '1px solid #e5e5e5', borderRadius: 8,
                  fontSize: 13, color: '#555',
                }}>
                  <div style={{
                    fontWeight: 600, marginBottom: 4,
                    color: derivedStage === 'error' ? '#c0392b'
                      : derivedStage === 'confirmed' ? '#3db56c' : '#111',
                  }}>
                    {derivedStage === 'wallet' && 'Waiting for wallet confirmation…'}
                    {derivedStage === 'submitted' && 'Transaction submitted'}
                    {derivedStage === 'confirming' && 'Waiting for block confirmations…'}
                    {derivedStage === 'confirmed' && 'Deposit locked!'}
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
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
