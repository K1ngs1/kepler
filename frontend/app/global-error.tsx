'use client';

import { useEffect } from 'react';
import { handleError } from '@/lib/error-handler';

/**
 * Last-resort boundary for errors thrown by the root layout itself. It must
 * render its own <html>/<body> because it replaces the whole document.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    handleError(error, { where: 'global.error', digest: error.digest });
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '40px 20px' }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#111', marginBottom: 10 }}>Something went wrong</div>
          <div style={{ fontSize: 14, color: '#777', maxWidth: 440, marginBottom: 24 }}>
            The application hit an unexpected error. Please try again.
          </div>
          <button
            onClick={reset}
            style={{ background: '#111', color: '#fff', border: 'none', borderRadius: 999, padding: '10px 24px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
