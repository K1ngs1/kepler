'use client';

import { useEffect } from 'react';
import { handleError } from '@/lib/error-handler';

/**
 * Route-segment error boundary. Catches render/runtime errors thrown by pages
 * so the user sees a recoverable screen instead of a blank crash, and the
 * error is logged through the shared handler.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    handleError(error, { where: 'route.error', digest: error.digest });
  }, [error]);

  return (
    <div style={{ minHeight: '70vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '40px 20px' }}>
      <div style={{ fontSize: 22, fontWeight: 800, color: '#111', marginBottom: 10 }}>Something went wrong</div>
      <div style={{ fontSize: 14, color: '#777', maxWidth: 440, marginBottom: 24 }}>
        An unexpected error occurred. You can try again, or head back to the marketplace.
      </div>
      <div style={{ display: 'flex', gap: 12 }}>
        <button
          onClick={reset}
          style={{ background: '#111', color: '#fff', border: 'none', borderRadius: 999, padding: '10px 24px', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
        >
          Try again
        </button>
        <a
          href="/listings"
          style={{ background: '#fff', color: '#111', border: '1px solid #ddd', borderRadius: 999, padding: '10px 24px', fontSize: 14, fontWeight: 600, textDecoration: 'none' }}
        >
          Back to listings
        </a>
      </div>
    </div>
  );
}
