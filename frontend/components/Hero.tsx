'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

export interface HeroSlide {
  eyebrow: string;
  big: string;
  big2: string;
  boxed: string;
  meta1: string;
  meta2: string;
  cta: string;
  ctaHref: string;
  bg: string;
  imageUrl?: string;
}

const FALLBACK_SLIDES: HeroSlide[] = [
  { eyebrow: 'Spring 2026 Flagship Event', big: 'KING of', big2: 'POKÉMON', boxed: 'The Rarest Cards', meta1: 'Season 3', meta2: 'Live Now', cta: 'Browse Auctions', ctaHref: '/auctions', bg: 'linear-gradient(135deg,#3a2510 0%,#5a3820 40%,#7a5030 100%)' },
  { eyebrow: 'Private Sales — By Appointment', big: 'VINTAGE', big2: 'COLLECTION', boxed: 'Base Set 1st Edition', meta1: '1996–2001', meta2: 'Make an Offer', cta: 'View Catalog', ctaHref: '/catalog', bg: 'linear-gradient(135deg,#0f1a30 0%,#1a2e50 40%,#253a60 100%)' },
];

const GRADIENTS = [
  'linear-gradient(135deg,#1a0a2e 0%,#2d1a4a 40%,#3d2860 100%)',
  'linear-gradient(135deg,#0f1a30 0%,#1a2e50 40%,#253a60 100%)',
  'linear-gradient(135deg,#1a1a0a 0%,#2e2d1a 40%,#3a3820 100%)',
];

interface Props {
  slides?: HeroSlide[];
}

export default function Hero({ slides }: Props) {
  const SLIDES = slides && slides.length > 0 ? slides : FALLBACK_SLIDES;
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setIdx((i) => (i + 1) % SLIDES.length), 5500);
    return () => clearInterval(t);
  }, [SLIDES.length]);

  const safeIdx = idx % SLIDES.length;
  const s = SLIDES[safeIdx];

  return (
    <div className="hero">
      {SLIDES.map((sl, i) => (
        <div key={i} className={`hero-slide${i === idx ? ' active' : ''}`}>
          <div className="hero-bg" style={{ background: sl.bg }} />
          {sl.imageUrl && (
            <div style={{
              position: 'absolute', right: '8%', top: '50%', transform: 'translateY(-50%)',
              height: '72%', maxHeight: 340, zIndex: 1, opacity: i === idx ? 1 : 0,
              transition: 'opacity 0.7s ease', display: 'flex', alignItems: 'center',
            }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={sl.imageUrl}
                alt={sl.big + ' ' + sl.big2}
                style={{ height: '100%', objectFit: 'contain', filter: 'drop-shadow(0 8px 32px rgba(0,0,0,0.7))' }}
              />
            </div>
          )}
          <div className="hero-grad" />
        </div>
      ))}
      <div className="hero-copy">
        <div className="hero-eyebrow">{s.eyebrow}</div>
        <div className="hero-title">{s.big}<br />{s.big2}</div>
        <div className="hero-title-box">{s.boxed}</div>
        <div className="hero-meta">
          {s.meta1}<span className="hero-meta-divider">|</span>{s.meta2}
        </div>
        <Link href={s.ctaHref} className="hero-btn">{s.cta}</Link>
      </div>
      <button className="hero-arrow left" onClick={() => setIdx((i) => (i - 1 + SLIDES.length) % SLIDES.length)}>
        <svg width="12" height="20" viewBox="0 0 12 22" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M10 2L2 11l8 9" /></svg>
      </button>
      <button className="hero-arrow right" onClick={() => setIdx((i) => (i + 1) % SLIDES.length)}>
        <svg width="12" height="20" viewBox="0 0 12 22" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M2 2l8 9-8 9" /></svg>
      </button>
      <div className="hero-dots">
        {SLIDES.map((_, i) => (
          <button key={i} className={`hero-dot${i === idx ? ' active' : ''}`} onClick={() => setIdx(i)} />
        ))}
      </div>
    </div>
  );
}
