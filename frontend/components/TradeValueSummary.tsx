'use client';

interface Props {
  offerTotal: number;
  requestTotal: number;
  offerLabel?: string;
  requestLabel?: string;
}

export default function TradeValueSummary({ offerTotal, requestTotal, offerLabel = 'Your offer', requestLabel = 'Their offer' }: Props) {
  if (offerTotal <= 0 && requestTotal <= 0) return null;

  const diff = offerTotal - requestTotal;
  const diffColor = Math.abs(diff) < 0.5 ? '#888' : diff > 0 ? '#c0392b' : '#3db56c';

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      fontSize: 12,
      color: '#555',
      padding: '8px 0',
      flexWrap: 'wrap',
    }}>
      {offerTotal > 0 && (
        <span>{offerLabel}: <strong>~${offerTotal.toFixed(2)}</strong></span>
      )}
      {offerTotal > 0 && requestTotal > 0 && <span style={{ color: '#ccc' }}>·</span>}
      {requestTotal > 0 && (
        <span>{requestLabel}: <strong>~${requestTotal.toFixed(2)}</strong></span>
      )}
      {offerTotal > 0 && requestTotal > 0 && Math.abs(diff) >= 0.01 && (
        <>
          <span style={{ color: '#ccc' }}>·</span>
          <span style={{ color: diffColor, fontWeight: 600 }}>
            {diff > 0 ? `You give $${diff.toFixed(2)} more` : `You get $${Math.abs(diff).toFixed(2)} more`}
          </span>
        </>
      )}
    </div>
  );
}
