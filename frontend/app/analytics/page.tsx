import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import { createClient } from '@/lib/supabase/server';

export const revalidate = 300; // revalidate every 5 minutes

interface CardStat {
  catalog_card_id: string;
  count: number;
  card: {
    name: string;
    set_name: string;
    number: string;
    image_url: string | null;
  } | null;
}

export default async function AnalyticsPage() {
  const supabase = createClient();

  // Platform summary stats
  const [
    { count: activeTraders },
    { count: completedTrades },
    { count: forTradeCount },
    { data: priceLastUpdated },
  ] = await Promise.all([
    supabase.from('profiles').select('id', { count: 'exact', head: true }),
    supabase.from('trade_offers').select('id', { count: 'exact', head: true }).eq('status', 'completed'),
    supabase.from('user_cards').select('id', { count: 'exact', head: true }).eq('for_trade', true),
    supabase.from('card_prices').select('updated_at').order('updated_at', { ascending: false }).limit(1),
  ]);

  // Most Wanted Cards — top 20 cards where wanted=true
  const { data: wantedRaw } = await supabase
    .from('user_cards')
    .select('catalog_card_id')
    .eq('wanted', true);

  const wantedCounts: Record<string, number> = {};
  (wantedRaw ?? []).forEach((r: any) => {
    wantedCounts[r.catalog_card_id] = (wantedCounts[r.catalog_card_id] ?? 0) + 1;
  });

  const topWantedIds = Object.entries(wantedCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);

  let mostWanted: CardStat[] = [];
  if (topWantedIds.length > 0) {
    const ids = topWantedIds.map(([id]) => id);
    const { data: cards } = await supabase
      .from('catalog_cards')
      .select('id, name, set_name, number, image_url')
      .in('id', ids);

    const cardMap: Record<string, any> = {};
    (cards ?? []).forEach((c: any) => { cardMap[c.id] = c; });

    mostWanted = topWantedIds.map(([id, count]) => ({
      catalog_card_id: id,
      count,
      card: cardMap[id] ?? null,
    }));
  }

  // Most Traded Cards — top 20 from completed trade_items
  const { data: completedTradeIds } = await supabase
    .from('trade_offers')
    .select('id')
    .eq('status', 'completed');

  let mostTraded: CardStat[] = [];
  if (completedTradeIds && completedTradeIds.length > 0) {
    const tradeIds = completedTradeIds.map((t: any) => t.id);
    const { data: tradeItems } = await supabase
      .from('trade_items')
      .select('user_card_id, user_cards(catalog_card_id)')
      .in('trade_id', tradeIds);

    const tradedCounts: Record<string, number> = {};
    (tradeItems ?? []).forEach((item: any) => {
      const catalogId = item.user_cards?.catalog_card_id;
      if (catalogId) tradedCounts[catalogId] = (tradedCounts[catalogId] ?? 0) + 1;
    });

    const topTradedIds = Object.entries(tradedCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20);

    if (topTradedIds.length > 0) {
      const ids = topTradedIds.map(([id]) => id);
      const { data: cards } = await supabase
        .from('catalog_cards')
        .select('id, name, set_name, number, image_url')
        .in('id', ids);

      const cardMap: Record<string, any> = {};
      (cards ?? []).forEach((c: any) => { cardMap[c.id] = c; });

      mostTraded = topTradedIds.map(([id, count]) => ({
        catalog_card_id: id,
        count,
        card: cardMap[id] ?? null,
      }));
    }
  }

  return (
    <>
      <Nav />
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 20px' }}>
        <div className="listing-toolbar" style={{ marginBottom: 24 }}>
          <div className="listing-title">Platform Analytics</div>
        </div>

        {/* Summary stats */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 40,
        }}>
          <div style={{
            border: '1px solid #e5e5e5', borderRadius: 4, padding: '20px 24px', textAlign: 'center',
          }}>
            <div style={{ fontSize: 32, fontWeight: 700, color: '#111' }}>{activeTraders ?? 0}</div>
            <div style={{ fontSize: 13, color: '#888', marginTop: 4 }}>Active Traders</div>
          </div>
          <div style={{
            border: '1px solid #e5e5e5', borderRadius: 4, padding: '20px 24px', textAlign: 'center',
          }}>
            <div style={{ fontSize: 32, fontWeight: 700, color: '#111' }}>{completedTrades ?? 0}</div>
            <div style={{ fontSize: 13, color: '#888', marginTop: 4 }}>Completed Trades</div>
          </div>
          <div style={{
            border: '1px solid #e5e5e5', borderRadius: 4, padding: '20px 24px', textAlign: 'center',
          }}>
            <div style={{ fontSize: 32, fontWeight: 700, color: '#111' }}>{forTradeCount ?? 0}</div>
            <div style={{ fontSize: 13, color: '#888', marginTop: 4 }}>Cards Up for Trade</div>
          </div>
        </div>

        {/* Price data freshness badge */}
        <div style={{
          fontSize: 12.5, color: '#888', marginBottom: 32,
          padding: '10px 16px', border: '1px solid #e5e5e5', borderRadius: 4,
          display: 'inline-block',
        }}>
          {priceLastUpdated && priceLastUpdated.length > 0 ? (
            <>
              Price data last updated:{' '}
              <strong style={{ color: '#111' }}>
                {new Date(priceLastUpdated[0].updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </strong>
            </>
          ) : (
            <span style={{ color: '#c0392b' }}>
              Price data not seeded — run <code style={{ background: '#f5f5f5', padding: '2px 6px', borderRadius: 3, fontSize: 11.5 }}>scripts/seed-prices.mjs</code>
            </span>
          )}
        </div>

        {/* Most Wanted Cards */}
        <div style={{ marginBottom: 40 }}>
          <div className="section-hd" style={{ marginBottom: 16 }}>
            <div className="section-hd-title">Most Wanted Cards</div>
          </div>
          {mostWanted.length === 0 ? (
            <div style={{ color: '#aaa', fontSize: 13, padding: '20px 0' }}>
              No wishlist data yet. Users need to mark cards as &ldquo;Wanted&rdquo; for data to appear.
            </div>
          ) : (
            <div className="collection-grid">
              {mostWanted.map((item) => (
                <div key={item.catalog_card_id} className="collection-card">
                  <div className="collection-card-img">
                    {item.card?.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.card.image_url} alt={item.card.name} loading="lazy" style={{ maxHeight: 130, maxWidth: '90%', objectFit: 'contain' }} />
                    ) : (
                      <div style={{ color: '#ccc', fontSize: 11 }}>No image</div>
                    )}
                  </div>
                  <div className="collection-card-body">
                    <div className="collection-card-name">{item.card?.name ?? 'Unknown'}</div>
                    <div className="collection-card-set">
                      {item.card ? `${item.card.set_name} · #${item.card.number}` : '—'}
                    </div>
                    <div style={{ fontSize: 12, color: '#e5a000', fontWeight: 600, marginTop: 4 }}>
                      {item.count} user{item.count !== 1 ? 's' : ''} want this
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Most Traded Cards */}
        <div style={{ marginBottom: 40 }}>
          <div className="section-hd" style={{ marginBottom: 16 }}>
            <div className="section-hd-title">Most Traded Cards</div>
          </div>
          {mostTraded.length === 0 ? (
            <div style={{ color: '#aaa', fontSize: 13, padding: '20px 0' }}>
              No completed trades yet. Complete some trades to see data here.
            </div>
          ) : (
            <div className="collection-grid">
              {mostTraded.map((item) => (
                <div key={item.catalog_card_id} className="collection-card">
                  <div className="collection-card-img">
                    {item.card?.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.card.image_url} alt={item.card.name} loading="lazy" style={{ maxHeight: 130, maxWidth: '90%', objectFit: 'contain' }} />
                    ) : (
                      <div style={{ color: '#ccc', fontSize: 11 }}>No image</div>
                    )}
                  </div>
                  <div className="collection-card-body">
                    <div className="collection-card-name">{item.card?.name ?? 'Unknown'}</div>
                    <div className="collection-card-set">
                      {item.card ? `${item.card.set_name} · #${item.card.number}` : '—'}
                    </div>
                    <div style={{ fontSize: 12, color: '#3db56c', fontWeight: 600, marginTop: 4 }}>
                      Traded {item.count} time{item.count !== 1 ? 's' : ''}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <Footer />
    </>
  );
}
