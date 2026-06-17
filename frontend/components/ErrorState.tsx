'use client';

interface Props {
  message: string;
  onRetry?: () => void;
}

/**
 * Inline error panel for data-fetch failures. Use when a page/section query
 * errors, so the user sees a real failure (and a retry) instead of an empty
 * state or an infinite spinner.
 */
export default function ErrorState({ message, onRetry }: Props) {
  return (
    <div role="alert" style={{ textAlign: 'center', padding: '64px 0' }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: '#c0392b', marginBottom: 8 }}>
        Something went wrong
      </div>
      <div style={{ fontSize: 13, color: '#888', marginBottom: onRetry ? 16 : 0 }}>{message}</div>
      {onRetry && (
        <button
          onClick={onRetry}
          style={{
            background: '#111', color: '#fff', border: 'none', borderRadius: 999,
            padding: '9px 22px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Try again
        </button>
      )}
    </div>
  );
}
