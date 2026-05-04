import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';

interface TradeCard {
  id: string;
  condition: string;
  quantity: number;
  photo_url: string | null;
  catalog_cards: {
    name: string;
    set_name: string;
    number: string;
    rarity: string | null;
    image_url: string | null;
  };
}

export default async function BinderPage({ params }: { params: { username: string } }) {
  const supabase = createClient();

  // Find the user profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, username, reputation_score')
    .eq('username', decodeURIComponent(params.username))
    .single();

  if (!profile) notFound();

  // Get their tradeable cards
  const { data } = await supabase
    .from('user_cards')
    .select('id, condition, quantity, photo_url, catalog_cards(name, set_name, number, rarity, image_url)')
    .eq('user_id', profile.id)
    .eq('for_trade', true)
    .order('created_at', { ascending: false });

  const cards = ((data as TradeCard[]) ?? []).filter((c) => c.catalog_cards != null);

  const repStars = profile.reputation_score
    ? '★'.repeat(Math.round(profile.reputation_score)) + '☆'.repeat(5 - Math.round(profile.reputation_score))
    : '';

  return (
    <>
      <Nav />
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 20px' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            fontFamily: 'var(--font-baskerville), serif',
            fontSize: 28,
            fontWeight: 700,
            color: '#111',
            marginBottom: 4,
          }}>
            Kepler
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#111', marginBottom: 4 }}>
            {profile.username}&apos;s Trade Binder
          </div>
          {repStars && (
            <div style={{ fontSize: 14, color: '#e5a000', marginBottom: 4 }}>{repStars}</div>
          )}
          <div style={{ fontSize: 13, color: '#888' }}>
            {cards.length} card{cards.length !== 1 ? 's' : ''} available for trade
          </div>
        </div>

        {cards.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#888', fontSize: 14 }}>
            No cards currently available for trade.
          </div>
        ) : (
          <div className="collection-grid">
            {cards.map((card) => (
              <div key={card.id} className="collection-card">
                <div className="collection-card-img">
                  {(card.photo_url || card.catalog_cards.image_url) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={card.photo_url || card.catalog_cards.image_url!}
                      alt={card.catalog_cards.name}
                      loading="lazy"
                      style={{ maxHeight: 130, maxWidth: '90%', objectFit: 'contain' }}
                    />
                  ) : (
                    <div style={{ color: '#ccc', fontSize: 11 }}>No image</div>
                  )}
                </div>
                <div className="collection-card-body">
                  <div className="collection-card-name">{card.catalog_cards.name}</div>
                  <div className="collection-card-set">
                    {card.catalog_cards.set_name} · #{card.catalog_cards.number}
                  </div>
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>
                    {card.condition}{card.quantity > 1 ? ` · Qty ${card.quantity}` : ''}
                  </div>
                  {card.catalog_cards.rarity && (
                    <div className="catalog-card-rarity">{card.catalog_cards.rarity}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={{ textAlign: 'center', marginTop: 32, color: '#aaa', fontSize: 12 }}>
          Shared from <a href="/" style={{ color: '#111', fontWeight: 600 }}>Kepler</a> — The premier Pokémon card trading platform
        </div>
      </div>
      <Footer />
    </>
  );
}
