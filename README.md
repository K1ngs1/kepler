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
- **Marketplace Listings** — create listings with multiple cards, set prices or accept offers
- **Buy Now & Trade Offers** — buy collections outright or propose hybrid cash/card trades
- **Escrow Security Deposits** — optionally secure high-value trades with a refundable deposit
- **Photo Upload** — upload your own card photos to show alongside official art
- **Trade Value Estimator** — see estimated market values and fairness comparison during trades
- **Email Notifications** — get notified via email for new trade offers and messages (Resend + Supabase Edge Functions)
- **Trade Binder Export** — share your tradeable cards as an image or public link (`/binder/<username>`)
- **Keyboard Shortcuts** — `/` to search, `Ctrl+K` for command palette, `Esc` to close modals, bulk select in collection
- **Analytics Dashboard** — platform-wide stats at `/analytics` showing most wanted and most traded cards
- **Playwright E2E Tests** — full trade flow test suite

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

# Polygon / Web3
NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID=your-walletconnect-project-id
NEXT_PUBLIC_CHAIN=amoy
NEXT_PUBLIC_MERCHANT_WALLET=0xYourMerchantWalletAddress
```

### 3. Apply database migrations

Run all migration files in order in your Supabase SQL Editor:

1. `supabase/migrations/001_schema.sql` — tables, RLS policies, auth trigger
2. `supabase/migrations/002_trade_functions.sql` — trade functions and messages table
3. `supabase/migrations/003_reputation_cancel.sql` — reputation system and cancel fix
4. `supabase/migrations/004_card_photos.sql` — photo_url column on user_cards
5. `supabase/migrations/005_card_prices.sql` — card_prices table for trade value estimates
6. `supabase/migrations/006_email_notifications.sql` — email_notifications preference on profiles
7. `supabase/migrations/007_listings_and_deposits.sql` — listings, purchase offers, and deposit schema
8. `supabase/migrations/008_polygon_payments.sql` — Polygon USDC payment columns

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
| `listings` | Multi-card marketplace listings with photos and prices |
| `listing_items` | Individual cards within a listing |
| `listing_photos` | Photos uploaded for a listing |
| `purchase_offers` | Buy-now purchase offers with USDC payment tracking |
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
│   ├── lib/                # Supabase clients, logger, error handler, web3 config
│   └── middleware.ts       # Auth guard
├��─ backend/                # FastAPI mock server (legacy, linguist-vendored)
├── scripts/                # Seed script
└── supabase/
    ├── migrations/         # SQL migrations (001–008)
    ├── functions/          # Edge functions (send-trade-email, polygon-verify, polygon-release)
    └── backup-guide.md     # Backup instructions
```

---

## Backup & Recovery

See [`supabase/backup-guide.md`](supabase/backup-guide.md) for Point-In-Time Recovery setup and manual backup instructions.

---

## New Feature Setup

### Card Photos

1. Create a storage bucket called `card-photos` in Supabase Dashboard > Storage
2. Set it to **public** with a 512KB file size limit
3. Apply the RLS policies described in `supabase/migrations/004_card_photos.sql`

### Card Prices (Trade Value Estimator)

```bash
export SUPABASE_SERVICE_KEY=your-service-role-key

# Option 1: Generate rarity-based estimates
node scripts/seed-prices.mjs

# Option 2: Import real prices from a CSV file
node scripts/seed-prices.mjs ./scripts/price-template.csv
```

The CSV format is: `catalog_card_name,set_name,market_price`. See `scripts/price-template.csv` for an example. Sources for real pricing data: [TCGPlayer](https://www.tcgplayer.com), [PriceCharting](https://www.pricecharting.com), or community spreadsheets.

### Email Notifications

1. Sign up for [Resend](https://resend.com) (free tier: 100 emails/day)
2. Set the `RESEND_API_KEY` environment variable in Supabase Edge Functions
3. Deploy the edge function: `supabase functions deploy send-trade-email`
4. Create Database Webhooks in Supabase Dashboard for:
   - `trade_offers` INSERT → call `send-trade-email`
   - `trade_messages` INSERT → call `send-trade-email`

### Polygon USDC Payments

Kepler uses USDC on Polygon PoS for all payments (purchases and security deposits).

#### 1. Get a WalletConnect Project ID

1. Go to [WalletConnect Cloud](https://cloud.walletconnect.com/) and sign up
2. Create a new project and copy your **Project ID**
3. Set `NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID` in `.env.local`

#### 2. Set up a Merchant Wallet

1. Create a new wallet in [MetaMask](https://metamask.io/) (or any wallet) — this is your escrow/merchant wallet
2. Copy the wallet address and set `NEXT_PUBLIC_MERCHANT_WALLET` in `.env.local`
3. Export the private key and set `MERCHANT_PRIVATE_KEY` in your Supabase Edge Function secrets (**never** expose this client-side)

#### 3. Deploy Edge Functions

```bash
supabase functions deploy polygon-verify
supabase functions deploy polygon-release
supabase secrets set MERCHANT_PRIVATE_KEY=0xYourPrivateKey
supabase secrets set MERCHANT_WALLET=0xYourMerchantAddress
supabase secrets set POLYGON_RPC_URL=https://polygon-rpc.com
supabase secrets set CHAIN=amoy   # or 'polygon' for mainnet
```

#### 4. Testing with Amoy Testnet

1. Set `NEXT_PUBLIC_CHAIN=amoy` in `.env.local`
2. Get free testnet MATIC from the [Polygon Amoy Faucet](https://faucet.polygon.technology/)
3. Get testnet USDC by deploying a mock ERC-20 or using the Amoy USDC at `0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582`
4. Switch to `NEXT_PUBLIC_CHAIN=polygon` when deploying to production

#### 5. Database Webhook for Trade Completion

To automate fund release, create a Database Webhook in Supabase Dashboard:
- Table: `trade_offers`
- Event: UPDATE (filter `status = 'completed'`)
- Endpoint: call the `polygon-release` edge function

#### Environment Variables Summary

| Variable | Where | Description |
|---|---|---|
| `NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID` | `.env.local` | WalletConnect Cloud project ID |
| `NEXT_PUBLIC_CHAIN` | `.env.local` | `amoy` (testnet) or `polygon` (mainnet) |
| `NEXT_PUBLIC_MERCHANT_WALLET` | `.env.local` | Merchant/escrow wallet address |
| `MERCHANT_PRIVATE_KEY` | Supabase secrets | Merchant wallet private key (server-side only) |
| `POLYGON_RPC_URL` | Supabase secrets | Polygon RPC endpoint |
| `CHAIN` | Supabase secrets | `amoy` or `polygon` |

### Running E2E Tests

```bash
cd frontend
npx playwright install chromium   # first time only
npm run test:e2e
```

Optional environment variables for test accounts:
```bash
TEST_USER1_EMAIL=user1@test.com
TEST_USER1_PASSWORD=password1
TEST_USER2_EMAIL=user2@test.com
TEST_USER2_PASSWORD=password2
```

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `/` | Focus search bar |
| `Ctrl+K` / `Cmd+K` | Open command palette |
| `Esc` | Close any modal or palette |

---

## CI/CD

A GitHub Actions workflow (`.github/workflows/test.yml`) runs on every push to `main` and on pull requests:
- Installs dependencies, lints, and builds the frontend
- Runs Playwright E2E tests (headless Chromium)
- Uploads Playwright report as an artifact

Set the following secrets in your GitHub repository settings:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `TEST_USER1_EMAIL`, `TEST_USER1_PASSWORD`
- `TEST_USER2_EMAIL`, `TEST_USER2_PASSWORD`

---

## Deploying

### Vercel (recommended)

1. Import the repository on [vercel.com](https://vercel.com)
2. Set the **Root Directory** to `frontend`
3. Add environment variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Deploy — Vercel auto-detects Next.js

### Netlify

1. Set build command: `cd frontend && npm run build`
2. Set publish directory: `frontend/.next`
3. Add the same environment variables
4. Note: You may need the `@netlify/plugin-nextjs` plugin for App Router support

### Replit

The included `.replit` file auto-configures the dev server. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in Replit's **Secrets** tab (not in `.replit` directly).

---

## Troubleshooting

| Problem | Solution |
|---|---|
| "Supabase not configured" on page load | Ensure `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set in `.env.local` or your hosting platform's env vars |
| RLS policy errors (403 / permission denied) | Run all migrations in order in the Supabase SQL Editor. Check that RLS is enabled and policies exist on all tables |
| "Propose Trade" button doesn't appear | You must be logged in, and the card must belong to another user. You cannot trade with yourself |
| Google OAuth redirect fails | Set the correct Site URL and Redirect URLs in Supabase → Auth → URL Configuration |
| Trade completes but cards don't transfer | Ensure migration `002_trade_functions.sql` was applied — the `complete_trade` function handles card ownership transfer |
| Email notifications not sending | Deploy the edge function (`supabase functions deploy send-trade-email`), set `RESEND_API_KEY`, and create Database Webhooks |
| Wallet won't connect | Ensure `NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID` is set. Check browser console for RainbowKit errors |
| USDC transfer fails | Ensure your wallet has enough MATIC for gas and USDC for the transfer. On testnet, use the Amoy faucet |
| Playwright tests time out | Make sure the dev server is running on the URL configured in `playwright.config.ts` (default: `http://localhost:3000`) |

---

## Known Limitations

- **Supabase free tier**: 500MB database, 1GB file storage, 2GB bandwidth, 50K monthly active users
- **No real-time pricing**: Card prices are seeded estimates based on rarity. Import real data via `scripts/seed-prices.mjs ./prices.csv`
- **Email notifications require Resend**: Free tier allows 100 emails/day. Must deploy the edge function and configure webhooks manually
- **Polygon payments**: The `polygon-release` edge function requires the merchant wallet private key and sufficient MATIC for gas. Automated release via database webhook is documented but must be configured manually in the Supabase Dashboard.
- **Single-region deployment**: Supabase projects are single-region. For global distribution, use Vercel's edge network for the frontend

---

## Contributing

1. Fork the repo
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes — do not modify `app/globals.css` visual tokens
4. Open a pull request against `main`
