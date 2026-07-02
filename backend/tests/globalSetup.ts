/**
 * Vitest globalSetup: starts ONE in-memory MongoDB for the ENTIRE test run and
 * shares its connection URI with every test file via `provide` / `inject`.
 *
 * Why: `tests/setup.ts` is a per-file setupFile, so it previously started a
 * fresh MongoMemoryServer for each of the ~13 test files. That repeated mongod
 * start/stop churn was the source of intermittent first-run failures (a file's
 * server not being ready, leaving its `client` undefined so `afterAll`'s
 * `client.close()` threw). Starting the server once here removes the churn.
 *
 * `setup` runs before any test file; `teardown` runs after the whole run.
 */
import type { GlobalSetupContext } from 'vitest/node';
import { MongoMemoryServer } from 'mongodb-memory-server';

let mongod: MongoMemoryServer | undefined;

export async function setup({ provide }: GlobalSetupContext): Promise<void> {
  mongod = await MongoMemoryServer.create();
  provide('mongoUri', mongod.getUri());
}

export async function teardown(): Promise<void> {
  await mongod?.stop();
}

// Types the value shared via provide/inject so `inject('mongoUri')` is typed.
declare module 'vitest' {
  interface ProvidedContext {
    mongoUri: string;
  }
}
