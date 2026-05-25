/**
 * Vitest config for the nexus-website backend.
 * Uses an in-memory MongoDB started in tests/setup.ts so unit and
 * integration tests do not depend on a real database.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    pool: 'forks',
    forks: { singleFork: true },
  },
});
