# Supabase Backup Guide

## Point-In-Time Recovery (PITR)

PITR allows restoring the database to any second within the retention window.

### Enable PITR

1. Open the [Supabase Dashboard](https://supabase.com/dashboard)
2. Select the **Kepler** project (`yquwasetajootlgmyxan`)
3. Go to **Settings → Database**
4. Scroll to **Backups**
5. Toggle **Point-In-Time Recovery** to ON
6. Choose a retention period (7 days on Pro, up to 90 days on Enterprise)

> PITR requires the **Pro plan** ($25/month). The free tier only has daily backups.

### Restore from PITR

1. Dashboard → Settings → Database → Backups
2. Click **Restore**
3. Select the target timestamp
4. Confirm — a new database is provisioned; the old one is not overwritten

---

## Daily Backups (Free Tier)

The free tier automatically takes **daily logical backups** retained for **7 days**.

### Download a backup

1. Dashboard → Settings → Database → Backups
2. Click the download icon next to the date you want
3. The backup is a `.sql` file you can restore with `psql`

### Restore a downloaded backup

```bash
psql \
  --host=db.yquwasetajootlgmyxan.supabase.co \
  --port=5432 \
  --username=postgres \
  --dbname=postgres \
  < backup.sql
```

---

## Manual Backup via pg_dump

For on-demand snapshots before migrations or major changes:

```bash
pg_dump \
  "postgresql://postgres:[SERVICE_KEY]@db.yquwasetajootlgmyxan.supabase.co:5432/postgres" \
  --schema=public \
  --no-owner \
  --no-acl \
  -f kepler_$(date +%Y%m%d_%H%M%S).sql
```

Replace `[SERVICE_KEY]` with your Supabase service role password (found in Settings → Database → Connection string).

---

## Seed Script

To repopulate `catalog_cards` from the TCGdex API:

```bash
# Set the service key first
export SUPABASE_SERVICE_KEY=your-service-role-key

# Run from the repo root
node scripts/seed-catalog.mjs
```

The script checks for existing `tcgdex_id` values before inserting to avoid duplicates.
