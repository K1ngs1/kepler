# Changelog

All notable changes to Kepler are documented in this file.

## [Unreleased] — Production Polish

### Added
- **CI/CD pipeline**: GitHub Actions workflow for lint, build, and Playwright E2E tests
- **CSV price import**: `scripts/seed-prices.mjs` now accepts a CSV file for real market prices
- **Price template**: `scripts/price-template.csv` with example pricing data
- **Analytics price badge**: Shows when card prices were last updated on `/analytics`
- **Empty states**: Improved messaging on trades, collection, auctions, and homepage when no data exists
- **Webhook setup script**: `scripts/setup-webhooks.sh` with step-by-step instructions
- **Edge function test**: `supabase/functions/send-trade-email/test.sh` for verifying the email function
- **Security headers**: `X-Content-Type-Options`, `X-Frame-Options`, `Strict-Transport-Security`, `Referrer-Policy`, `Permissions-Policy`
- **Mobile polish**: `touch-action: manipulation` on buttons, overflow fixes, minimum tap targets

### Changed
- `.replit` no longer contains hardcoded Supabase credentials (moved to Replit Secrets)
- `.gitignore` now covers `playwright-report/`, `test-results/`, `.config/`
- `.gitattributes` marks `backend/` as `linguist-vendored` to fix GitHub language stats
- README expanded with troubleshooting, deployment, and known limitations sections

### Fixed
- Horizontal scroll on mobile caused by overflowing tables
- 300ms tap delay on mobile buttons

---

## Mobile Responsiveness — 2026-05-02

### Added
- Full mobile responsiveness with hamburger nav and `@media` queries
- Trade detail grid layout adapts to mobile
- Table wrapping for trades and auctions tables
- Card picker grid responsive to screen size
- Modal bottom-sheet style on mobile

### Fixed
- Send button fixed width, message input fills remaining space
- Trade detail grid desktop layout restored (messages panel on the right)

---

## Features — 2026-05-01

### Added
- **Reputation system**: Star ratings after completed trades, displayed in nav and profiles
- **Trade timeline**: Visual progress indicator (Proposed → Accepted → Completed)
- **Wishlist matching**: See who has the cards you want, with trader reputation
- **Trade history page**: View completed and cancelled trades
- **Cancel trade**: Either party can cancel an active trade
- **Auctions sorting**: Sort by reputation, name, or set
- **Photo uploads**: Upload card photos to show alongside official art
- **Trade value estimator**: Estimated market values and fairness comparison during trades
- **Email notifications**: Resend edge function for trade offers and messages
- **Trade binder export**: Share tradeable cards as an image or public link
- **Keyboard shortcuts**: `/` to search, `Ctrl+K` command palette, `Esc` to close
- **Analytics dashboard**: Platform-wide stats, most wanted and most traded cards
- **Playwright E2E tests**: Full trade flow test suite

---

## Core Platform — 2026-04-30

### Added
- Browse 1,500+ Pokémon cards from classic sets (Base Set through Neo Genesis)
- Personal collection management with For Trade / Wanted flags
- Peer-to-peer trade proposals via PostgreSQL RPC functions
- Real-time trade chat powered by Supabase Realtime
- Google OAuth and email/password authentication
- 6 PostgreSQL migrations for schema, trades, reputation, photos, prices, and email preferences
- Card catalog seeded from TCGdex API
