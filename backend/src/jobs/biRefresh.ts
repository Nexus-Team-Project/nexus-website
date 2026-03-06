import { CronJob } from 'cron';
import { prisma } from '../config/database';

const VIEWS = [
  'bi_payments',
  'bi_marketing_funnel',
  'bi_account_activity',
  'bi_top_pages',
] as const;

export async function refreshBiViews(): Promise<void> {
  for (const view of VIEWS) {
    try {
      await prisma.$executeRawUnsafe(
        `REFRESH MATERIALIZED VIEW CONCURRENTLY ${view}`,
      );
      console.log(`[BI] Refreshed ${view}`);
    } catch (err: any) {
      // Views may not exist yet (bi_views.sql not yet applied) — log and continue
      console.warn(`[BI] Could not refresh ${view}: ${err?.message ?? err}`);
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
