/**
 * Purpose: CLI entrypoint for deleting one Nexus user by exact email.
 *
 * This script resets a person across PostgreSQL login data and MongoDB domain
 * data. It is dry-run by default and only deletes when `--apply` is provided.
 */
/// <reference types="node" />
import 'dotenv/config';

import { PrismaClient } from '@prisma/client';
import { closeMongoConnection } from '../../src/config/mongo';
import { collectMongoCounts, deleteMongoUser } from './mongo';
import { collectPrismaCounts, deletePrismaLoginUser } from './prisma';
import type { ScriptArgs } from './types';

const prisma = new PrismaClient();

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
 * Runs the CLI script.
 *
 * Inputs:
 * - Uses command-line flags, DATABASE_URL, MONGODB_URI, and MONGODB_DB.
 *
 * Output:
 * - Prints a dry-run or applied cleanup summary.
 */
async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2), process.env);
  const prismaCounts = await collectPrismaCounts(prisma, args.email);
  const mongoCounts = await collectMongoCounts(args.email, prismaCounts.user);

  console.log(JSON.stringify({ email: args.email, apply: args.apply, prismaCounts, mongoCounts }, null, 2));

  if (!args.apply) {
    console.log('Dry run only. Re-run with --apply to delete this login account from PostgreSQL and MongoDB.');
    return;
  }

  await deleteMongoUser(args.email, prismaCounts.user);
  await deletePrismaLoginUser(prisma, args.email);
  console.log(`Deleted login and Mongo domain data for ${args.email}.`);
}

main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Failed to delete Nexus user: ${message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await closeMongoConnection();
  });
