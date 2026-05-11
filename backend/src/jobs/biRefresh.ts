import { CronJob } from 'cron';
import { prisma } from '../config/database';

// Pre-built safe SQL for each view — avoids $executeRawUnsafe and dynamic string interpolation.
const VIEW_REFRESH_QUERIES: Array<{ name: string; sql: () => Promise<unknown> }> = [
  { name: 'bi_payments',          sql: () => prisma.$executeRaw`REFRESH MATERIALIZED VIEW CONCURRENTLY bi_payments` },
  { name: 'bi_marketing_funnel',  sql: () => prisma.$executeRaw`REFRESH MATERIALIZED VIEW CONCURRENTLY bi_marketing_funnel` },
  { name: 'bi_account_activity',  sql: () => prisma.$executeRaw`REFRESH MATERIALIZED VIEW CONCURRENTLY bi_account_activity` },
  { name: 'bi_top_pages',         sql: () => prisma.$executeRaw`REFRESH MATERIALIZED VIEW CONCURRENTLY bi_top_pages` },
];

export async function refreshBiViews(): Promise<void> {
  for (const { name, sql } of VIEW_REFRESH_QUERIES) {
    try {
      await sql();
      console.log(`[BI] Refreshed ${name}`);
    } catch (err: any) {
      // Views may not exist yet (bi_views.sql not yet applied) — log and continue
      console.warn(`[BI] Could not refresh ${name}: ${err?.message ?? err}`);
    }
  }
}

export function scheduleBiRefresh(): void {
  // Run every hour at :05 to avoid contention with other scheduled tasks
  const job = new CronJob(
    '5 * * * *',
    async () => {
      try {
        await refreshBiViews();
      } catch (err) {
        console.error('[BI] Refresh error:', err);
      }
    },
    null,
    true,
    'UTC',
  );

  job.start();
  console.log('[BI] Materialized view refresh cron job scheduled (hourly at :05)');
}
