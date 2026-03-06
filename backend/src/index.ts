import 'dotenv/config'; // Load .env before anything else
import http from 'http';
import app from './app';
import { initSocket } from './socket';
import { env } from './config/env';
import { prisma } from './config/database';
import { scheduleDailyDigest } from './jobs/dailyDigest';

const PORT = env.PORT;

async function bootstrap() {
  // 1. Test DB connection
  try {
    await prisma.$connect();
    console.log('✅ Database connected');

    // Ensure pgvector extension + embedding column exist (Prisma can't manage vector types)
    await prisma.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS vector;');
    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'KnowledgeChunk' AND column_name = 'embedding'
        ) THEN
          ALTER TABLE "KnowledgeChunk" ADD COLUMN embedding vector(1536);
        END IF;
      END $$;
    `);
  } catch (err) {
    console.error('❌ Database connection failed:', err);
    process.exit(1);
  }

  // 2. Create HTTP server + Socket.io
  const httpServer = http.createServer(app);
  initSocket(httpServer);
  console.log('✅ Socket.io initialized');

  // 3. Schedule cron jobs
  scheduleDailyDigest();
  console.log('✅ Cron jobs scheduled');

  // 4. Start listening
  httpServer.listen(PORT, () => {
    console.log(`🚀 Nexus backend running on port ${PORT} [${env.NODE_ENV}]`);
  });

  // 5. Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('SIGTERM received — shutting down gracefully');
    httpServer.close(async () => {
      await prisma.$disconnect();
      console.log('Server closed');
      process.exit(0);
    });
  });
}

bootstrap().catch((err) => {
  console.error('Bootstrap failed:', err);
  process.exit(1);
});
