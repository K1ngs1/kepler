# Kepler — Pokémon Card Marketplace

## Overview
A full-stack Pokémon card trading platform. Next.js 14 frontend with Supabase backend. Features include card catalog, user collections, trade engine, and live auction listings.

## Architecture
- **Frontend**: `frontend/` — Next.js 14 app (TypeScript, Tailwind, App Router)
- **UI**: Identical to original design — Inter + Libre Baskerville fonts, #111/#fff/#e5e5e5 palette, all CSS classes preserved in `frontend/app/globals.css`
- **Auth**: Supabase Auth (email/password + Google OAuth via `/auth/callback`)
- **Database**: Supabase PostgreSQL (schema in `supabase/migrations/001_schema.sql`)
- **Legacy**: `server.py` / `backend/` kept for reference but no longer the main server

## Running the App
The `Start application` workflow runs:
```
cd frontend && npm run dev -- --hostname 0.0.0.0 --port 5000
```

## Pages
- `/` — Homepage: Hero carousel, live auctions, featured lots
- `/auctions` — Listings with sidebar filters, sort, search
- `/auctions/[id]` — Lot detail with bidding UI and countdown
- `/catalog` — Card catalog (browse + add to collection)
- `/collection` — My Collection (trade/wanted toggles)
- `/trades` — Trade offers (active + history tabs)
- `/auth/callback` — OAuth redirect handler

## Key Files
- `frontend/app/globals.css` — **All Kepler CSS** (do not overwrite without preserving classes)
- `frontend/app/layout.tsx` — Root layout: Inter + Libre Baskerville fonts
- `frontend/components/` — Nav, Hero, Footer, LotCard, AuctionCard, Slab, LoginModal
- `frontend/lib/supabase/client.ts` — Browser Supabase client
- `frontend/lib/supabase/server.ts` — Server Supabase client
- `frontend/middleware.ts` — Auth session refresh
- `frontend/.env.local` — **User must fill in** NEXT_PUBLIC_SUPABASE_URL + ANON_KEY
- `supabase/migrations/001_schema.sql` — Full DB schema (run in Supabase SQL editor)
- `scripts/seed-catalog.mjs` — Seeds card catalog from TCGdex API

## Database Tables
- `profiles` — User profiles (auto-created on signup)
- `catalog_cards` — Pokémon card catalog (seeded from TCGdex)
- `user_cards` — Each user's collection
- `trade_offers` — P2P trade proposals
- `trade_items` — Cards in each trade
- `lots` — Auction lot listings
- `bids` — Bid records with real-time support

## Environment Variables Required
In `frontend/.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

For seed script, also set:
```
SUPABASE_SERVICE_KEY=your-service-role-key
```

## Dependencies
- Next.js 14, React 18, TypeScript, Tailwind CSS
- @supabase/supabase-js, @supabase/ssr
- zod

## Deployment
Update `.replit` deployment run command to:
```
cd frontend && npm run build && npm start
```
