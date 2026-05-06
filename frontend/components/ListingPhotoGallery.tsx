'use client';

import { useState } from 'react';

interface Props {
  photos: string[];
}

export default function ListingPhotoGallery({ photos }: Props) {
  const [currentIndex, setCurrentIndex] = useState(0);

  if (!photos || photos.length === 0) {
    return (
      <div className="detail-img-col">
        <div className="detail-main-img-box">
          <div style={{ color: '#aaa', fontSize: 13 }}>No photos available</div>
        </div>
      </div>
    );
  }

  const currentPhoto = photos[currentIndex];

  return (
    <div className="detail-img-col">
      <div className="detail-main-img-box">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={currentPhoto} alt={`Photo ${currentIndex + 1}`} loading="lazy" />
        
        {photos.length > 1 && (
          <>
            <button
              className="detail-img-arrow left"
              onClick={() => setCurrentIndex((i) => (i === 0 ? photos.length - 1 : i - 1))}
            >
              ‹
            </button>
            <button
              className="detail-img-arrow right"
              onClick={() => setCurrentIndex((i) => (i === photos.length - 1 ? 0 : i + 1))}
            >
              ›
            </button>
          </>
        )}
      </div>

      {photos.length > 1 && (
        <div className="detail-thumbs" style={{ flexWrap: 'wrap' }}>
          {photos.map((photo, i) => (
            <button
              key={i}
              className={`detail-thumb ${i === currentIndex ? 'on' : ''}`}
              onClick={() => setCurrentIndex(i)}
              style={{ padding: 0 }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo} alt={`Thumbnail ${i + 1}`} loading="lazy" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
