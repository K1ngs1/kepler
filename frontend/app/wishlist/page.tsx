'use client';

import { useState, useEffect } from 'react';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import { createClient } from '@/lib/supabase/client';

interface WishCard {
  id: string;
  catalog_cards: {
    id: string;
    name: string;
    set_name: string;
    number: string;
    rarity: string | null;
    image_url: string | null;
  };
}

interface Match {
  user_id: string;
  username: string | null;
  reputation_score: number | null;
  completed_trades: number;
  card_name: string;
  card_id: string;
  user_card_id: string;
}

function StarDisplay({ score }: { score: number | null }) {
  if (!score || score === 0) return <span style={{ fontSize: 11, color: '#bbb' }}>No rating</span>;
  return (
    <span style={{ fontSize: 11, color: '#888', display: 'inline-flex', alignItems: 'center', gap: 2 }}>
      <span style={{ color: '#e5a000' }}>{'★'.repeat(Math.round(score))}</span>
      <span style={{ color: '#ddd' }}>{'★'.repeat(5 - Math.round(score))}</span>
      <span style={{ marginLeft: 3, color: '#888' }}>{score}/5</span>
    </span>
  );
}

export default function WishlistPage() {
  const [wishlist, setWishlist] = useState<WishCard[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      if (!supabase) { setLoading(false); return; }
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      setAuthed(true);

      const { data: wished } = await supabase
        .from('user_cards')
        .select('id, catalog_cards(id, name, set_name, number, rarity, image_url)')
        .eq('user_id', user.id)
        .eq('wanted', true);

      const cards = (wished as WishCard[]) ?? [];
      setWishlist(cards);

      if (cards.length > 0) {
        const catalogIds = cards.map((c) => c.catalog_cards.id);
        const { data: tradeCards } = await supabase
          .from('user_cards')
          .select('id, user_id, catalog_card_id, catalog_cards(name), profiles(username, reputation_score)')
          .in('catalog_card_id', catalogIds)
          .eq('for_trade', true)
          .neq('user_id', user.id);

        if (tradeCards) {
          const userIds = [...new Set(tradeCards.map((r: any) => r.user_id))];
          const completedCounts: Record<string, number> = {};
          for (const uid of userIds) {
            const { count } = await supabase
              .from('trade_offers')
              .select('id', { count: 'exact', head: true })
              .eq('status', 'completed')
              .or(`initiator_id.eq.${uid},recipient_id.eq.${uid}`);
            completedCounts[uid] = count ?? 0;
          }

          setMatches(tradeCards.map((r: any) => ({
            user_id: r.user_id,
            username: r.profiles?.username ?? 'Anonymous',
            reputation_score: r.profiles?.reputation_score ?? null,
            completed_trades: completedCounts[r.user_id] ?? 0,
            card_name: r.catalog_cards?.name ?? '',
            card_id: r.catalog_card_id,
            user_card_id: r.id,
          })));
        }
      }

      setLoading(false);
    })();
  }, []);

  const removeWanted = async (id: string) => {
    const supabase = createClient();
    if (!supabase) return;
    await supabase.from('user_cards').update({ wanted: false }).eq('id', id);
    setWishlist((w) => w.filter((c) => c.id !== id));
  };

  return (
    <>
      <Nav />
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 20px' }}>
        <div className="listing-toolbar">
          <div className="listing-title">Wishlist</div>
          {authed && !loading && (
            <span style={{ fontSize: 12, color: '#aaa' }}>{wishlist.length} card{wishlist.length !== 1 ? 's' : ''} wanted</span>
          )}
          <a href="/catalog" style={{ background: '#111', color: '#fff', borderRadius: 4, padding: '7px 16px', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
            + Browse Catalog
          </a>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '80px 0', color: '#aaa', fontSize: 13 }}>Loading…</div>
        ) : !authed ? (
          <div style={{ textAlign: 'center', padding: '80px 0' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#333', marginBottom: 8 }}>Sign in to see your wishlist</div>
          </div>
        ) : wishlist.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 0' }}>
            <div style={{ fontSize: 32, marginBottom: 14 }}>⭐</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#333', marginBottom: 8 }}>Your wishlist is empty</div>
            <div style={{ fontSize: 13, color: '#888', marginBottom: 24 }}>Mark cards as "Wanted" in your collection to add them here.</div>
            <a href="/collection" style={{ background: '#111', color: '#fff', borderRadius: 5, padding: '10px 24px', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>Go to Collection</a>
          </div>
        ) : (
          <>
            <div className="collection-grid">
              {wishlist.map((card) => (
                <div key={card.id} className="collection-card">
                  <div className="collection-card-img">
                    {card.catalog_cards.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={card.catalog_cards.image_url} alt={card.catalog_cards.name} loading="lazy" style={{ maxHeight: 130, maxWidth: '90%', objectFit: 'contain' }} />
                    ) : (
                      <div style={{ color: '#ccc', fontSize: 11 }}>No image</div>
                    )}
                  </div>
                  <div className="collection-card-body">
                    <div className="collection-card-name">{card.catalog_cards.name}</div>
                    <div className="collection-card-set">{card.catalog_cards.set_name} · #{card.catalog_cards.number}</div>
                    {card.catalog_cards.rarity && <div className="catalog-card-rarity" style={{ marginBottom: 8 }}>{card.catalog_cards.rarity}</div>}
                    <button onClick={() => removeWanted(card.id)} style={{ fontSize: 11.5, color: '#c0392b', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                      Remove from wishlist
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {matches.length > 0 && (
              <div style={{ marginTop: 40 }}>
                <div className="section-hd" style={{ marginBottom: 16 }}>
                  <div className="section-hd-title">Trade Matches — People offering your wanted cards</div>
                </div>
                <div className="trades-table-wrap">
                <table className="trades-table">
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Reputation</th>
                      <th>Completed Trades</th>
                      <th>Card Available</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {matches.map((m) => (
                      <tr key={m.user_card_id}>
                        <td style={{ fontWeight: 600 }}>{m.username}</td>
                        <td><StarDisplay score={m.reputation_score} /></td>
                        <td style={{ color: '#777', fontSize: 12.5 }}>{m.completed_trades} trade{m.completed_trades !== 1 ? 's' : ''}</td>
                        <td>{m.card_name}</td>
                        <td>
                          <a
                            href={`/trades/new?with=${m.user_id}`}
                            style={{ fontSize: 12, padding: '4px 12px', border: '1.5px solid #111', borderRadius: 4, background: '#111', color: '#fff', cursor: 'pointer', textDecoration: 'none', display: 'inline-block' }}
                          >
                            Propose Trade
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
      <Footer />
    </>
  );
}
