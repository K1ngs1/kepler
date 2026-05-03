import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import { createClient } from '@/lib/supabase/server';
import CatalogClient, { type CatalogCard } from './CatalogClient';

export const revalidate = 3600;

export default async function CatalogPage() {
  let cards: CatalogCard[] = [];

  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('catalog_cards')
      .select('id, tcgdex_id, name, set_name, set_code, number, rarity, image_url')
      .order('set_code', { ascending: true })
      .order('name', { ascending: true })
      .limit(1000);

    if (!error && data) {
      cards = data as CatalogCard[];
    }
  } catch {
    // Supabase not configured — will show empty state
  }

  return (
    <>
      <Nav />
      <div className="listing-main" style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 20px' }}>
        <CatalogClient cards={cards} />
      </div>
      <Footer />
    </>
  );
}
