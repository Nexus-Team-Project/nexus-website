/**
 * Owns the backend-only MongoDB Atlas connection.
 * The dashboard and website must never read MongoDB credentials directly.
 */
import { Db, MongoClient } from 'mongodb';
import { env } from './env';

let client: MongoClient | null = null;
let database: Db | null = null;

/**
 * Returns the singleton MongoDB client for this backend process.
 * Input: none.
 * Output: connected MongoClient reused by all route handlers.
 */
export async function getMongoClient(): Promise<MongoClient> {
  if (client) return client;

  client = new MongoClient(env.MONGODB_URI, {
    tls: true,
    retryWrites: true,
    retryReads: true,
    serverSelectionTimeoutMS: 30_000,
    connectTimeoutMS: 30_000,
    socketTimeoutMS: 360_000,
    maxPoolSize: 10,
    minPoolSize: 1,
  });
  await client.connect();
  return client;
}

/**
 * Returns the configured Nexus Mongo database.
 * Input: none.
 * Output: MongoDB database selected by MONGODB_DB.
 */
export async function getMongoDb(): Promise<Db> {
  if (database) return database;

  const mongoClient = await getMongoClient();
  database = mongoClient.db(env.MONGODB_DB);
  return database;
}

/**
 * Verifies MongoDB connectivity during backend startup.
 * Input: none.
 * Output: resolves when ping succeeds, throws when Atlas is unavailable.
 */
export async function verifyMongoConnection(): Promise<void> {
  const db = await getMongoDb();
  await db.command({ ping: 1 });
}

/**
 * Closes the MongoDB client during graceful shutdown.
 * Input: none.
 * Output: active Mongo sockets are closed.
 */
export async function closeMongoConnection(): Promise<void> {
  if (!client) return;
  await client.close();
  client = null;
  database = null;
}
