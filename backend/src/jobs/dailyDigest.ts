import { CronJob } from 'cron';
import { prisma } from '../config/database';
import { sendDailyDigest } from '../services/email.service';
import { env } from '../config/env';

export function scheduleDailyDigest(): void {
  // Run every day at 09:00 Israel time (UTC+2/+3)
  const job = new CronJob(
    '0 7 * * *', // 07:00 UTC = 09:00 IL (winter) / 10:00 IL (summer)
    async () => {
      try {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        yesterday.setHours(0, 0, 0, 0);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const [visitors, chats, leads, pendingChats, signupsRows] = await Promise.all([
          prisma.pageView
            .groupBy({ by: ['visitorId'], where: { createdAt: { gte: yesterday, lt: today } } })
            .then((r) => r.length),
          prisma.chatSession.count({ where: { createdAt: { gte: yesterday, lt: today } } }),
          prisma.lead.count({ where: { createdAt: { gte: yesterday, lt: today } } }),
          prisma.chatSession.count({ where: { status: 'PENDING_HUMAN' } }),
          prisma.$queryRaw<[{ count: bigint }]>`
            SELECT COUNT(DISTINCT "userId")::int AS count FROM "EventLog"
            WHERE "eventName" = 'User_Signed_Up'
              AND "receivedAt" >= ${yesterday} AND "receivedAt" < ${today}`,
        ]);
        const signups = Number(signupsRows[0]?.count ?? 0);

        const dateStr = yesterday.toLocaleDateString('he-IL', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        });

        // Send daily digest to the agent email
        const agentEmail = process.env.AGENT_EMAIL;
        if (agentEmail) {
          await sendDailyDigest(agentEmail, {
            visitors,
            chats,
            leads,
            signups,
            pendingChats,
            date: dateStr,
          });
          console.log(`[DailyDigest] Sent: v=${visitors} c=${chats} l=${leads} s=${signups}`);
        }
      } catch (err) {
        console.error('[DailyDigest] Error:', err);
      }
    },
    null,
    true,
    'UTC',
  );

  job.start();
  console.log('[DailyDigest] Cron job scheduled');
}
