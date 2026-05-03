'use client';

import { useRouter } from 'next/navigation';
import { Auction } from '@/lib/types';

interface Props {
  auction: Auction;
}

export default function AuctionCard({ auction }: Props) {
  const router = useRouter();
  return (
    <div className="auction-card" onClick={() => router.push('/auctions')}>
      <div className="auction-card-bg" style={{ background: auction.bg }} />
      <div className="auction-card-overlay" />
      {auction.live && <div className="auction-card-live">Live</div>}
      <div className="auction-card-info">
        <div className="auction-card-title">{auction.title}</div>
        <div className="auction-card-sub">{auction.sub}</div>
      </div>
    </div>
  );
}
