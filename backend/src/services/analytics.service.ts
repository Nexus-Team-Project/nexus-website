import { EventChannel, Prisma } from '@prisma/client';
import { prisma } from '../config/database';

// ─── Types ────────────────────────────────────────────────

export interface IngestPayload {
  // Identity
  anonymousId: string;
  userId?: string;
  // Event
  eventName: string;
  channel: EventChannel;
  properties: Record<string, unknown>;
  // Context (device, page, campaign, etc.) — assembled by the frontend hook
  context: Record<string, unknown>;
  sentAt?: string; // ISO timestamp from client
  // Merge source used by identify calls
  mergeSource?: 'signup' | 'login' | 'oauth';
}

// ─── Unified ingest (Source of Truth) ────────────────────

export async function ingest(data: IngestPayload): Promise<void> {
  const {
    anonymousId,
    userId,
    eventName,
    channel,
    properties,
    context,
    sentAt,
    mergeSource,
  } = data;

  // [1] Identity Resolution — merge anonymous → authenticated
  let accountId: string | null = null;
  if (userId) {
    // Resolve account from User record
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { accountId: true },
    });
    accountId = user?.accountId ?? null;

    // Upsert identity map and backfill existing anonymous events
    await prisma.identityMap.upsert({
      where: { anonymousId_userId: { anonymousId, userId } },
      create: { anonymousId, userId, mergeSource: mergeSource ?? 'login' },
      update: {},
    });

    // Backfill: update EventLog rows that belong to this anonymous ID
    await prisma.eventLog.updateMany({
      where: { anonymousId, userId: null },
      data: { userId, accountId },
    });
  }

  // [2] Persist to EventLog (Source of Truth)
  await prisma.eventLog.create({
    data: {
      anonymousId,
      userId: userId ?? null,
      accountId,
      eventName,
      channel,
      properties: properties as Prisma.InputJsonValue,
      context: context as Prisma.InputJsonValue,
      sentAt: sentAt ? new Date(sentAt) : null,
    },
  });

  // [3] Async aggregation — keep legacy PageView + VisitorProfile in sync
  //     (fire-and-forget — errors here don't fail the request)
  void aggregateLegacy(data, accountId).catch(() => {});
}

async function aggregateLegacy(
  data: IngestPayload,
  _accountId: string | null,
): Promise<void> {
  const { anonymousId, userId, eventName, properties, context } = data;

  if (eventName === 'Page_Viewed') {
    const page = String((properties as any).page_path ?? '/');
    const referrer = String((context as any).page?.referrer ?? '');
    const userAgent = String((context as any).userAgent ?? '');
    const ip = String((context as any).ip ?? '');
    const country = String((context as any).device?.country ?? '');
    const language = String((context as any).locale ?? '');
    const device = String((context as any).device?.type ?? '');
    const browser = String((context as any).device?.browser ?? '');

    await prisma.$transaction([
      prisma.pageView.create({
        data: {
          visitorId: anonymousId,
          userId: userId ?? undefined,
          page,
          referrer: referrer || undefined,
          userAgent: userAgent || undefined,
          ipAddress: ip || undefined,
          country: country || undefined,
          language: language || undefined,
        },
      }),
      prisma.visitorProfile.upsert({
        where: { visitorId: anonymousId },
        create: {
          visitorId: anonymousId,
          pageViewCount: 1,
          pageViews: 1,
          ip: ip || undefined,
          country: country || undefined,
          device: device || undefined,
          browser: browser || undefined,
        },
        update: {
          pageViewCount: { increment: 1 },
          pageViews: { increment: 1 },
          lastSeen: new Date(),
          ip: ip || undefined,
          country: country || undefined,
          device: device || undefined,
          browser: browser || undefined,
        },
      }),
    ]);
  } else {
    // Generic VisitorEvent for non-page events
    await prisma.visitorEvent.create({
      data: {
        visitorId: anonymousId,
        userId: userId ?? undefined,
        eventType: eventName,
        metadata: properties as Prisma.InputJsonValue,
      },
    });
  }
}

// ─── Legacy helpers (kept for backwards compatibility) ────

export async function trackPageView(data: {
  visitorId: string;
  userId?: string;
  page: string;
  referrer?: string;
  userAgent?: string;
  ipAddress?: string;
  country?: string;
  language?: string;
}) {
  await ingest({
    anonymousId: data.visitorId,
    userId: data.userId,
    eventName: 'Page_Viewed',
    channel: EventChannel.MARKETING,
    properties: { page_path: data.page },
    context: {
      page: { referrer: data.referrer },
      userAgent: data.userAgent,
      ip: data.ipAddress,
      locale: data.language,
    },
  });
}

export async function trackEvent(data: {
  visitorId: string;
  userId?: string;
  eventType: string;
  metadata?: Record<string, unknown>;
}) {
  await ingest({
    anonymousId: data.visitorId,
    userId: data.userId,
    eventName: data.eventType,
    channel: EventChannel.PRODUCT,
    properties: data.metadata ?? {},
    context: {},
  });
}

// ─── Visitor profile ──────────────────────────────────────

export async function getVisitorProfile(visitorId: string) {
  return prisma.visitorProfile.findUnique({ where: { visitorId } });
}

export async function isNewVisitorToday(visitorId: string): Promise<boolean> {
  const profile = await prisma.visitorProfile.findUnique({ where: { visitorId } });
  if (!profile) return true;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return profile.lastSeen < today;
}

// ─── Summary (admin) ──────────────────────────────────────

export async function getAnalyticsSummary(periodDays = 7) {
  const since = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);

  const [totalPageViews, uniqueVisitors, events] = await Promise.all([
    prisma.pageView.count({ where: { createdAt: { gte: since } } }),
    prisma.pageView
      .groupBy({ by: ['visitorId'], where: { createdAt: { gte: since } } })
      .then((r) => r.length),
    prisma.visitorEvent.groupBy({
      by: ['eventType'],
      _count: { eventType: true },
      where: { createdAt: { gte: since } },
    }),
  ]);

  return { totalPageViews, uniqueVisitors, events, periodDays };
}
