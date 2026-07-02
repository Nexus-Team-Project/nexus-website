/**
 * Vitest config for the nexus-website backend.
 * Uses a single in-memory MongoDB started once in tests/globalSetup.ts (its URI
 * injected per file by tests/setup.ts) so unit and integration tests do not
 * depend on a real database and do not spin up a mongod per test file.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // One shared in-memory MongoDB for the whole run (globalSetup), whose URI is
    // injected into each file by setup.ts - avoids spinning up a mongod per file.
    globalSetup: ['./tests/globalSetup.ts'],
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    pool: 'forks',
    forks: { singleFork: true },
  },
});
