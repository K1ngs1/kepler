'use client';

import Link from 'next/link';

interface Listing {
  id: string;
  title: string;
  price_min: number | null;
  price_max: number | null;
  cover_photo_url: string | null;
  seller: { username: string | null; reputation_score: number | null } | null;
  item_count: number;
}

interface Props {
  listing: Listing;
}

function StarDisplay({ score }: { score: number | null }) {
  if (!score || score === 0) return null;
  return (
    <span style={{ fontSize: 11, color: '#888', display: 'inline-flex', alignItems: 'center', gap: 2 }}>
      {'★'.repeat(Math.round(score))}{'☆'.repeat(5 - Math.round(score))}
      <span style={{ marginLeft: 2 }}>{score}</span>
    </span>
  );
}

export default function ListingCard({ listing }: Props) {
  return (
    <Link href={`/listings/${listing.id}`} style={{ textDecoration: 'none' }}>
      <div className="lot-card">
        <div className="lot-card-img">
          {listing.cover_photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={listing.cover_photo_url}
              alt={listing.title}
              loading="lazy"
              style={{ maxHeight: 175, maxWidth: '88%', objectFit: 'contain' }}
            />
          ) : (
            <div style={{ color: '#ccc', fontSize: 12, textAlign: 'center', padding: '0 8px' }}>
              No photo
            </div>
          )}
        </div>
        <div className="lot-body">
          <div className="lot-num" style={{ fontSize: 11, color: '#888' }}>
            {listing.item_count} card{listing.item_count !== 1 ? 's' : ''}
          </div>
          <div className="lot-title" style={{ fontSize: 14, fontWeight: 600, color: '#111', marginBottom: 4 }}>
            {listing.title}
          </div>
          <div style={{ fontSize: 12, color: '#777', marginBottom: 4 }}>
            Seller: <span style={{ fontWeight: 600, color: '#333' }}>{listing.seller?.username ?? 'Anonymous'}</span>
          </div>
          {listing.seller?.reputation_score ? (
            <div style={{ marginBottom: 6 }}>
              <StarDisplay score={listing.seller.reputation_score} />
            </div>
          ) : null}
          <div style={{ marginTop: 'auto', paddingTop: 10 }}>
            {listing.price_min != null || listing.price_max != null ? (
              <div style={{ fontSize: 13, fontWeight: 600, color: '#111' }}>
                {listing.price_min != null && listing.price_max != null
                  ? listing.price_min === listing.price_max
                    ? `$${listing.price_min.toFixed(2)}`
                    : `$${listing.price_min.toFixed(2)} - $${listing.price_max.toFixed(2)}`
                  : listing.price_min != null
                  ? `From $${listing.price_min.toFixed(2)}`
                  : `Up to $${listing.price_max?.toFixed(2)}`}
              </div>
            ) : (
              <div style={{ fontSize: 13, color: '#888' }}>Open to offers</div>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
