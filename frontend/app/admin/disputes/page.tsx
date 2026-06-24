'use client';

import { useState, useEffect } from 'react';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import { createClient } from '@/lib/supabase/client';
import { handleError, friendlyMessage } from '@/lib/error-handler';

interface DisputedTrade {
  id: string;
  initiator_id: string;
  recipient_id: string;
  offer_type: string | null;
  cash_amount: number | null;
  deposit_amount: number | null;
  payment_status: string | null;
  initiator_deposit_locked: boolean | null;
  recipient_deposit_locked: boolean | null;
  dispute_reason: string | null;
  disputed_by: string | null;
  disputed_at: string | null;
  tracking_number: string | null;
  carrier: string | null;
  shipped_at: string | null;
  created_at: string;
  initiator: { username: string | null } | null;
  recipient: { username: string | null } | null;
}

type Resolution = 'refund_both' | 'release_to_initiator' | 'release_to_recipient';

const RESOLUTION_LABELS: Record<Resolution, string> = {
  refund_both: 'Refund both parties',
  release_to_initiator: 'Release to buyer',
  release_to_recipient: 'Release to seller',
};

export default function AdminDisputesPage() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [trades, setTrades] = useState<DisputedTrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [confirm, setConfirm] = useState<{ tradeId: string; resolution: Resolution } | null>(null);

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  };

  const loadDisputes = async () => {
    const supabase = createClient();
    if (!supabase) { setLoading(false); return; }
    const { data, error } = await supabase
      .from('trade_offers')
      .select('id, initiator_id, recipient_id, offer_type, cash_amount, deposit_amount, payment_status, initiator_deposit_locked, recipient_deposit_locked, dispute_reason, disputed_by, disputed_at, tracking_number, carrier, shipped_at, created_at, initiator:profiles!trade_offers_initiator_id_fkey(username), recipient:profiles!trade_offers_recipient_id_fkey(username)')
      .eq('status', 'disputed')
      .order('disputed_at', { ascending: true });
    if (error) { showToast(friendlyMessage(handleError(error, { where: 'admin.loadDisputes' })), false); setLoading(false); return; }
    setTrades((data ?? []) as unknown as DisputedTrade[]);
    setLoading(false);
  };

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) { setIsAdmin(false); setLoading(false); return; }
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { setIsAdmin(false); setLoading(false); return; }
      const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single();
      if (!profile?.is_admin) { setIsAdmin(false); setLoading(false); return; }
      setIsAdmin(true);
      await loadDisputes();
    });
  }, []);

  const resolve = async (tradeId: string, resolution: Resolution) => {
    setBusyId(tradeId);
    const supabase = createClient();
    if (!supabase) return;
    const { error } = await supabase.rpc('resolve_dispute', { p_trade_id: tradeId, p_resolution: resolution });
    if (error) showToast(error.message, false);
    else { showToast('Dispute resolved — payout queued.'); setTrades((t) => t.filter((x) => x.id !== tradeId)); }
    setBusyId(null);
    setConfirm(null);
  };

  if (loading) return (
    <>
      <Nav />
      <div style={{ textAlign: 'center', padding: '80px 0', color: '#aaa', fontSize: 13 }}>Loading…</div>
      <Footer />
    </>
  );

  if (!isAdmin) return (
    <>
      <Nav />
      <div style={{ textAlign: 'center', padding: '80px 0', color: '#888', fontSize: 14 }}>
        Not authorized. This page is for administrators only.
      </div>
      <Footer />
    </>
  );

  const escrowed = (t: DisputedTrade) => {
    const cash = ['paid', 'verified'].includes(t.payment_status ?? '') ? Number(t.cash_amount || 0) : 0;
    const dep = Number(t.deposit_amount || 0);
    const initDep = t.initiator_deposit_locked ? dep : 0;
    const recDep = t.recipient_deposit_locked ? dep : 0;
    return { cash, initDep, recDep, total: cash + initDep + recDep };
  };

  return (
    <>
      <Nav />
      {toast && (
        <div style={{ position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)', background: toast.ok ? '#111' : '#c0392b', color: '#fff', padding: '11px 22px', borderRadius: 6, fontSize: 13.5, fontWeight: 500, zIndex: 1000, boxShadow: '0 4px 24px rgba(0,0,0,0.22)', whiteSpace: 'nowrap', pointerEvents: 'none' }}>
          {toast.msg}
        </div>
      )}

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 20px' }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: '#111', marginBottom: 4 }}>Dispute Resolution</div>
        <div style={{ fontSize: 13, color: '#777', marginBottom: 24 }}>
          {trades.length === 0 ? 'No open disputes.' : `${trades.length} open dispute${trades.length === 1 ? '' : 's'} awaiting review.`}
        </div>

        {trades.map((t) => {
          const e = escrowed(t);
          const buyer = t.initiator?.username ?? 'Buyer';
          const seller = t.recipient?.username ?? 'Seller';
          const openedByBuyer = t.disputed_by === t.initiator_id;
          return (
            <div key={t.id} style={{ border: '1px solid #e5e5e5', borderRadius: 8, padding: 18, marginBottom: 16, background: '#fff' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#111' }}>
                    {buyer} <span style={{ color: '#aaa', fontWeight: 400 }}>(buyer)</span> → {seller} <span style={{ color: '#aaa', fontWeight: 400 }}>(seller)</span>
                  </div>
                  <div style={{ fontSize: 11.5, color: '#999', marginTop: 2 }}>
                    Opened by {openedByBuyer ? buyer : seller}
                    {t.disputed_at && <span> · {new Date(t.disputed_at).toLocaleDateString()}</span>}
                  </div>
                </div>
                <a href={`/trades/${t.id}`} style={{ fontSize: 12, color: '#555', textDecoration: 'underline', whiteSpace: 'nowrap' }}>Open trade →</a>
              </div>

              {t.dispute_reason && (
                <div style={{ fontSize: 12.5, color: '#333', padding: '8px 12px', background: '#fafafa', border: '1px solid #eee', borderRadius: 4, marginBottom: 12 }}>
                  {t.dispute_reason}
                </div>
              )}

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 18px', fontSize: 12, color: '#555', marginBottom: 12 }}>
                <span>In escrow: <strong style={{ color: '#111' }}>${e.total.toFixed(2)}</strong></span>
                {e.cash > 0 && <span>cash ${e.cash.toFixed(2)}</span>}
                {e.initDep > 0 && <span>buyer deposit ${e.initDep.toFixed(2)}</span>}
                {e.recDep > 0 && <span>seller deposit ${e.recDep.toFixed(2)}</span>}
                <span>payment: {t.payment_status ?? 'none'}</span>
              </div>

              <div style={{ fontSize: 12, color: '#555', marginBottom: 14 }}>
                Tracking:{' '}
                {t.tracking_number ? (
                  <span style={{ fontFamily: 'monospace', color: '#333' }}>
                    {t.tracking_number}{t.carrier && ` · ${t.carrier}`}
                    {t.shipped_at && ` · shipped ${new Date(t.shipped_at).toLocaleDateString()}`}
                  </span>
                ) : (
                  <span style={{ color: '#c0392b' }}>none recorded</span>
                )}
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {(['release_to_recipient', 'release_to_initiator', 'refund_both'] as Resolution[]).map((r) => (
                  <button
                    key={r}
                    disabled={busyId === t.id}
                    onClick={() => setConfirm({ tradeId: t.id, resolution: r })}
                    style={{
                      fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit', padding: '9px 14px', borderRadius: 4, cursor: 'pointer',
                      border: r === 'refund_both' ? '1.5px solid #111' : 'none',
                      background: r === 'refund_both' ? '#fff' : r === 'release_to_recipient' ? '#1e8a4a' : '#1d6fa8',
                      color: r === 'refund_both' ? '#111' : '#fff',
                    }}
                  >
                    {RESOLUTION_LABELS[r]}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Confirm modal */}
      {confirm && (() => {
        const t = trades.find((x) => x.id === confirm.tradeId);
        if (!t) return null;
        const e = escrowed(t);
        const buyer = t.initiator?.username ?? 'buyer';
        const seller = t.recipient?.username ?? 'seller';
        const detail = confirm.resolution === 'refund_both'
          ? `${buyer} gets $${(e.cash + e.initDep).toFixed(2)} back, ${seller} gets $${e.recDep.toFixed(2)} back.`
          : confirm.resolution === 'release_to_initiator'
          ? `${buyer} receives the full $${e.total.toFixed(2)} in escrow.`
          : `${seller} receives the full $${e.total.toFixed(2)} in escrow.`;
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: '#fff', borderRadius: 8, padding: 24, width: 420, maxWidth: '90vw' }}>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10, color: '#111' }}>{RESOLUTION_LABELS[confirm.resolution]}?</div>
              <div style={{ fontSize: 13, color: '#444', marginBottom: 20, lineHeight: 1.5 }}>
                {detail} This moves real USDC and cannot be undone.
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button
                  style={{ minWidth: 110, padding: '10px 18px', fontSize: 13.5, fontWeight: 600, fontFamily: 'inherit', borderRadius: 4, border: '1.5px solid #111', background: '#fff', color: '#111', cursor: 'pointer' }}
                  onClick={() => setConfirm(null)}
                >
                  Cancel
                </button>
                <button
                  style={{ minWidth: 110, padding: '10px 18px', fontSize: 13.5, fontWeight: 600, fontFamily: 'inherit', borderRadius: 4, border: 'none', background: '#111', color: '#fff', cursor: 'pointer' }}
                  disabled={busyId === confirm.tradeId}
                  onClick={() => resolve(confirm.tradeId, confirm.resolution)}
                >
                  {busyId === confirm.tradeId ? 'Resolving…' : 'Confirm'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      <Footer />
    </>
  );
}
