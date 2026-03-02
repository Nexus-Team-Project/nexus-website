import 'dotenv/config'; // Load .env before anything else
import http from 'http';
import path from 'path';
import { existsSync, readdirSync } from 'fs';
import app from './app';
import { initSocket } from './socket';
import { env } from './config/env';
import { prisma } from './config/database';
import { scheduleDailyDigest } from './jobs/dailyDigest';

// ── Debug: report frontend dist location at startup ──────
const _feDist = path.resolve(__dirname, '../public');
const _feExists = existsSync(_feDist);
const _feFiles = _feExists ? readdirSync(_feDist).slice(0, 5) : [];
console.log(`[startup] __dirname=${__dirname}`);
console.log(`[startup] frontendDist=${_feDist} | exists=${_feExists} | files=${JSON.stringify(_feFiles)}`);

const PORT = env.PORT;

async function bootstrap() {
  // 1. Test DB connection
  try {
    await prisma.$connect();
    console.log('✅ Database connected');
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
