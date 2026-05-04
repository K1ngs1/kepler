'use client';

import { useState, useEffect } from 'react';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import { createClient } from '@/lib/supabase/client';

interface Trade {
  id: string;
  status: string;
  created_at: string;
  updated_at: string;
  initiator_id: string;
  recipient_id: string;
  initiator: { username: string | null } | null;
  recipient: { username: string | null } | null;
}

const STATUS_LABELS: Record<string, string> = {
  proposed: 'Proposed', countered: 'Countered', accepted: 'Accepted',
  completed: 'Completed', cancelled: 'Cancelled',
};

export default function TradesPage() {
  const [tab, setTab] = useState<'active' | 'history'>('active');
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [authed, setAuthed] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) { setLoading(false); return; }

    const ref: { channel: ReturnType<typeof supabase.channel> | null } = { channel: null };

    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { setLoading(false); return; }
      setAuthed(true);
      setUserId(user.id);

      const load = async () => {
        const { data } = await supabase
          .from('trade_offers')
          .select('id, status, created_at, updated_at, initiator_id, recipient_id, initiator:profiles!trade_offers_initiator_id_fkey(username), recipient:profiles!trade_offers_recipient_id_fkey(username)')
          .or(`initiator_id.eq.${user.id},recipient_id.eq.${user.id}`)
          .order('updated_at', { ascending: false });
        setTrades((data as unknown as Trade[]) ?? []);
        setLoading(false);
      };

      await load();

      ref.channel = supabase.channel(`trades-list-${user.id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'trade_offers' }, load)
        .subscribe();
    });

    return () => { ref.channel?.unsubscribe(); };
  }, []);

  const active = trades.filter((t) => ['proposed', 'countered', 'accepted'].includes(t.status));
  const history = trades.filter((t) => ['completed', 'cancelled'].includes(t.status));
  const displayed = tab === 'active' ? active : history;

  const partnerName = (t: Trade) => {
    if (!userId) return '—';
    if (t.initiator_id === userId) return t.recipient?.username ?? 'Unknown';
    return t.initiator?.username ?? 'Unknown';
  };

  const role = (t: Trade) => (t.initiator_id === userId ? 'Initiator' : 'Recipient');

  const fmtDate = (s: string) =>
    new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <>
      <Nav />
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 20px' }}>
        <div className="listing-toolbar">
          <div className="listing-title">Trades</div>
          <a href="/trades/new" style={{ background: '#111', color: '#fff', borderRadius: 4, padding: '7px 16px', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
            + Propose Trade
          </a>
        </div>

        <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #e5e5e5', marginBottom: 20 }}>
          {(['active', 'history'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} style={{ padding: '8px 20px', fontSize: 13.5, fontWeight: 600, background: 'none', border: 'none', borderBottom: tab === t ? '2px solid #111' : '2px solid transparent', cursor: 'pointer', color: tab === t ? '#111' : '#777', marginBottom: -1 }}>
              {t === 'active' ? 'Active' : 'History'} ({t === 'active' ? active.length : history.length})
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#aaa', fontSize: 13 }}>Loading trades…</div>
        ) : !authed ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#888', fontSize: 14 }}>Sign in to see your trades.</div>
        ) : displayed.length === 0 && active.length === 0 && history.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#333', marginBottom: 8 }}>You don&apos;t have any trades yet</div>
            <div style={{ fontSize: 13, color: '#888', marginBottom: 24, maxWidth: 400, margin: '0 auto 24px' }}>
              Browse the catalog and mark some cards as &ldquo;Wanted&rdquo; to find a trading partner.
            </div>
            <a href="/catalog" style={{ background: '#111', color: '#fff', borderRadius: 5, padding: '10px 24px', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
              Browse Catalog
            </a>
          </div>
        ) : displayed.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <div style={{ fontSize: 13, color: '#888', marginBottom: 16 }}>No {tab} trades.</div>
            {tab === 'active' && (
              <a href="/trades/new" style={{ background: '#111', color: '#fff', borderRadius: 5, padding: '9px 22px', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>Propose a Trade</a>
            )}
          </div>
        ) : (
          <div className="trades-table-wrap">
            <table className="trades-table">
              <thead>
                <tr>
                  <th>Partner</th>
                  <th>Your Role</th>
                  <th>Status</th>
                  <th>Last Updated</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {displayed.map((trade) => (
                  <tr key={trade.id} style={{ cursor: 'pointer' }} onClick={() => window.location.href = `/trades/${trade.id}`}>
                    <td style={{ fontWeight: 600 }}>{partnerName(trade)}</td>
                    <td style={{ color: '#777' }}>{role(trade)}</td>
                    <td>
                      <span className={`trade-status-chip trade-status-${trade.status}`}>
                        {STATUS_LABELS[trade.status]}
                      </span>
                    </td>
                    <td style={{ color: '#999' }}>{fmtDate(trade.updated_at)}</td>
                    <td>
                      <a href={`/trades/${trade.id}`} style={{ fontSize: 12.5, color: '#555', textDecoration: 'underline', textUnderlineOffset: 2 }}>View →</a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <Footer />
    </>
  );
}
