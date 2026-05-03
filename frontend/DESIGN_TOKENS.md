# Kepler Design Tokens

Extracted from the live Kepler UI (`frontend/app/globals.css`). All components must use these values — never introduce new colors, fonts, or spacing outside this system.

---

## Colors

| Token | Value | Usage |
|---|---|---|
| `color-ink` | `#111` | Primary text, buttons, borders, logo |
| `color-white` | `#fff` | Backgrounds, inverse text |
| `color-border` | `#e5e5e5` | Card borders, dividers, nav border |
| `color-border-mid` | `#ddd` / `#ccc` | Input borders, toolbar selects |
| `color-muted` | `#888` / `#999` | Secondary text, timestamps, counts |
| `color-subtle` | `#555` / `#777` | Nav links (inactive), labels |
| `color-surface` | `#f8f8f8` | Card image backgrounds |
| `color-surface-alt` | `#f5f5f5` | Hover backgrounds, code blocks |
| `color-danger` | `#c0392b` | Error toasts, remove buttons |
| `color-success` | `#3db56c` | "Live" badge |
| `color-hero-bg` | `#2a1f14` | Hero fallback background |
| `color-cta` | `#e5342a` | Hero CTA button (`Browse Auction`) |
| `color-cta-hover` | `#c9261d` | Hero CTA hover |
| `color-slab-blue` | `#1c3f8a` | PSA slab border/top/bottom |
| `color-trade-proposed` | `#fff3cd` / `#856404` | Trade badge — proposed |
| `color-trade-countered` | `#cce5ff` / `#004085` | Trade badge — countered |
| `color-trade-accepted` | `#d4edda` / `#155724` | Trade badge — accepted/completed |
| `color-trade-cancelled` | `#f8d7da` / `#721c24` | Trade badge — cancelled |

---

## Typography

| Token | Value | Usage |
|---|---|---|
| `font-sans` | `var(--font-inter), 'Inter', sans-serif` | Body, nav, buttons, inputs, all UI |
| `font-serif` | `var(--font-baskerville), 'Libre Baskerville', serif` | Logo, hero italic box, footer logo |
| `font-size-base` | `14px` | Body default (`font-size` on `body`) |
| `font-size-sm` | `12px–13px` | Labels, meta, badges, timestamps |
| `font-size-xs` | `10.5px–11.5px` | Rarity chips, lot numbers, slab text |
| `font-size-nav` | `13.5px` | Nav links |
| `font-size-title` | `17px` (700) | Page section titles (`listing-title`) |
| `font-size-hero` | `54px` (900, uppercase) | Hero main title |
| `font-size-hero-box` | `28px` (700, serif italic) | Hero italic box |
| `font-size-price` | `18px–30px` (700) | Auction prices |

---

## Spacing & Layout

| Token | Value | Usage |
|---|---|---|
| `nav-height` | `56px` | Sticky nav bar height |
| `section-max-width` | `1200px` | Max content width |
| `section-padding` | `32px 24px 24px` | Section horizontal + vertical padding |
| `card-gap` | `16px–20px` | Grid gap between cards |
| `catalog-grid` | `repeat(4, 1fr)` | Catalog & collection card grids |
| `lots-grid` | `repeat(3, 1fr)` | Auction lot grid |
| `auction-row` | `repeat(3, 1fr)` | Homepage auction card row |

---

## Card Styles

```css
/* catalog-card / collection-card / lot-card */
border: 1px solid #e5e5e5;
border-radius: 4px;
background: #fff;
transition: box-shadow 0.15s;

/* hover */
box-shadow: 0 2px 12px rgba(0,0,0,0.1);

/* image area */
height: 160px (catalog) / 140px (collection) / 195px (lot);
background: #f8f8f8;
display: flex; align-items: center; justify-content: center;
```

---

## Navigation

```css
height: 56px;
background: #fff;
border-bottom: 1px solid #e5e5e5;
position: sticky; top: 0; z-index: 200;

/* Logo */
font-family: var(--font-baskerville), serif;
font-size: 22px; font-weight: 700; color: #111;

/* Nav links */
font-size: 13.5px; font-weight: 400; color: #222;
padding: 6px 10px;

/* Active state */
border-bottom: 2px solid #111;
```

---

## Buttons

| Class | Style |
|---|---|
| `.btn-place-bid` | `background:#111; color:#fff; border:none; border-radius:4px; padding:14px; font-size:15px; font-weight:600` |
| `.btn-watchlist` | `background:#fff; color:#111; border:1.5px solid #111; border-radius:4px; padding:13px; font-size:15px` |
| `.catalog-card-add` | `border:1.5px solid #111; border-radius:4px; background:#fff; font-size:12.5px; font-weight:600` — hover: `background:#111; color:#fff` |
| `.hero-btn` | `background:#e5342a; color:#fff; border-radius:999px; padding:12px 28px; font-size:14px; font-weight:600` |
| `.nav-sell` | `background:#111; color:#fff; border-radius:6px; padding:7px 18px; font-weight:600` |
| `.modal-confirm` | `background:#111; color:#fff; border:none; border-radius:5px; font-size:13.5px; font-weight:700` |
| `.modal-cancel` | `border:1.5px solid #ccc; background:#fff; border-radius:5px` |
| `.login-submit-btn` | `background:#111; color:#fff; width:100%; border-radius:6px; font-size:14px; font-weight:700` |

---

## Modals

```css
.modal-bg  { position:fixed; inset:0; background:rgba(0,0,0,0.4); z-index:500; display:flex; align-items:center; justify-content:center; }
.modal     { background:#fff; border-radius:8px; padding:28px; width:420px; max-width:95vw; box-shadow:0 20px 50px rgba(0,0,0,0.18); }
.modal-title { font-size:18px; font-weight:700; margin-bottom:4px; }
.modal-sub   { font-size:12.5px; color:#777; margin-bottom:20px; }
```

---

## Inputs & Selects

```css
border: 1.5px solid #ccc;
border-radius: 6px; (inputs) / 4px (toolbar selects)
padding: 10px 14px;
font-size: 14px;
outline: none;
font-family: inherit;
color: #333;
/* focus */ border-color: #555;
```

---

## Trade Status Badges

```css
.trade-status-chip     { display:inline-block; font-size:11px; font-weight:700; padding:2px 8px; border-radius:3px; }
.trade-status-proposed { background:#fff3cd; color:#856404; }
.trade-status-countered{ background:#cce5ff; color:#004085; }
.trade-status-accepted { background:#d4edda; color:#155724; }
.trade-status-completed{ background:#d4edda; color:#155724; }
.trade-status-cancelled{ background:#f8d7da; color:#721c24; }
```

---

## Hero Carousel

```css
height: 440px;
background: #2a1f14; (fallback)
/* gradient overlay */
background: linear-gradient(to right, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.4) 50%, rgba(0,0,0,0) 80%);
/* copy positioned */
left: 60px; top: 50%; transform: translateY(-50%);
/* dots */ width:8px; height:8px; border-radius:50%; background:rgba(255,255,255,0.35);
/* active dot */ background:rgba(255,255,255,0.9);
```

---

## PSA Slab

```css
width:130px; height:180px; border:2.5px solid #1c3f8a; border-radius:6px;
background:#e8eef7; box-shadow:0 3px 14px rgba(0,0,0,0.13);
/* top/bottom bars */ background:#1c3f8a; color:#fff;
/* body */ background:#fafaf2;
```
