'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

interface ForTradeCard {
  id: string;
  condition: string;
  user_id: string;
  catalog_cards: {
    id: string;
    name: string;
    set_name: string;
    number: string;
    rarity: string | null;
    image_url: string | null;
  };
  profiles: { username: string | null } | null;
}

interface Props {
  initial: ForTradeCard[];
}

export default function ForTradeSection({ initial }: Props) {
  const [cards, setCards] = useState<ForTradeCard[]>(initial);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) return;

    const reload = async () => {
      const { data } = await supabase
        .from('user_cards')
        .select('id, condition, user_id, catalog_cards(id, name, set_name, number, rarity, image_url), profiles(username)')
        .eq('for_trade', true)
        .order('created_at', { ascending: false })
        .limit(6);
      if (data) setCards(data as ForTradeCard[]);
    };

    const channel = supabase
      .channel('homepage-for-trade')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_cards' }, reload)
      .subscribe();

    return () => { channel.unsubscribe(); };
  }, []);

  if (cards.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 0', color: '#aaa', fontSize: 13 }}>
        No cards listed for trade yet.{' '}
        <a href="/collection" style={{ color: '#111', fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: 2 }}>Add yours →</a>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
      {cards.map((uc) => (
        <div key={uc.id} className="lot-card" style={{ height: 'auto' }}>
          {/* Card image */}
          <div className="lot-card-img" style={{ height: 210, position: 'relative' }}>
            <span style={{
              position: 'absolute', top: 8, left: 8, background: '#3db56c', color: '#fff',
              fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 3, letterSpacing: '0.3px', zIndex: 1,
            }}>
              For Trade
            </span>
            {uc.catalog_cards.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={uc.catalog_cards.image_url}
                alt={uc.catalog_cards.name}
                loading="lazy"
                style={{ maxHeight: 190, maxWidth: '88%', objectFit: 'contain' }}
              />
            ) : (
              <div style={{ color: '#ccc', fontSize: 12 }}>No image</div>
            )}
          </div>

          {/* Card info */}
          <div style={{ padding: '12px 14px', flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#111', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {uc.catalog_cards.name}
            </div>
            <div style={{ fontSize: 11.5, color: '#888' }}>
              {uc.catalog_cards.set_name} · #{uc.catalog_cards.number}
            </div>
            {uc.catalog_cards.rarity && (
              <div className="catalog-card-rarity">{uc.catalog_cards.rarity}</div>
            )}
            <div style={{ fontSize: 12, color: '#555', marginTop: 2 }}>
              Condition: <span style={{ fontWeight: 600, color: '#111' }}>{uc.condition}</span>
            </div>
            <div style={{ fontSize: 12, color: '#777' }}>
              Owner: <span style={{ fontWeight: 600, color: '#111' }}>{uc.profiles?.username ?? 'Anonymous'}</span>
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ padding: '0 14px 14px', display: 'flex', gap: 8 }}>
            <a
              href={`/auctions/${uc.id}`}
              style={{ flex: 1, padding: '8px 0', background: '#111', color: '#fff', border: '1.5px solid #111', borderRadius: 4, fontSize: 12.5, fontWeight: 600, textAlign: 'center', textDecoration: 'none', display: 'block' }}
            >
              View Listing
            </a>
            <a
              href={`/trades/new?with=${uc.user_id}`}
              style={{ flex: 1, padding: '8px 0', background: '#fff', color: '#111', border: '1.5px solid #111', borderRadius: 4, fontSize: 12.5, fontWeight: 600, textAlign: 'center', textDecoration: 'none', display: 'block' }}
            >
              Propose Trade
            </a>
          </div>
        </div>
      ))}
    </div>
  );
}
