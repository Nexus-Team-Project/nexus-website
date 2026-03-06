# Metabase on Railway — Setup Guide

## 1. Create a new Railway service

In the Railway project dashboard:
- **New Service → GitHub Repo** → same repo
- Set **Root Directory** to `/metabase`
- Railway will detect the `Dockerfile` automatically

## 2. Environment variables (set in Railway dashboard)

| Variable | Value |
|----------|-------|
| `MB_DB_TYPE` | `postgres` |
| `MB_DB_HOST` | your Railway Postgres host |
| `MB_DB_PORT` | `5432` |
| `MB_DB_DBNAME` | your database name |
| `MB_DB_USER` | `bi_readonly` (see step 3) |
| `MB_DB_PASS` | the password you set for `bi_readonly` |
| `MB_SITE_URL` | the Railway public URL for this service |

> Metabase stores its own metadata (questions, dashboards, users) in the same DB by default.
> For production, use a separate Metabase-specific database or add `MB_DB_*` pointing to a dedicated DB.

## 3. Create the read-only PostgreSQL user (run once)

Connect to your production DB as superuser and run:

```sql
CREATE USER bi_readonly WITH PASSWORD '<choose-a-strong-password>';
GRANT CONNECT ON DATABASE nexus TO bi_readonly;
GRANT SELECT ON bi_payments, bi_marketing_funnel, bi_account_activity, bi_top_pages TO bi_readonly;
GRANT SELECT ON "Account", "User", "Order", "EventLog" TO bi_readonly;
```

## 4. Run the BI views migration (run once after prisma migrate)

```bash
psql $DATABASE_URL -f backend/prisma/migrations/bi_views.sql
```

## 5. First login

Navigate to the Metabase URL → complete the setup wizard → connect to the `bi_readonly` user.

Suggested initial questions:
- **Revenue over time**: `bi_payments` → group by `event_date`, sum `amount`
- **Daily funnel**: `bi_marketing_funnel` → all columns, sorted by `date`
- **Top accounts**: `bi_account_activity` → sort by `total_revenue` descending
- **Top pages**: `bi_top_pages` → sort by `unique_visitors` descending

## 6. Refresh schedule

The `biRefresh.ts` cron job runs every hour at `:05` and calls
`REFRESH MATERIALIZED VIEW CONCURRENTLY` on all 4 views automatically.
No manual setup required.
