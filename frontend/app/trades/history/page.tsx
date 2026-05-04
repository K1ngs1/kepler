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
  completed: 'Completed', cancelled: 'Cancelled',
};

export default function TradeHistoryPage() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [authed, setAuthed] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'completed' | 'cancelled'>('all');

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) { setLoading(false); return; }

    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { setLoading(false); return; }
      setAuthed(true);
      setUserId(user.id);

      const { data } = await supabase
        .from('trade_offers')
        .select('id, status, created_at, updated_at, initiator_id, recipient_id, initiator:profiles!trade_offers_initiator_id_fkey(username), recipient:profiles!trade_offers_recipient_id_fkey(username)')
        .or(`initiator_id.eq.${user.id},recipient_id.eq.${user.id}`)
        .in('status', ['completed', 'cancelled'])
        .order('updated_at', { ascending: false });

      setTrades((data as unknown as Trade[]) ?? []);
      setLoading(false);
    });
  }, []);

  const displayed = trades.filter((t) => filter === 'all' || t.status === filter);

  const partnerName = (t: Trade) => {
    if (!userId) return '—';
    if (t.initiator_id === userId) return t.recipient?.username ?? 'Unknown';
    return t.initiator?.username ?? 'Unknown';
  };

  const fmtDate = (s: string) =>
    new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <>
      <Nav />
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 20px' }}>
        <div className="listing-toolbar">
          <div className="listing-title">Trade History</div>
          <a href="/trades" style={{ fontSize: 13, color: '#777', textDecoration: 'none' }}>← Active Trades</a>
        </div>

        <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #e5e5e5', marginBottom: 20 }}>
          {(['all', 'completed', 'cancelled'] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)} style={{ padding: '8px 20px', fontSize: 13.5, fontWeight: 600, background: 'none', border: 'none', borderBottom: filter === f ? '2px solid #111' : '2px solid transparent', cursor: 'pointer', color: filter === f ? '#111' : '#777', marginBottom: -1, textTransform: 'capitalize' }}>
              {f === 'all' ? `All (${trades.length})` : f === 'completed' ? `Completed (${trades.filter((t) => t.status === 'completed').length})` : `Cancelled (${trades.filter((t) => t.status === 'cancelled').length})`}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#aaa', fontSize: 13 }}>Loading history…</div>
        ) : !authed ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#888', fontSize: 14 }}>Sign in to see your trade history.</div>
        ) : displayed.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <div style={{ fontSize: 13, color: '#888' }}>No {filter !== 'all' ? filter : ''} trades in history.</div>
          </div>
        ) : (
          <div className="trades-table-wrap">
          <table className="trades-table">
            <thead>
              <tr>
                <th>Partner</th>
                <th>Status</th>
                <th>Completed / Cancelled</th>
                <th>Proposed</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {displayed.map((trade) => (
                <tr key={trade.id} style={{ cursor: 'pointer' }} onClick={() => window.location.href = `/trades/${trade.id}`}>
                  <td style={{ fontWeight: 600 }}>{partnerName(trade)}</td>
                  <td>
                    <span className={`trade-status-chip trade-status-${trade.status}`}>
                      {STATUS_LABELS[trade.status]}
                    </span>
                  </td>
                  <td style={{ color: '#999' }}>{fmtDate(trade.updated_at)}</td>
                  <td style={{ color: '#999' }}>{fmtDate(trade.created_at)}</td>
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
