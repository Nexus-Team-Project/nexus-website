/**
 * Purpose: Delete one Prisma login account from PostgreSQL by email.
 *
 * This script is for resetting the website-login side of Nexus. It does not
 * touch MongoDB domain records. It runs as a dry run unless `--apply` is used.
 */
/// <reference types="node" />
import 'dotenv/config';

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type ScriptArgs = {
  email: string;
  apply: boolean;
};

/**
 * Reads command-line arguments for the cleanup script.
 *
 * Inputs:
 * - process.argv values passed by Node/tsx.
 * - Optional env fallback when npm consumes flags on Windows.
 *
 * Output:
 * - The normalized email to delete and whether destructive writes are allowed.
 */
function parseArgs(argv: string[], env: NodeJS.ProcessEnv): ScriptArgs {
  const emailArg = argv.find((arg) => arg.startsWith('--email='));
  const email = (
    emailArg?.slice('--email='.length) ??
    env.NEXUS_DELETE_LOGIN_USER_EMAIL ??
    env.npm_config_email
  )
    ?.trim()
    .toLowerCase();

  if (!email) {
    throw new Error(
      'Missing required email. Use --email=<user@example.com> or NEXUS_DELETE_LOGIN_USER_EMAIL.',
    );
  }

  return {
    email,
    apply:
      argv.includes('--apply') ||
      env.NEXUS_DELETE_LOGIN_USER_APPLY === 'true' ||
      env.npm_config_apply === 'true',
  };
}

/**
 * Counts the Prisma login rows related to one email.
 *
 * Inputs:
 * - email: normalized account email.
 *
 * Output:
 * - Counts for rows this script will delete or detach.
 */
async function collectCounts(email: string) {
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
 * - email: normalized account email.
 *
 * Output:
 * - No return value. Throws if the database operation fails.
 */
async function deleteLoginUser(email: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { email },
      select: { id: true },
    });

    await tx.pendingRegistration.deleteMany({ where: { email } });

    if (!user) {
      return;
    }

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

/**
 * Runs the CLI script.
 *
 * Inputs:
 * - Uses command-line flags and DATABASE_URL from backend environment.
 *
 * Output:
 * - Prints a dry-run or applied cleanup summary.
 */
async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2), process.env);
  const counts = await collectCounts(args.email);

  console.log(JSON.stringify({ email: args.email, apply: args.apply, counts }, null, 2));

  if (!args.apply) {
    console.log('Dry run only. Re-run with --apply to delete this Prisma login account.');
    return;
  }

  await deleteLoginUser(args.email);
  console.log(`Deleted Prisma login account data for ${args.email}. MongoDB was not changed.`);
}

main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Failed to delete Prisma login user: ${message}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
