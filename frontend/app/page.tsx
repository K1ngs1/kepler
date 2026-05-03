import Hero, { type HeroSlide } from '@/components/Hero';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import ForTradeSection from '@/components/ForTradeSection';
import { createClient } from '@/lib/supabase/server';

export const revalidate = 60;

interface CatalogCard {
  id: string;
  name: string;
  set_name: string;
  number: string;
  rarity: string | null;
  image_url: string | null;
}

interface ForTradeCard {
  id: string;
  condition: string;
  user_id: string;
  catalog_cards: CatalogCard;
  profiles: { username: string | null } | null;
}

interface CompletedTrade {
  id: string;
  updated_at: string;
  initiator: { username: string | null } | null;
  recipient: { username: string | null } | null;
}

const GRADIENTS = [
  'linear-gradient(135deg,#1a0a2e 0%,#2d1a4a 40%,#3d2860 100%)',
  'linear-gradient(135deg,#0f1a30 0%,#1a2e50 40%,#253a60 100%)',
  'linear-gradient(135deg,#1a1a0a 0%,#2e2d1a 40%,#3a3820 100%)',
];

function cardToSlide(card: CatalogCard, index: number): HeroSlide {
  const words = card.name.toUpperCase().split(' ');
  const big = words[0] ?? card.name.toUpperCase();
  const big2 = words.slice(1).join(' ') || 'CARD';
  return {
    eyebrow: card.set_name,
    big,
    big2,
    boxed: card.rarity ?? `#${card.number}`,
    meta1: `Card #${card.number}`,
    meta2: 'In Catalog',
    cta: 'View Card',
    ctaHref: `/catalog/${card.id}`,
    bg: GRADIENTS[index % GRADIENTS.length],
    imageUrl: card.image_url ?? undefined,
  };
}

export default async function HomePage() {
  let heroSlides: HeroSlide[] = [];
  let forTradeCards: ForTradeCard[] = [];
  let completedTrades: CompletedTrade[] = [];
  let catalogCount = 0;

  try {
    const supabase = createClient();

    const [heroRes, countRes, tradeableRes, tradesRes] = await Promise.all([
      supabase
        .from('catalog_cards')
        .select('id, name, set_name, number, rarity, image_url')
        .not('image_url', 'is', null)
        .order('created_at', { ascending: false })
        .limit(3),
      supabase
        .from('catalog_cards')
        .select('id', { count: 'exact', head: true }),
      supabase
        .from('user_cards')
        .select('id, condition, user_id, catalog_cards(id, name, set_name, number, rarity, image_url), profiles(username)')
        .eq('for_trade', true)
        .order('created_at', { ascending: false })
        .limit(6),
      supabase
        .from('trade_offers')
        .select('id, updated_at, initiator:profiles!trade_offers_initiator_id_fkey(username), recipient:profiles!trade_offers_recipient_id_fkey(username)')
        .eq('status', 'completed')
        .order('updated_at', { ascending: false })
        .limit(5),
    ]);

    if (heroRes.data && heroRes.data.length > 0) {
      heroSlides = (heroRes.data as CatalogCard[]).map(cardToSlide);
    }
    if (countRes.count) catalogCount = countRes.count;
    if (tradeableRes.data) forTradeCards = tradeableRes.data as ForTradeCard[];
    if (tradesRes.data) completedTrades = tradesRes.data as CompletedTrade[];
  } catch {
    // Supabase not configured — show fallback hero + empty states
  }

  const fmtDate = (s: string) =>
    new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <>
      <Nav />
      <Hero slides={heroSlides.length > 0 ? heroSlides : undefined} />

      {/* Catalog stats bar */}
      {catalogCount > 0 && (
        <div style={{ background: '#f8f8f8', borderBottom: '1px solid #e5e5e5', padding: '10px 24px', textAlign: 'center', fontSize: 13, color: '#555' }}>
          <strong style={{ color: '#111' }}>{catalogCount.toLocaleString()}</strong> cards in the catalog ·{' '}
          <a href="/catalog" style={{ color: '#111', fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: 2 }}>Browse all →</a>
        </div>
      )}

      {/* Cards Available for Trade — realtime client component */}
      <div className="section">
        <div className="section-hd">
          <div className="section-hd-title">Cards Available for Trade</div>
          <a href="/auctions" className="section-hd-link">View All Listings</a>
        </div>
        <ForTradeSection initial={forTradeCards} />
      </div>

      {/* Recent Completed Trades */}
      {completedTrades.length > 0 && (
        <div className="section">
          <div className="section-hd">
            <div className="section-hd-title">Recent Completed Trades</div>
            <a href="/trades" className="section-hd-link">View All Trades</a>
          </div>
          <table className="trades-table">
            <thead>
              <tr>
                <th>Initiator</th>
                <th>Recipient</th>
                <th>Completed</th>
              </tr>
            </thead>
            <tbody>
              {completedTrades.map((trade) => (
                <tr key={trade.id}>
                  <td style={{ fontWeight: 600 }}>{trade.initiator?.username ?? 'Anonymous'}</td>
                  <td style={{ fontWeight: 600 }}>{trade.recipient?.username ?? 'Anonymous'}</td>
                  <td style={{ color: '#999' }}>{fmtDate(trade.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Footer />
    </>
  );
}
