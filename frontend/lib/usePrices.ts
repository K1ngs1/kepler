'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

/** Map of catalog_card_id → market_price */
export function usePrices(catalogCardIds: string[]): Record<string, number> {
  const [prices, setPrices] = useState<Record<string, number>>({});

  useEffect(() => {
    if (catalogCardIds.length === 0) return;
    const supabase = createClient();
    if (!supabase) return;

    const uniqueIds = [...new Set(catalogCardIds)];

    supabase
      .from('card_prices')
      .select('catalog_card_id, market_price')
      .in('catalog_card_id', uniqueIds)
      .then(({ data }) => {
        if (data) {
          const map: Record<string, number> = {};
          data.forEach((row: any) => { map[row.catalog_card_id] = Number(row.market_price); });
          setPrices(map);
        }
      });
  }, [catalogCardIds.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  return prices;
}
