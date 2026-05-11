/**
 * Purpose: Delete one Nexus login account from PostgreSQL through Prisma.
 *
 * This module only touches login/session compatibility data. MongoDB cleanup
 * is handled by a separate module.
 */
import type { PrismaClient } from '@prisma/client';

/**
 * Counts the Prisma login rows related to one email.
 *
 * Inputs:
 * - prisma: Prisma client connected through DATABASE_URL.
 * - email: normalized account email.
 *
 * Output:
 * - Counts for rows this script will delete or detach.
 */
export async function collectPrismaCounts(prisma: PrismaClient, email: string) {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, fullName: true },
  });

  const pendingRegistrations = await prisma.pendingRegistration.count({
    where: { email },
  });

  if (!user) {
    return {
      user,
      pendingRegistrations,
      refreshTokens: 0,
      passwordResets: 0,
      organizationMemberships: 0,
      pushSubscriptions: 0,
      chatSessionsToDetach: 0,
      ordersToDetach: 0,
    };
  }

  const [
    refreshTokens,
    passwordResets,
    organizationMemberships,
    pushSubscriptions,
    chatSessionsToDetach,
    ordersToDetach,
  ] = await Promise.all([
    prisma.refreshToken.count({ where: { userId: user.id } }),
    prisma.passwordReset.count({ where: { userId: user.id } }),
    prisma.organizationMember.count({ where: { userId: user.id } }),
    prisma.pushSubscription.count({ where: { userId: user.id } }),
    prisma.chatSession.count({ where: { userId: user.id } }),
    prisma.order.count({ where: { userId: user.id } }),
  ]);

  return {
    user,
    pendingRegistrations,
    refreshTokens,
    passwordResets,
    organizationMemberships,
    pushSubscriptions,
    chatSessionsToDetach,
    ordersToDetach,
  };
}

/**
 * Deletes one Prisma login user and safe dependent login records.
 *
 * Inputs:
 * - prisma: Prisma client connected through DATABASE_URL.
 * - email: normalized account email.
 *
 * Output:
 * - No return value. Throws if the database operation fails.
 */
export async function deletePrismaLoginUser(prisma: PrismaClient, email: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { email },
      select: { id: true },
    });

    await tx.pendingRegistration.deleteMany({ where: { email } });

    if (!user) return;

    await tx.refreshToken.deleteMany({ where: { userId: user.id } });
    await tx.passwordReset.deleteMany({ where: { userId: user.id } });
    await tx.pushSubscription.deleteMany({ where: { userId: user.id } });
    await tx.organizationMember.deleteMany({ where: { userId: user.id } });

    // Keep legacy records for audit/history, but remove their user link.
    await tx.chatSession.updateMany({
      where: { userId: user.id },
      data: { userId: null },
    });
    await tx.order.updateMany({
      where: { userId: user.id },
      data: { userId: null },
    });

    await tx.user.delete({ where: { id: user.id } });
  });
}
