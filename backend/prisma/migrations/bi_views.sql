-- BI Materialized Views — Run once after migration
-- These views flatten EventLog JSON into queryable columns for BI tools (Metabase, Grafana, etc.)
-- Refresh: REFRESH MATERIALIZED VIEW CONCURRENTLY <view_name>;

-- ─── 1. bi_payments ─────────────────────────────────────────────────────────
-- Flattened Payment_Completed events, enriched with account data.
-- Use for: revenue dashboards, payment method breakdown, account-level revenue.

CREATE MATERIALIZED VIEW IF NOT EXISTS bi_payments AS
SELECT
  el.id,
  el."userId",
  el."accountId",
  el."receivedAt"::date                           AS event_date,
  el.properties->>'order_id'                      AS order_id,
  (el.properties->>'amount_cents')::int / 100.0   AS amount,
  el.properties->>'currency'                      AS currency,
  el.properties->>'payment_method'                AS payment_method,
  a.name                                          AS account_name,
  a.type::text                                    AS account_type,
  a.plan                                          AS account_plan
FROM "EventLog" el
LEFT JOIN "Account" a ON el."accountId" = a.id
WHERE el."eventName" = 'Payment_Completed';

CREATE UNIQUE INDEX IF NOT EXISTS bi_payments_id_idx ON bi_payments (id);
CREATE INDEX IF NOT EXISTS bi_payments_date_idx ON bi_payments (event_date);
CREATE INDEX IF NOT EXISTS bi_payments_account_idx ON bi_payments ("accountId");

-- ─── 2. bi_marketing_funnel ──────────────────────────────────────────────────
-- Daily marketing funnel: Visitors → CTA clicks → Chat opens → Signups.
-- Use for: conversion rate analysis, campaign effectiveness, daily trends.

CREATE MATERIALIZED VIEW IF NOT EXISTS bi_marketing_funnel AS
SELECT
  DATE("receivedAt") AS date,
  COUNT(DISTINCT "anonymousId")
    FILTER (WHERE "eventName" = 'Page_Viewed')            AS unique_visitors,
  COUNT(*)
    FILTER (WHERE "eventName" = 'Page_Viewed')            AS page_views,
  COUNT(*)
    FILTER (WHERE "eventName" = 'Hero_CTA_Clicked')       AS hero_cta_clicks,
  COUNT(*)
    FILTER (WHERE "eventName" = 'Navbar_CTA_Clicked')     AS navbar_cta_clicks,
  COUNT(*)
    FILTER (WHERE "eventName" = 'Pricing_Section_Viewed') AS pricing_section_views,
  COUNT(*)
    FILTER (WHERE "eventName" = 'Chat_Widget_Opened')     AS chat_opens,
  COUNT(*)
    FILTER (WHERE "eventName" = 'Signup_Page_Viewed')     AS signup_page_views,
  -- User_Signed_Up / User_Logged_In are PRODUCT channel — no channel filter here
  COUNT(DISTINCT "userId")
    FILTER (WHERE "eventName" = 'User_Signed_Up')         AS signups,
  COUNT(DISTINCT "userId")
    FILTER (WHERE "eventName" = 'User_Logged_In')         AS logins
FROM "EventLog"
WHERE channel IN ('MARKETING', 'PRODUCT')
GROUP BY DATE("receivedAt");

CREATE UNIQUE INDEX IF NOT EXISTS bi_marketing_funnel_date_idx ON bi_marketing_funnel (date);

-- ─── 3. bi_account_activity ──────────────────────────────────────────────────
-- Per-account activity summary (B2B focus).
-- Use for: account health dashboards, churn detection, top accounts by revenue.

CREATE MATERIALIZED VIEW IF NOT EXISTS bi_account_activity AS
SELECT
  a.id                                                    AS account_id,
  a.name                                                  AS account_name,
  a.type::text                                            AS account_type,
  a.plan                                                  AS account_plan,
  COUNT(DISTINCT el."userId")                             AS active_users,
  COUNT(el.id)                                            AS total_events,
  MAX(el."receivedAt")                                    AS last_activity,
  MIN(el."receivedAt")                                    AS first_activity,
  COUNT(el.id)
    FILTER (WHERE el."eventName" = 'Payment_Completed')   AS payments_count,
  COALESCE(SUM((el.properties->>'amount_cents')::int)
    FILTER (WHERE el."eventName" = 'Payment_Completed'), 0) / 100.0 AS total_revenue,
  COUNT(el.id)
    FILTER (WHERE el."eventName" = 'Chat_Session_Started') AS chat_sessions,
  COUNT(el.id)
    FILTER (WHERE el."eventName" = 'Payment_Failed')       AS payment_failures
FROM "Account" a
LEFT JOIN "EventLog" el ON a.id = el."accountId"
GROUP BY a.id, a.name, a.type, a.plan;

CREATE UNIQUE INDEX IF NOT EXISTS bi_account_activity_id_idx ON bi_account_activity (account_id);

-- ─── 4. bi_top_pages ─────────────────────────────────────────────────────────
-- Most visited pages with unique visitor counts.
-- Use for: content performance, SEO, UX optimization.

CREATE MATERIALIZED VIEW IF NOT EXISTS bi_top_pages AS
SELECT
  properties->>'page_path'                        AS page_path,
  COUNT(*)                                        AS total_views,
  COUNT(DISTINCT "anonymousId")                   AS unique_visitors,
  DATE_TRUNC('week', "receivedAt")                AS week
FROM "EventLog"
WHERE "eventName" = 'Page_Viewed'
GROUP BY properties->>'page_path', DATE_TRUNC('week', "receivedAt");

CREATE INDEX IF NOT EXISTS bi_top_pages_week_idx ON bi_top_pages (week);

-- ─── Refresh function (call from cron job) ────────────────────────────────────
-- In backend/src/jobs/, add a job that runs this every hour:
--   await prisma.$executeRawUnsafe('REFRESH MATERIALIZED VIEW CONCURRENTLY bi_payments');
--   await prisma.$executeRawUnsafe('REFRESH MATERIALIZED VIEW CONCURRENTLY bi_marketing_funnel');
--   await prisma.$executeRawUnsafe('REFRESH MATERIALIZED VIEW CONCURRENTLY bi_account_activity');
--   await prisma.$executeRawUnsafe('REFRESH MATERIALIZED VIEW CONCURRENTLY bi_top_pages');

-- ─── Read-only BI user ────────────────────────────────────────────────────────
-- Run separately as superuser when connecting a BI tool (Metabase, Grafana, Superset):
-- CREATE USER bi_readonly WITH PASSWORD '<strong-password>';
-- GRANT CONNECT ON DATABASE nexus TO bi_readonly;
-- GRANT SELECT ON bi_payments, bi_marketing_funnel, bi_account_activity, bi_top_pages TO bi_readonly;
-- GRANT SELECT ON "Account", "User", "Order" TO bi_readonly;  -- for joins in ad-hoc queries
