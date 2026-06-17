'use client';

import { useState, useEffect, useCallback } from 'react';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import ErrorState from '@/components/ErrorState';
import { createClient } from '@/lib/supabase/client';
import { handleError, friendlyMessage } from '@/lib/error-handler';

interface Offer {
  id: string;
  status: string;
  offer_type: string;
  created_at: string;
  updated_at: string;
  initiator_id: string;
  recipient_id: string;
  cash_amount: number | null;
  listing_id: string | null;
  initiator: { username: string | null } | null;
  recipient: { username: string | null } | null;
  listing: { title: string | null } | null;
}

const STATUS_LABELS: Record<string, string> = {
  proposed: 'Proposed', countered: 'Countered', accepted: 'Accepted',
  completed: 'Completed', cancelled: 'Cancelled', disputed: 'Disputed',
};

const STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  proposed: { bg: '#fef9e7', text: '#b7950b', border: '#f0e1a0' },
  accepted: { bg: '#eafaf1', text: '#1a8c49', border: '#a3d9b1' },
  completed: { bg: '#eafaf1', text: '#1a8c49', border: '#a3d9b1' },
  cancelled: { bg: '#f5f5f5', text: '#888', border: '#ddd' },
  disputed: { bg: '#fdf0ef', text: '#c0392b', border: '#f5c6c2' },
};

function StatusBadge({ status }: { status: string }) {
  const colors = STATUS_COLORS[status] || STATUS_COLORS.proposed;
  return (
    <span style={{
      display: 'inline-block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
      letterSpacing: 0.5, padding: '3px 10px', borderRadius: 999,
      background: colors.bg, color: colors.text, border: `1px solid ${colors.border}`,
    }}>
      {STATUS_LABELS[status] || status}
    </span>
  );
}

function TypeBadge({ type }: { type: string }) {
  return (
    <span style={{
      display: 'inline-block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
      letterSpacing: 0.5, padding: '2px 8px', borderRadius: 999,
      background: type === 'trade' ? '#f0e6ff' : '#e6f0ff',
      color: type === 'trade' ? '#6b21a8' : '#1e40af',
      border: `1px solid ${type === 'trade' ? '#d4b5ff' : '#93c5fd'}`,
    }}>
      {type}
    </span>
  );
}

export default function OffersPage() {
  const [tab, setTab] = useState<'active' | 'history'>('active');
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authed, setAuthed] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  const loadOffers = useCallback(async (uid: string) => {
    const supabase = createClient();
    if (!supabase) return;

    const { data, error: queryError } = await supabase
      .from('trade_offers')
      .select('id, status, offer_type, created_at, updated_at, initiator_id, recipient_id, cash_amount, listing_id, initiator:profiles!trade_offers_initiator_id_fkey(username), recipient:profiles!trade_offers_recipient_id_fkey(username), listing:listings!trade_offers_listing_id_fkey(title)')
      .or(`initiator_id.eq.${uid},recipient_id.eq.${uid}`)
      .order('updated_at', { ascending: false });

    if (queryError) {
      setError(friendlyMessage(handleError(queryError, { where: 'offers.load' })));
    } else if (data) {
      setError(null);
      setOffers(data as unknown as Offer[]);
    }
  }, []);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) { setLoading(false); return; }

    let sub: ReturnType<typeof supabase.channel> | null = null;

    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { setLoading(false); return; }
      setAuthed(true);
      setUserId(user.id);

      await loadOffers(user.id);
      setLoading(false);

      sub = supabase.channel(`all-offers-${user.id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'trade_offers' }, () => loadOffers(user.id))
        .subscribe();
    });

    return () => { if (sub) supabase.removeChannel(sub); };
  }, [loadOffers]);


  const activeOffers = offers.filter((o) => ['proposed', 'countered', 'accepted', 'disputed'].includes(o.status));
  const historyOffers = offers.filter((o) => ['completed', 'cancelled'].includes(o.status));

  const partnerName = (o: Offer) => {
    if (!userId) return '—';
    if (o.initiator_id === userId) return o.recipient?.username ?? 'Unknown';
    return o.initiator?.username ?? 'Unknown';
  };

  const role = (o: Offer) => (o.initiator_id === userId ? 'Sent' : 'Received');

  const fmtDate = (s: string) =>
    new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const tabCounts = {
    active: activeOffers.length,
    history: historyOffers.length,
  };

  const viewUrl = (o: Offer) => `/trades/${o.id}`;

  return (
    <>
      <Nav />
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 20px' }}>
        <div className="listing-toolbar">
          <div className="listing-title">Offers</div>
        </div>

        <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #e5e5e5', marginBottom: 20 }}>
          {([
            { key: 'active' as const, label: 'Active' },
            { key: 'history' as const, label: 'History' },
          ]).map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{ padding: '8px 20px', fontSize: 13.5, fontWeight: 600, background: 'none', border: 'none', borderBottom: tab === t.key ? '2px solid #111' : '2px solid transparent', cursor: 'pointer', color: tab === t.key ? '#111' : '#777', marginBottom: -1 }}>
              {t.label} ({tabCounts[t.key]})
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#aaa', fontSize: 13 }}>Loading offers…</div>
        ) : !authed ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#888', fontSize: 14 }}>Sign in to see your offers.</div>
        ) : error ? (
          <ErrorState message={error} onRetry={() => { if (userId) loadOffers(userId); }} />
        ) : (
          (() => {
            const items = tab === 'active' ? activeOffers : historyOffers;
            if (items.length === 0) {
              return (
                <div style={{ textAlign: 'center', padding: '60px 0' }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#333', marginBottom: 8 }}>
                    {tab === 'active' ? 'No active offers' : 'No history yet'}
                  </div>
                  <div style={{ fontSize: 13, color: '#888', maxWidth: 400, margin: '0 auto 24px' }}>
                    Browse listings to make an offer or propose a trade.
                  </div>
                  <a href="/listings" style={{ background: '#111', color: '#fff', borderRadius: 5, padding: '10px 24px', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
                    Browse Listings
                  </a>
                </div>
              );
            }
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {items.map((offer) => {
                  return (
                    <div
                      key={offer.id}
                      style={{ padding: '14px 18px', border: '1px solid #e5e5e5', borderRadius: 8, background: '#fff' }}
                    >
                      <a href={viewUrl(offer)} style={{ display: 'block', textDecoration: 'none' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: '#111', marginBottom: 4 }}>
                              {offer.listing?.title ?? 'Untitled'}
                            </div>
                            <div style={{ fontSize: 12, color: '#777' }}>
                              {role(offer)} — with <span style={{ fontWeight: 600, color: '#333' }}>{partnerName(offer)}</span>
                              <span style={{ marginLeft: 8, color: '#bbb' }}>·</span>
                              <span style={{ marginLeft: 8, color: '#999' }}>{fmtDate(offer.updated_at)}</span>
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {offer.cash_amount != null && offer.cash_amount > 0 && (
                              <span style={{ fontSize: 15, fontWeight: 700, color: '#111' }}>${offer.cash_amount.toFixed(2)}</span>
                            )}
                            <TypeBadge type={offer.offer_type} />
                            <StatusBadge status={offer.status} />
                          </div>
                        </div>
                      </a>
                    </div>
                  );
                })}
              </div>
            );
          })()
        )}
      </div>
      <Footer />
    </>
  );
}
