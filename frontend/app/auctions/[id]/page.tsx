'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import { createClient } from '@/lib/supabase/client';

interface ForTradeCard {
  id: string;
  condition: string;
  quantity: number;
  user_id: string;
  catalog_cards: {
    id: string;
    name: string;
    set_name: string;
    set_code: string;
    number: string;
    rarity: string | null;
    image_url: string | null;
  };
  profiles: { username: string | null } | null;
}

export default function TradeCardDetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [card, setCard] = useState<ForTradeCard | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const supabase = createClient();
      if (!supabase) { setLoading(false); return; }

      const [{ data: { user } }, { data }] = await Promise.all([
        supabase.auth.getUser(),
        supabase
          .from('user_cards')
          .select('id, condition, quantity, user_id, catalog_cards(id, name, set_name, set_code, number, rarity, image_url), profiles(username)')
          .eq('id', id)
          .single(),
      ]);

      if (user) { setAuthed(true); setCurrentUserId(user.id); }
      if (data) setCard(data as unknown as ForTradeCard);
      setLoading(false);
    })();
  }, [id]);

  const isOwn = card?.user_id === currentUserId;

  if (loading) return (
    <>
      <Nav />
      <div style={{ textAlign: 'center', padding: '80px 0', color: '#aaa', fontSize: 13 }}>Loading…</div>
      <Footer />
    </>
  );

  if (!card) return (
    <>
      <Nav />
      <div style={{ textAlign: 'center', padding: '80px 0', color: '#888' }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Card not found</div>
        <button onClick={() => router.push('/auctions')} style={{ background: '#111', color: '#fff', border: 'none', borderRadius: 5, padding: '9px 22px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          ← Back to Cards for Trade
        </button>
      </div>
      <Footer />
    </>
  );

  const cc = card.catalog_cards;

  return (
    <>
      <Nav />
      <div className="detail-breadcrumb">
        <button onClick={() => router.push('/')}>Home</button>
        <span>/</span>
        <button onClick={() => router.push('/auctions')}>Cards for Trade</button>
        <span>/</span>
        <span>{cc.name}</span>
      </div>

      <div className="detail-title-bar">
        <div className="detail-title">{cc.name} — {cc.set_name} #{cc.number} · {card.condition}</div>
      </div>

      <div className="detail-body">
        <div className="detail-img-col">
          <div className="detail-main-img-box" style={{ background: '#f8f8f8', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 320 }}>
            {cc.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={cc.image_url} alt={cc.name} style={{ maxHeight: 340, maxWidth: '90%', objectFit: 'contain' }} />
            ) : (
              <div style={{ color: '#ccc', fontSize: 13, textAlign: 'center', padding: '40px 20px' }}>No image available</div>
            )}
          </div>
        </div>

        <div className="detail-bid-col">
          <table className="bid-table">
            <tbody>
              <tr>
                <td>Card:</td>
                <td>
                  <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>{cc.name}</div>
                  <div style={{ fontSize: 13, color: '#555' }}>{cc.set_name} · #{cc.number}</div>
                </td>
              </tr>
              <tr>
                <td>Condition:</td>
                <td><div style={{ fontWeight: 600, fontSize: 15 }}>{card.condition}</div></td>
              </tr>
              {cc.rarity && (
                <tr>
                  <td>Rarity:</td>
                  <td><div className="catalog-card-rarity" style={{ display: 'inline-block' }}>{cc.rarity}</div></td>
                </tr>
              )}
              <tr>
                <td>Owner:</td>
                <td><div style={{ fontWeight: 600 }}>{card.profiles?.username ?? 'Anonymous'}</div></td>
              </tr>
              {card.quantity > 1 && (
                <tr>
                  <td>Quantity:</td>
                  <td>{card.quantity}</td>
                </tr>
              )}
            </tbody>
          </table>

          <div style={{ marginTop: 20 }}>
            {isOwn ? (
              <div style={{ display: 'flex', gap: 8, flexDirection: 'column' }}>
                <div style={{ fontSize: 13, color: '#555', padding: '10px 0' }}>This is your card.</div>
                <a href="/listings" className="btn-place-bid" style={{ textAlign: 'center', textDecoration: 'none' }}>
                  View Listings
                </a>
              </div>
            ) : authed ? (
              <div style={{ display: 'flex', gap: 8 }}>
                <a
                  href="/listings"
                  className="btn-place-bid"
                  style={{ flex: 1, textAlign: 'center', textDecoration: 'none' }}
                >
                  Browse Listings
                </a>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 8, flexDirection: 'column' }}>
                <div style={{ fontSize: 13, color: '#888', marginBottom: 8 }}>Sign in to propose a trade for this card.</div>
                <a href="/" className="btn-place-bid" style={{ textAlign: 'center', textDecoration: 'none' }}>
                  Login to Trade
                </a>
              </div>
            )}
            <button className="btn-watchlist" style={{ width: '100%', marginTop: 8 }} onClick={() => router.push('/auctions')}>
              ← Back to Cards for Trade
            </button>
          </div>

          <div className="detail-section">
            <div className="detail-section-title">About Card-for-Card Trading:</div>
            <div className="detail-section-text">
              Kepler trades are peer-to-peer — no money changes hands. You propose which cards
              from your collection you&apos;ll offer in exchange, and the other user accepts, counters, or declines.
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </>
  );
}
