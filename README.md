# Kepler — Pokémon Card Trading Marketplace

A production-ready peer-to-peer trading platform for graded Pokémon TCG cards, built with Next.js 14 and Supabase.

## Features

- Browse 1,500+ real Pokémon cards from classic sets (Base Set through Neo Genesis)
- Build and manage your personal collection
- Mark cards as For Trade or Wanted
- Propose, accept, counter, and complete peer-to-peer trades
- Real-time trade chat powered by Supabase Realtime
- Wishlist matching — see who has the cards you want
- Google OAuth and email/password authentication

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router), TypeScript |
| Styling | CSS (custom design system, no Tailwind runtime) |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth (Google OAuth + email) |
| Realtime | Supabase Realtime (websockets) |
| Card Data | TCGdex API (free, no key required) |

## Setup

### 1. Clone and install

```bash
git clone https://github.com/K1ngs1/kepler.git
cd kepler/frontend
npm install
```

### 2. Configure environment variables

```bash
cp .env.local.example .env.local
```

Edit `.env.local` and fill in your Supabase credentials:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_KEY=your-service-role-key
```

### 3. Apply database migrations

Run both migration files in your Supabase SQL Editor:

1. `supabase/migrations/001_schema.sql` — tables, RLS policies, auth trigger
2. `supabase/migrations/002_trade_functions.sql` — trade functions and messages table

### 4. Seed the card catalog

```bash
export SUPABASE_SERVICE_KEY=your-service-role-key
node scripts/seed-catalog.mjs
```

This populates `catalog_cards` with ~1,500 cards from 15 classic sets via the TCGdex API. Safe to run multiple times — duplicates are skipped.

### 5. Start the dev server

```bash
cd frontend
npm run dev -- --hostname 0.0.0.0 --port 5000
```

Visit [http://localhost:5000](http://localhost:5000).

---

## Database Schema

| Table | Purpose |
|---|---|
| `profiles` | User profile (username, avatar, reputation) — auto-created on signup |
| `catalog_cards` | Master card catalog seeded from TCGdex |
| `user_cards` | Cards owned by users, with for_trade / wanted flags |
| `trade_offers` | Trade proposals between two users |
| `trade_items` | Cards involved in a trade (direction: offer / request) |
| `trade_messages` | Real-time chat messages per trade |
| `lots` / `bids` | Legacy auction tables (not active) |

All trade state changes go through PostgreSQL functions:
- `propose_trade(recipient_id, offered_card_ids, requested_card_ids)`
- `accept_trade(trade_id)`
- `counter_offer(trade_id, offered_card_ids, requested_card_ids)`
- `cancel_trade(trade_id)`
- `complete_trade(trade_id)` — called by both parties to confirm receipt

---

## Project Structure

```
kepler/
├── frontend/               # Next.js 14 app
│   ├── app/                # App router pages
│   │   ├── page.tsx        # Homepage
│   │   ├── catalog/        # Card catalog + detail
│   │   ├── collection/     # My Collection
│   │   ├── trades/         # Trade list, detail, propose
│   │   ├── wishlist/       # Wanted cards + match suggestions
│   │   └── auth/callback/  # OAuth callback
│   ├── components/         # Shared UI components
│   ├── lib/                # Supabase clients, logger, error handler
│   └── middleware.ts       # Auth guard
├── backend/                # FastAPI mock server (legacy, do not delete)
├── scripts/                # Seed script
└── supabase/
    ├── migrations/         # SQL migrations
    └── backup-guide.md     # Backup instructions
```

---

## Backup & Recovery

See [`supabase/backup-guide.md`](supabase/backup-guide.md) for Point-In-Time Recovery setup and manual backup instructions.

---

## Contributing

1. Fork the repo
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes — do not modify `app/globals.css` visual tokens
4. Open a pull request against `main`
