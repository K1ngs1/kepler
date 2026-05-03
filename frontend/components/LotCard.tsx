'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Slab from './Slab';
import Image from 'next/image';
import { Lot } from '@/lib/types';

interface Props {
  lot: Lot;
}

export default function LotCard({ lot }: Props) {
  const [starred, setStarred] = useState(false);
  const router = useRouter();

  return (
    <div className="lot-card" onClick={() => router.push(`/auctions/${lot.id}`)}>
      <div className="lot-card-img">
        {lot.image_url ? (
          <Image src={lot.image_url} alt={lot.title} width={150} height={175} style={{ objectFit: 'contain' }} />
        ) : (
          <Slab grade={lot.grade} label={lot.gradeLabel} set={lot.set} scale={0.95} />
        )}
        <button
          className={`lot-star${starred ? ' active' : ''}`}
          onClick={(e) => { e.stopPropagation(); setStarred((v) => !v); }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill={starred ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
          </svg>
        </button>
      </div>
      <div className="lot-body">
        <div className="lot-num">Lot #{lot.id}</div>
        <div className="lot-title">{lot.title}</div>
        <div className="lot-price-row">
          <div className="lot-price">${lot.price.toLocaleString()}</div>
          <div className="lot-bids-txt">{lot.bids} bids</div>
        </div>
        <div className="lot-time-row">
          <div className="lot-time">{lot.timer}</div>
          <button className="lot-bid-hist" onClick={(e) => e.stopPropagation()}>Show bid history</button>
        </div>
        <div style={{ display: 'flex', gap: '8px', marginTop: 'auto' }}>
          <button
            className="lot-bid-btn"
            style={{ flex: 1 }}
            onClick={(e) => { e.stopPropagation(); router.push(`/auctions/${lot.id}`); }}
          >Trade</button>
          <button
            className="lot-bid-btn"
            style={{ flex: 1, background: '#111', color: '#fff', borderColor: '#111' }}
            onClick={(e) => { e.stopPropagation(); router.push(`/auctions/${lot.id}`); }}
          >Buy Now</button>
        </div>
      </div>
    </div>
  );
}
