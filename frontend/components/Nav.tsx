'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import LoginModal from './LoginModal';
import { createClient } from '@/lib/supabase/client';

interface NavProps {
  user?: { email: string; name: string } | null;
}

export default function Nav({ user: initialUser }: NavProps) {
  const pathname = usePathname();
  const [loginOpen, setLoginOpen] = useState(false);
  const [user, setUser] = useState(initialUser ?? null);
  const [unreadTrades, setUnreadTrades] = useState(0);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) return;

    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        const name = data.user.user_metadata?.full_name
          || data.user.user_metadata?.name
          || data.user.email?.split('@')[0]
          || '';
        setUser({ name, email: data.user.email ?? '' });
        fetchUnread(data.user.id);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        const name = session.user.user_metadata?.full_name
          || session.user.user_metadata?.name
          || session.user.email?.split('@')[0]
          || '';
        setUser({ name, email: session.user.email ?? '' });
        fetchUnread(session.user.id);
      } else {
        setUser(null);
        setUnreadTrades(0);
      }
    });

    async function fetchUnread(uid: string) {
      if (!supabase) return;
      const { count } = await supabase
        .from('trade_offers')
        .select('id', { count: 'exact', head: true })
        .eq('recipient_id', uid)
        .in('status', ['proposed', 'countered']);
      setUnreadTrades(count ?? 0);
    }

    return () => subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    const supabase = createClient();
    if (supabase) await supabase.auth.signOut();
    setUser(null);
    setUnreadTrades(0);
  };

  return (
    <>
      <nav className="nav">
        <Link href="/" className="nav-logo" style={{ textDecoration: 'none' }}>Kepler</Link>
        <div className="nav-search-wrap">
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="7" cy="7" r="5" /><path d="M11 11l3 3" />
          </svg>
          <input placeholder="Search all lots and listings" />
        </div>
        <div className="nav-right">
          <Link href="/auctions" className={`nav-item${pathname === '/auctions' ? ' active' : ''}`}>
            Trade
            <svg width="10" height="10" viewBox="0 0 10 7" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M1 1.5l4 4 4-4" /></svg>
          </Link>
          <Link href="/catalog" className={`nav-item${pathname === '/catalog' ? ' active' : ''}`}>
            Catalog
          </Link>
          <Link href="/collection" className={`nav-item${pathname === '/collection' ? ' active' : ''}`}>
            My Collection
          </Link>
          <Link href="/trades" className={`nav-item${pathname?.startsWith('/trades') ? ' active' : ''}`} style={{ position: 'relative' }}>
            Trades
            {unreadTrades > 0 && (
              <span className="nav-badge">{unreadTrades > 9 ? '9+' : unreadTrades}</span>
            )}
          </Link>
          <Link href="/wishlist" className={`nav-item${pathname === '/wishlist' ? ' active' : ''}`}>
            Wishlist
          </Link>
          {user ? (
            <button className="nav-login" onClick={handleLogout} title="Sign out">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
              </svg>
              {user.name.split(' ')[0] || user.email.split('@')[0]}
            </button>
          ) : (
            <button className="nav-login" onClick={() => setLoginOpen(true)}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
              </svg>
              Login
            </button>
          )}

        </div>
      </nav>
      {loginOpen && (
        <LoginModal
          onClose={() => setLoginOpen(false)}
          onSuccess={(u) => { setUser(u); setLoginOpen(false); }}
        />
      )}
    </>
  );
}
