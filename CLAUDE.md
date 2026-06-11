# Kepler — Claude Instructions

## What This Project Is

**Kepler** is a peer-to-peer marketplace for graded Pokémon TCG cards (Base Set through Neo Genesis, ~1,500 cards). Users can browse, list, trade, and purchase vintage cards with real-time chat, reputation tracking, and USDC payments on the Polygon blockchain.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router), TypeScript, React 18 |
| Styling | Pure CSS via `globals.css` — no Tailwind runtime |
| Database | Supabase (PostgreSQL) with RLS policies |
| Auth | Supabase Auth — Google OAuth + Email/Password |
| Real-time | Supabase Realtime WebSockets |
| Blockchain | Polygon PoS + USDC — RainbowKit, Wagmi, Viem, Ethers.js |
| Edge Functions | Deno (send-trade-email, polygon-verify, polygon-release) |
| Testing | Playwright 1.52.0 (E2E only) |
| CI/CD | GitHub Actions |

---

## File Structure

```
kepler-1/
├── frontend/               # Next.js app root (npm install here)
│   ├── app/                # App Router pages
│   ├── components/         # 13 shared UI components (PascalCase)
│   ├── lib/                # supabase/, web3/, types.ts, hooks
│   ├── globals.css         # Entire design system (45KB) — single source of truth
│   └── DESIGN_TOKENS.md    # Design token documentation
├── supabase/
│   ├── migrations/         # 001–016 SQL migration files
│   └── functions/          # Deno edge functions
├── scripts/                # Seed catalog, seed prices, webhook setup
└── .github/workflows/      # CI: lint, build, Playwright
```

---

## Development

```bash
cd frontend
npm install
npm run dev       # http://localhost:3000 (or 5000 on Replit)
npm run build     # Production build
npx playwright test  # E2E tests (requires running dev server)
```

**Required `.env.local`:**
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID=
NEXT_PUBLIC_CHAIN=amoy|polygon
NEXT_PUBLIC_MERCHANT_WALLET=0x...
```

---

## Code Conventions

### TypeScript
- Strict mode enabled (`tsconfig.json`)
- All shared interfaces live in `frontend/lib/types.ts`
- Import alias: `@/*` maps to `frontend/*`

### React / Next.js
- `'use client'` on every interactive component that uses hooks or event handlers
- Server components for data-heavy pages (fetch on server, pass as props)
- Modals are state-driven (boolean open/close) and close on Escape
- Direct Supabase queries with `useEffect` — React Query is imported but not heavily used

### CSS & Design
- **Never introduce new CSS colors** — use variables defined in `globals.css`
- All styles go in `globals.css` — there are no per-component CSS files
- Follow existing BEM-lite class naming (`.nav-item`, `.hero-btn`, `.lot-card`)
- Breakpoints: 400px, 768px, 1024px
- z-index: nav = 200, modals = higher

### Database
- Every schema change is a new numbered migration file in `supabase/migrations/`
- Complex trade logic lives in PostgreSQL functions, not application code
- RLS policies exist on all user-facing tables — always test with a real user session
- Never bypass RLS for convenience

### Web3
- Wallet private keys and secrets stay in Supabase secrets — never client-side
- USDC contract addresses are in `frontend/lib/web3/usdc.ts`
- Payment flows: verify via `polygon-verify` edge function, release via `polygon-release`

---

## Key Patterns to Follow

1. **One CSS file** — `globals.css` only. No module CSS, no Tailwind classes at runtime.
2. **RLS-first** — assume every DB operation is subject to row-level security.
3. **PostgreSQL for logic** — trade state machines belong in SQL functions, not JS.
4. **No new abstractions** unless the code is used 3+ times in unrelated places.
5. **No backwards-compat shims** — if something is removed, delete it cleanly.
6. **No speculative features** — implement exactly what was asked.

---

## Database Migration Workflow

1. Write new SQL in `supabase/migrations/0XX_description.sql`
2. Apply via Supabase Dashboard (SQL Editor) or `supabase db push`
3. Update `frontend/lib/types.ts` if schema changes affect TypeScript interfaces
4. Never modify existing migrations — always add a new one

---

## Testing

- Playwright E2E tests only — no unit test framework configured
- Tests run against a live dev server at `localhost:3000`
- CI runs on every push to `main` and on PRs
- 2 retries in CI; headless Chromium only

