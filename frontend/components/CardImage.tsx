'use client';

import { useState } from 'react';

interface Props {
  officialUrl: string | null;
  photoUrl: string | null;
  alt: string;
  maxHeight?: number;
  maxWidth?: string;
}

export default function CardImage({ officialUrl, photoUrl, alt, maxHeight = 130, maxWidth = '90%' }: Props) {
  const [showOfficial, setShowOfficial] = useState(false);
  const displayUrl = photoUrl && !showOfficial ? photoUrl : officialUrl;
  const hasToggle = photoUrl && officialUrl;

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {displayUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={displayUrl}
          alt={alt}
          loading="lazy"
          style={{ maxHeight, maxWidth, objectFit: 'contain' }}
        />
      ) : (
        <div style={{ color: '#ccc', fontSize: 11 }}>No image</div>
      )}
      {hasToggle && (
        <button
          onClick={(e) => { e.stopPropagation(); setShowOfficial(!showOfficial); }}
          title={showOfficial ? 'Show your photo' : 'Show official art'}
          style={{
            position: 'absolute',
            bottom: 4,
            right: 4,
            background: 'rgba(255,255,255,0.9)',
            border: 'none',
            borderRadius: '50%',
            width: 22,
            height: 22,
            fontSize: 11,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: '#555',
            boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
            lineHeight: 1,
            padding: 0,
          }}
        >
          {showOfficial ? '📷' : '🎴'}
        </button>
      )}
    </div>
  );
}
