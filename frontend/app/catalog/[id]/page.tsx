import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import CatalogDetailClient from './CatalogDetailClient';

export default async function CatalogDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: card, error } = await supabase
    .from('catalog_cards')
    .select('*')
    .eq('id', params.id)
    .single();

  if (error || !card) notFound();

  return (
    <>
      <Nav />
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 20px' }}>
        <a href="/catalog" style={{ fontSize: 12.5, color: '#777', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 24 }}>
          ← Back to Catalog
        </a>
        <div style={{ display: 'flex', gap: 48, alignItems: 'flex-start' }}>
          {/* Image */}
          <div style={{ flexShrink: 0, width: 260 }}>
            <div className="detail-main-img-box" style={{ height: 360 }}>
              {card.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={card.image_url} alt={card.name} style={{ maxHeight: 330, maxWidth: '92%', objectFit: 'contain' }} />
              ) : (
                <div style={{ color: '#ccc', fontSize: 13 }}>No image</div>
              )}
            </div>
          </div>
          {/* Info */}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: '#999', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8 }}>
              {card.set_name} · #{card.number}
            </div>
            <h1 style={{ fontSize: 28, fontWeight: 700, color: '#111', marginBottom: 10, fontFamily: 'var(--font-baskerville), serif' }}>
              {card.name}
            </h1>
            {card.rarity && (
              <div className="catalog-card-rarity" style={{ marginBottom: 20, fontSize: 12 }}>
                {card.rarity}
              </div>
            )}
            <table className="bid-table" style={{ marginBottom: 24 }}>
              <tbody>
                <tr>
                  <td>Set</td>
                  <td style={{ textAlign: 'left', fontWeight: 500 }}>{card.set_name}</td>
                </tr>
                <tr>
                  <td>Set Code</td>
                  <td style={{ textAlign: 'left', fontWeight: 500 }}>{card.set_code}</td>
                </tr>
                <tr>
                  <td>Number</td>
                  <td style={{ textAlign: 'left', fontWeight: 500 }}>#{card.number}</td>
                </tr>
                {card.rarity && (
                  <tr>
                    <td>Rarity</td>
                    <td style={{ textAlign: 'left', fontWeight: 500 }}>{card.rarity}</td>
                  </tr>
                )}
              </tbody>
            </table>
            <CatalogDetailClient card={card} />
          </div>
        </div>
      </div>
      <Footer />
    </>
  );
}
