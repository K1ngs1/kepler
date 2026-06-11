'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Listing {
  id: string;
  title: string;
  price_min: number | null;
  price_max: number | null;
  cover_photo_url: string | null;
  seller: { username: string | null; reputation_score: number | null } | null;
  item_count: number;
  grade?: string | null;
}

interface Props {
  listing: Listing;
}

function formatPrice(listing: Listing): string {
  const { price_min, price_max } = listing;
  if (price_min == null && price_max == null) return '';
  if (price_min != null && price_max != null) {
    return price_min === price_max
      ? `$${price_min.toFixed(2)}`
      : `$${price_min.toFixed(2)} – $${price_max.toFixed(2)}`;
  }
  if (price_min != null) return `From $${price_min.toFixed(2)}`;
  return `Up to $${price_max!.toFixed(2)}`;
}

export default function ListingCard({ listing }: Props) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const router = useRouter();

  const priceLabel = formatPrice(listing);
  const ariaLabel = [
    listing.title,
    listing.grade ? `Grade: ${listing.grade}` : null,
    priceLabel ? priceLabel : 'Open to offers',
    listing.seller?.username ? `Seller: ${listing.seller.username}` : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <Link
      href={`/listings/${listing.id}`}
      className="listing-card"
      aria-label={ariaLabel}
      prefetch={false}
      onMouseEnter={() => router.prefetch(`/listings/${listing.id}`)}
    >
      <div className="listing-card__img">
        {listing.cover_photo_url ? (
          <>
            {!imgLoaded && (
              <div className="listing-card__skeleton" aria-hidden="true" />
            )}
            <Image
              src={listing.cover_photo_url}
              alt={listing.title}
              width={300}
              height={420}
              loading="lazy"
              onLoad={() => setImgLoaded(true)}
              style={{
                opacity: imgLoaded ? 1 : 0,
                transition: 'opacity 0.2s',
                width: '100%',
                height: '100%',
                objectFit: 'contain',
              }}
            />
          </>
        ) : (
          <div className="listing-card__no-photo" aria-label="No photo available">
            No photo
          </div>
        )}
        {/* TODO: wire favorite state when user accounts support it */}
        <button
          className="listing-card__fav"
          aria-label="Save listing"
          onClick={(e) => e.preventDefault()}
        >
          ☆
        </button>
      </div>

      <div className="listing-card__body">
        <div className="listing-card__count">
          {listing.item_count} card{listing.item_count !== 1 ? 's' : ''}
        </div>

        <h3 className="listing-card__title">{listing.title}</h3>

        {listing.grade && (
          <span className="listing-card__grade" aria-label={`Grade: ${listing.grade}`}>
            {listing.grade}
          </span>
        )}

        <div className="listing-card__seller">
          <span className="listing-card__seller-name">
            {listing.seller?.username ?? 'Anonymous'}
          </span>
        </div>

        {priceLabel ? (
          <div className="listing-card__price">{priceLabel}</div>
        ) : (
          <div className="listing-card__price--open">Open to offers</div>
        )}

        <button
          className="listing-card__btn"
          aria-label={`View listing: ${listing.title}`}
          tabIndex={-1}
        >
          View Listing
        </button>
      </div>
    </Link>
  );
}
