'use client';

import { useEffect, useState } from 'react';

const chainEnv = process.env.NEXT_PUBLIC_CHAIN ?? 'amoy';
const explorerBase = chainEnv === 'polygon'
  ? 'https://polygonscan.com/tx/'
  : 'https://amoy.polygonscan.com/tx/';

type Stage = 'idle' | 'wallet' | 'submitted' | 'confirming' | 'confirmed' | 'error';

interface Props {
  stage: Stage;
  txHash?: string;
  error?: string;
}

const labels: Record<Stage, string> = {
  idle: '',
  wallet: 'Waiting for wallet confirmation…',
  submitted: 'Transaction submitted',
  confirming: 'Waiting for block confirmations…',
  confirmed: 'Payment confirmed! 🎉',
  error: 'Transaction failed',
};

export default function TxStatus({ stage, txHash, error }: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (stage !== 'idle') setVisible(true);
  }, [stage]);

  if (!visible || stage === 'idle') return null;

  const truncatedHash = txHash
    ? `${txHash.slice(0, 6)}…${txHash.slice(-4)}`
    : null;

  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid #e5e5e5',
        borderRadius: 8,
        padding: 16,
        fontSize: 13,
        color: '#555',
        marginTop: 16,
        transition: 'opacity 0.25s ease',
        opacity: visible ? 1 : 0,
      }}
    >
      <div style={{ fontWeight: 600, color: stage === 'error' ? '#c0392b' : stage === 'confirmed' ? '#3db56c' : '#111', marginBottom: 6 }}>
        {labels[stage]}
      </div>

      {txHash && (
        <div style={{ fontSize: 12, color: '#777', marginBottom: 4 }}>
          tx:{' '}
          <a
            href={`${explorerBase}${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#555', textDecoration: 'underline', fontFamily: 'monospace' }}
          >
            {truncatedHash}
          </a>
        </div>
      )}

      {stage === 'error' && error && (
        <div style={{ fontSize: 12, color: '#c0392b', marginTop: 4 }}>
          {error}
        </div>
      )}

      {(stage === 'wallet' || stage === 'confirming') && (
        <div style={{ marginTop: 8 }}>
          <div style={{
            width: 18, height: 18, border: '2.5px solid #e5e5e5', borderTopColor: '#111',
            borderRadius: '50%', animation: 'keplerSpin 0.8s linear infinite',
          }} />
          <style>{`@keyframes keplerSpin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}
    </div>
  );
}

export type { Stage };
