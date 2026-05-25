/**
 * Vitest setup: provides test-time defaults for required env vars so
 * importing src/config/env.ts in any test does not crash with
 * 'Invalid environment variables', and starts an in-memory MongoDB once
 * per test process exposing its URI via process.env.TEST_MONGODB_URI.
 *
 * Each test file connects to TEST_MONGODB_URI and uses a fresh per-test
 * database name.
 */
import { MongoMemoryServer } from 'mongodb-memory-server';
import { beforeAll, afterAll } from 'vitest';

// Required env-var stubs - set BEFORE any module that imports env.ts.
// env.ts validates with Zod at module load and calls process.exit(1)
// on failure, which would crash the whole test process.
process.env.NODE_ENV = 'test';
process.env.FRONTEND_URL ??= 'http://localhost:8080';
process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test';
process.env.MONGODB_URI ??= 'mongodb://localhost:27017';
process.env.MONGODB_DB ??= 'nexus_test';
process.env.ACCESS_TOKEN_SECRET ??= 'test-access-secret-with-at-least-32-characters!!';
process.env.REFRESH_TOKEN_SECRET ??= 'test-refresh-secret-with-at-least-32-characters!';
process.env.GOOGLE_CLIENT_ID ??= 'test-google-client-id';

let mongod: MongoMemoryServer | undefined;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.TEST_MONGODB_URI = mongod.getUri();
});

afterAll(async () => {
  if (mongod) await mongod.stop();
});
