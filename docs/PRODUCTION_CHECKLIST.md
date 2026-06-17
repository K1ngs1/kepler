# Kepler — Production Deployment Checklist

End-to-end steps to take Kepler live on **Vercel** (frontend) + **Supabase**
(database, auth, edge functions) + **Polygon** (USDC). Work top to bottom.

> The live Supabase project is dashboard-managed with **no migration tracking**.
> Apply migrations manually and in order, or adopt the Supabase CLI (below).

---

## 1. Supabase — database

1. Apply **all** migrations `001` → `020` in order via the SQL editor (or
   `supabase db push`). If the DB already existed, at minimum confirm the
   reconcile + integrity migrations are applied:
   - `019_reconcile_schema_drift.sql` — adds `user_cards.photo_url`, drops the
     `trade_offers.middleman_*` columns, ensures `rate_trade`.
   - `020_payment_integrity.sql` — server-only payment columns trigger + tx
     replay indexes + `release_claimed_at`.
2. **Adopt tracked migrations going forward** (prevents the drift that has bitten
   this project): install the Supabase CLI, `supabase link --project-ref
   yquwasetajootlgmyxan`, then use `supabase db push` for all future changes.
3. Verify Row-Level Security is enabled on every user-facing table (it is, in
   migrations 001/005/007/012). The `tests/rls.spec.ts` suite asserts isolation.

## 2. Supabase — storage

- Create a **public** bucket `card-photos` (512KB limit; `image/jpeg,png,webp`).
- Apply the storage.objects policies documented at the top of
  `supabase/migrations/004_card_photos.sql` (public read; owner-scoped
  insert/update/delete by `auth.uid()` folder).

## 3. Supabase — edge functions

Deploy from the repo root so `supabase/config.toml` (per-function `verify_jwt`)
is honoured:

```bash
supabase functions deploy polygon-verify     # verify_jwt = true  (user-called)
supabase functions deploy polygon-release     # verify_jwt = false (webhook)
supabase functions deploy send-trade-email     # verify_jwt = false (webhook)
```

Set function secrets:

```bash
supabase secrets set MERCHANT_WALLET=0x...            # receives buyer USDC
supabase secrets set MERCHANT_PRIVATE_KEY=0x...       # hot wallet that pays sellers
supabase secrets set POLYGON_RPC_URL=https://...       # production RPC (not the public default)
supabase secrets set RELEASE_WEBHOOK_SECRET=$(openssl rand -hex 32)
supabase secrets set RESEND_API_KEY=re_...             # send-trade-email
# Optional hardening: ALLOWED_ORIGIN=https://<your-domain>
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` are injected
automatically — do **not** set them.

## 4. Supabase — database webhooks (Dashboard → Database → Webhooks)

| Webhook | Table / Event | Calls | Required header |
|---|---|---|---|
| New trade offer email | `trade_offers` INSERT | `send-trade-email` | `Authorization: Bearer <service key>` |
| New message email | `trade_messages` INSERT | `send-trade-email` | `Authorization: Bearer <service key>` |
| Release funds | `trade_offers` UPDATE (status → `completed`) | `polygon-release` | `x-release-secret: <RELEASE_WEBHOOK_SECRET>` |

> The `x-release-secret` header is **mandatory** — `polygon-release` rejects any
> call without it (401). Use the exact value set in step 3.

## 5. Merchant wallet

- Fund the merchant wallet with enough USDC + native gas (MATIC/POL) to cover
  seller payouts.
- Monitor its balance; releases fail (and the trade stays claimed for manual
  reconciliation) if it can't cover a payout.

## 6. Vercel — frontend

1. Import the repo; set **Root Directory = `frontend`**.
2. Framework preset: Next.js (build `npm run build`, output handled by Next).
3. Environment variables (Production):

   | Variable | Notes |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | public |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public |
   | `NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID` | public |
   | `NEXT_PUBLIC_CHAIN` | see §7 |
   | `NEXT_PUBLIC_MERCHANT_WALLET` | public; must match the function `MERCHANT_WALLET` |
   | `SUPABASE_SERVICE_ROLE_KEY` | **server-only** — used by `app/api/*` routes (shipping, trade-items). Never `NEXT_PUBLIC_`. |

   `lib/env.ts` validates the public vars at boot and **fails the build/start**
   if a required one is missing or malformed — so a misconfigured deploy won't
   silently ship.

## 7. Chain configuration (decision required)

There is a naming inconsistency to resolve before mainnet:
- `lib/web3/config.ts` selects chain by `NEXT_PUBLIC_CHAIN`: `mainnet` → Polygon,
  `amoy` → Polygon Amoy, **anything else → Arc testnet**.
- CLAUDE.md documents the value set as `amoy|polygon`.

For production on Polygon, set `NEXT_PUBLIC_CHAIN=mainnet` (current code), or
standardize the code+docs on `polygon` first. Confirm `USDC_ADDRESS` and the
block-explorer link (`BLOCK_EXPLORER_TX`) resolve to the intended network.

## 8. Post-deploy verification

- `GET /api/health` → `{ status: "ok", db: "ok" }` (200).
- Sign in (Google + email/password), create a listing (with a photo), make an
  offer, pay on testnet, confirm `polygon-verify` sets `payment_status`,
  complete the trade, confirm `polygon-release` pays the seller once.
- Re-deliver the release webhook → second call is a no-op (atomic claim).

## 9. Observability (recommended)

- Structured logs are emitted by `lib/logger.ts` (JSON in production) — ship
  Vercel/Supabase logs to your aggregator.
- For error tracking, run `npx @sentry/wizard -i nextjs` in `frontend/` and set
  `NEXT_PUBLIC_SENTRY_DSN`; funnel through `lib/error-handler.ts`.
