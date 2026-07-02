/**
 * Vitest setup (per test file): provides test-time defaults for required env
 * vars so importing src/config/env.ts does not crash with 'Invalid environment
 * variables', and exposes the shared in-memory MongoDB's URI (started once in
 * tests/globalSetup.ts) via process.env.TEST_MONGODB_URI.
 *
 * Each test file connects to TEST_MONGODB_URI and uses a fresh per-file
 * database name, so all files safely share the one server.
 */
import { beforeAll, inject } from 'vitest';

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

// Point this file at the single shared server (URI provided by globalSetup).
// Runs before each file's own beforeAll, which reads TEST_MONGODB_URI.
beforeAll(() => {
  process.env.TEST_MONGODB_URI = inject('mongoUri');
});
