/**
 * Vitest setup: starts an in-memory MongoDB once per test process and
 * exports its URI via process.env.TEST_MONGODB_URI. Tests connect to
 * that URI and drop their own per-test databases.
 */
import { MongoMemoryServer } from 'mongodb-memory-server';
import { beforeAll, afterAll } from 'vitest';

let mongod: MongoMemoryServer | undefined;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.TEST_MONGODB_URI = mongod.getUri();
  process.env.NODE_ENV = 'test';
});

afterAll(async () => {
  if (mongod) await mongod.stop();
});
