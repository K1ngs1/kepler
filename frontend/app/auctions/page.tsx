'use client';

import { useState, useEffect } from 'react';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import LoginModal from '@/components/LoginModal';
import { createClient } from '@/lib/supabase/client';

interface ForTradeCard {
  id: string;
  condition: string;
  quantity: number;
  user_id: string;
  catalog_cards: {
    id: string;
    name: string;
    set_name: string;
    set_code: string;
    number: string;
    rarity: string | null;
    image_url: string | null;
  };
  profiles: { username: string | null; reputation_score: number | null } | null;
}

function StarDisplay({ score }: { score: number | null }) {
  if (!score || score === 0) return null;
  return (
    <span style={{ fontSize: 11, color: '#888', display: 'inline-flex', alignItems: 'center', gap: 2 }}>
      {'★'.repeat(Math.round(score))}{'☆'.repeat(5 - Math.round(score))}
      <span style={{ marginLeft: 2 }}>{score}</span>
    </span>
  );
}

export default function AuctionsPage() {
  const [cards, setCards] = useState<ForTradeCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedSet, setSelectedSet] = useState('');
  const [selectedCondition, setSelectedCondition] = useState('');
  const [viewMode, setViewMode] = useState('grid');
  const [sortBy, setSortBy] = useState('reputation');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [yearOpen, setYearOpen] = useState(true);
  const [gradeOpen, setGradeOpen] = useState(true);
  const [setOpen, setSetOpen] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [authed, setAuthed] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      if (!supabase) { setLoading(false); return; }

      const { data: { user } } = await supabase.auth.getUser();
      if (user) { setAuthed(true); setCurrentUserId(user.id); }

      const { data } = await supabase
        .from('user_cards')
        .select('id, condition, quantity, user_id, catalog_cards(id, name, set_name, set_code, number, rarity, image_url), profiles(username, reputation_score)')
        .eq('for_trade', true)
        .order('created_at', { ascending: false })
        .limit(200);

      setCards((data as unknown as ForTradeCard[]) ?? []);
      setLoading(false);
    })();
  }, []);

  const sets = Array.from(new Set(cards.map((c) => c.catalog_cards?.set_name).filter(Boolean))).sort() as string[];
  const conditions = Array.from(new Set(cards.map((c) => c.condition))).sort();

  const sorted = [...cards].sort((a, b) => {
    if (sortBy === 'reputation') {
      const ra = a.profiles?.reputation_score ?? 0;
      const rb = b.profiles?.reputation_score ?? 0;
      return rb - ra;
    }
    if (sortBy === 'name-asc') return (a.catalog_cards?.name ?? '').localeCompare(b.catalog_cards?.name ?? '');
    if (sortBy === 'name-desc') return (b.catalog_cards?.name ?? '').localeCompare(a.catalog_cards?.name ?? '');
    if (sortBy === 'set') return (a.catalog_cards?.set_name ?? '').localeCompare(b.catalog_cards?.set_name ?? '');
    return 0;
  });

  const filtered = sorted.filter((c) => {
    if (!c.catalog_cards) return false;
    const q = search.toLowerCase();
    if (q && !c.catalog_cards.name.toLowerCase().includes(q) &&
        !c.catalog_cards.set_name.toLowerCase().includes(q) &&
        !(c.profiles?.username ?? '').toLowerCase().includes(q)) return false;
    if (selectedSet && c.catalog_cards.set_name !== selectedSet) return false;
    if (selectedCondition && c.condition !== selectedCondition) return false;
    return true;
  });

  const isOwn = (card: ForTradeCard) => card.user_id === currentUserId;

  return (
    <>
      <Nav />
      <div className="listing-wrap">
        <aside className={`sidebar${sidebarOpen ? '' : ' collapsed'}`}>
          <div className="sidebar-group">
            <button className="sidebar-group-title" style={{ fontWeight: 400, fontSize: '12.5px', color: '#888', letterSpacing: 0 }}>
              Condition
              <svg width="10" height="10" viewBox="0 0 10 7" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M1 1.5l4 4 4-4" /></svg>
            </button>
            {['', ...conditions].map((c) => (
              <label key={c || '__all'} className="sidebar-item">
                <input
                  type="radio"
                  name="condition"
                  checked={selectedCondition === c}
                  onChange={() => setSelectedCondition(c)}
                />
                <span>{c || 'All Conditions'}</span>
              </label>
            ))}
          </div>
          <hr className="sidebar-divider" />
          <div className="sidebar-group">
            <button className="sidebar-group-title" onClick={() => setGradeOpen((v) => !v)}>
              Grade
              <svg width="10" height="10" viewBox="0 0 10 7" fill="none" stroke="currentColor" strokeWidth="1.8" style={{ transform: gradeOpen ? 'rotate(180deg)' : '' }}><path d="M1 1.5l4 4 4-4" /></svg>
            </button>
            {gradeOpen && ['Mint', 'Near Mint', 'Lightly Played', 'Moderately Played', 'Heavily Played', 'Damaged'].map((g) => (
              <label key={g} className="sidebar-item">
                <input type="checkbox" />
                <span style={{ fontSize: 12 }}>{g}</span>
              </label>
            ))}
          </div>
          <hr className="sidebar-divider" />
          <div className="sidebar-group">
            <button className="sidebar-group-title" onClick={() => setYearOpen((v) => !v)}>
              Set
              <svg width="10" height="10" viewBox="0 0 10 7" fill="none" stroke="currentColor" strokeWidth="1.8" style={{ transform: yearOpen ? 'rotate(180deg)' : '' }}><path d="M1 1.5l4 4 4-4" /></svg>
            </button>
            {yearOpen && ['', ...sets].map((s) => (
              <label key={s || '__all'} className="sidebar-item">
                <input
                  type="radio"
                  name="set"
                  checked={selectedSet === s}
                  onChange={() => setSelectedSet(s)}
                />
                <span style={{ fontSize: 12 }}>{s || 'All Sets'} {s && <span className="sidebar-item-count">({cards.filter((c) => c.catalog_cards?.set_name === s).length})</span>}</span>
              </label>
            ))}
          </div>
          <hr className="sidebar-divider" />
          <div className="sidebar-group">
            <button className="sidebar-group-title" onClick={() => setSetOpen((v) => !v)}>
              Rarity
              <svg width="10" height="10" viewBox="0 0 10 7" fill="none" stroke="currentColor" strokeWidth="1.8" style={{ transform: setOpen ? 'rotate(180deg)' : '' }}><path d="M1 1.5l4 4 4-4" /></svg>
            </button>
            {setOpen && ['Common', 'Uncommon', 'Rare', 'Rare Holo', 'Rare Holo EX'].map((r) => (
              <label key={r} className="sidebar-item">
                <input type="checkbox" />
                <span style={{ fontSize: 12 }}>{r}</span>
              </label>
            ))}
          </div>
        </aside>

        <button
          className="sidebar-collapse-btn"
          onClick={() => setSidebarOpen((v) => !v)}
          title={sidebarOpen ? 'Collapse filters' : 'Expand filters'}
        >
          <svg width="10" height="14" viewBox="0 0 10 14" fill="none" stroke="currentColor" strokeWidth="2">
            {sidebarOpen ? <path d="M7 1L2 7l5 6" /> : <path d="M3 1l5 6-5 6" />}
          </svg>
        </button>

        <main className="listing-main">
          <div className="listing-toolbar">
            <div className="listing-title">Cards For Trade</div>
            <div className="toolbar-search">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="7" cy="7" r="5" /><path d="M11 11l3 3" /></svg>
              <input placeholder="Search cards, sets, or users…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div className="view-btns">
              <button className={`view-btn${viewMode === 'list' ? ' on' : ''}`} onClick={() => setViewMode('list')}>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="12" height="2.2" /><rect x="2" y="7" width="12" height="2.2" /><rect x="2" y="11" width="12" height="2.2" /></svg>
              </button>
              <button className={`view-btn${viewMode === 'grid' ? ' on' : ''}`} onClick={() => setViewMode('grid')}>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="2" width="5" height="5" /><rect x="9" y="2" width="5" height="5" /><rect x="2" y="9" width="5" height="5" /><rect x="9" y="9" width="5" height="5" /></svg>
              </button>
            </div>
            <select className="toolbar-select" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              <option value="reputation">Top Rated</option>
              <option value="name-asc">Name: A–Z</option>
              <option value="name-desc">Name: Z–A</option>
              <option value="set">By Set</option>
            </select>
            {!loading && (
              <span style={{ fontSize: 12, color: '#888', whiteSpace: 'nowrap' }}>
                {filtered.length} card{filtered.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '80px 0', color: '#aaa', fontSize: 13 }}>
              Loading available cards…
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '80px 0' }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#333', marginBottom: 8 }}>
                {cards.length === 0 ? 'No cards available for trade yet' : 'No cards match your filters'}
              </div>
              <div style={{ fontSize: 13, color: '#888', marginBottom: 24 }}>
                {cards.length === 0
                  ? 'When users mark cards as "For Trade" in their collection, they appear here.'
                  : 'Try adjusting your search or filters.'}
              </div>
              {cards.length === 0 && (
                <a href="/collection" style={{ background: '#111', color: '#fff', borderRadius: 5, padding: '10px 24px', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
                  Go to My Collection
                </a>
              )}
            </div>
          ) : viewMode === 'list' ? (
            <div className="trades-table-wrap">
            <table className="trades-table">
              <thead>
                <tr>
                  <th>Card</th>
                  <th>Set</th>
                  <th>Condition</th>
                  <th>Owner</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((card) => (
                  <tr key={card.id}>
                    <td style={{ fontWeight: 600 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        {card.catalog_cards?.image_url && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={card.catalog_cards.image_url} alt={card.catalog_cards.name} style={{ height: 36, width: 'auto', objectFit: 'contain' }} loading="lazy" />
                        )}
                        <a href={`/catalog/${card.catalog_cards?.id}`} style={{ color: '#111', textDecoration: 'none' }}>
                          {card.catalog_cards?.name ?? 'Unknown'}
                        </a>
                      </div>
                    </td>
                    <td style={{ color: '#777', fontSize: 12.5 }}>{card.catalog_cards?.set_name ?? '—'} · #{card.catalog_cards?.number ?? '—'}</td>
                    <td style={{ color: '#777', fontSize: 12.5 }}>{card.condition}</td>
                    <td style={{ color: '#555', fontSize: 12.5 }}>
                      <div>{card.profiles?.username ?? 'Anonymous'}</div>
                      <StarDisplay score={card.profiles?.reputation_score ?? null} />
                    </td>
                    <td>
                      {isOwn(card) ? (
                        <span style={{ fontSize: 12, color: '#999' }}>Your card</span>
                      ) : authed ? (
                        <a
                          href={`/trades/new?with=${card.user_id}`}
                          style={{ fontSize: 12, padding: '4px 12px', border: '1.5px solid #111', borderRadius: 4, background: '#111', color: '#fff', textDecoration: 'none', display: 'inline-block' }}
                        >
                          Propose Trade
                        </a>
                      ) : (
                        <button
                          onClick={() => setLoginOpen(true)}
                          style={{ fontSize: 12, padding: '4px 12px', border: '1.5px solid #111', borderRadius: 4, background: '#fff', color: '#111', cursor: 'pointer' }}
                        >
                          Login to Trade
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          ) : (
            <div className="lots-grid">
              {filtered.map((card) => (
                <div key={card.id} className="lot-card">
                  <div className="lot-card-img" style={{ position: 'relative' }}>
                    {card.catalog_cards?.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={card.catalog_cards.image_url}
                        alt={card.catalog_cards.name}
                        loading="lazy"
                        style={{ maxHeight: 175, maxWidth: '88%', objectFit: 'contain' }}
                      />
                    ) : (
                      <div style={{ color: '#ccc', fontSize: 12, textAlign: 'center', padding: '0 8px' }}>
                        {card.catalog_cards?.name ?? 'Unknown'}
                      </div>
                    )}
                  </div>
                  <div className="lot-body">
                    <div className="lot-num" style={{ fontSize: 11, color: '#888' }}>
                      {card.catalog_cards?.set_name ?? '—'} · #{card.catalog_cards?.number ?? '—'}
                    </div>
                    <div className="lot-title">
                      <a href={`/catalog/${card.catalog_cards?.id}`} style={{ color: '#111', textDecoration: 'none' }}>
                        {card.catalog_cards?.name ?? 'Unknown'}
                      </a>
                    </div>
                    <div style={{ fontSize: 12, color: '#555', marginBottom: 4 }}>
                      Condition: <strong>{card.condition}</strong>
                    </div>
                    <div style={{ fontSize: 12, color: '#777', marginBottom: 4 }}>
                      Owner: <span style={{ fontWeight: 600, color: '#333' }}>{card.profiles?.username ?? 'Anonymous'}</span>
                    </div>
                    {card.profiles?.reputation_score ? (
                      <div style={{ marginBottom: 6 }}>
                        <StarDisplay score={card.profiles.reputation_score} />
                      </div>
                    ) : null}
                    {card.catalog_cards?.rarity && (
                      <div className="catalog-card-rarity" style={{ marginBottom: 10 }}>
                        {card.catalog_cards.rarity}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
                      {isOwn(card) ? (
                        <a
                          href="/collection"
                          className="lot-bid-btn"
                          style={{ flex: 1, textAlign: 'center', textDecoration: 'none' }}
                        >
                          My Card
                        </a>
                      ) : authed ? (
                        <a
                          href={`/trades/new?with=${card.user_id}`}
                          className="lot-bid-btn"
                          style={{ flex: 1, background: '#111', color: '#fff', borderColor: '#111', textAlign: 'center', textDecoration: 'none' }}
                        >
                          Propose Trade
                        </a>
                      ) : (
                        <button
                          className="lot-bid-btn"
                          style={{ flex: 1 }}
                          onClick={() => setLoginOpen(true)}
                        >
                          Login to Trade
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>
      <Footer />
      {loginOpen && (
        <LoginModal
          onClose={() => setLoginOpen(false)}
          onSuccess={(u) => {
            setLoginOpen(false);
            setAuthed(true);
            const supabase = createClient();
            if (supabase) {
              supabase.auth.getUser().then(({ data }) => {
                if (data.user) setCurrentUserId(data.user.id);
              });
            }
          }}
        />
      )}
    </>
  );
}
