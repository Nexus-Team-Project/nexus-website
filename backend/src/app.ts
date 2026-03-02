import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import path from 'path';
import { existsSync } from 'fs';
import { env } from './config/env';
import { errorHandler } from './middleware/errorHandler';

// Routes
import authRoutes from './routes/auth.routes';
import chatRoutes from './routes/chat.routes';
import analyticsRoutes from './routes/analytics.routes';
import dashboardRoutes from './routes/dashboard.routes';
import leadsRoutes from './routes/leads.routes';
import adminRoutes from './routes/admin.routes';
import webhookRoutes from './routes/webhook.routes';
import paymentsRoutes from './routes/payments.routes';

const app = express();

// ─── Compression (gzip/brotli) ───────────────────────────
// Must be FIRST — compresses all responses including static files and API
app.use(compression());

// ─── Security headers ────────────────────────────────────
app.use(helmet());

// ─── CORS ────────────────────────────────────────────────
app.use(
  cors({
    origin: env.FRONTEND_URL,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
);

// ─── Webhook routes FIRST with raw body ──────────────────
// Raw body required for HMAC signature verification
app.use('/api/webhooks', express.raw({ type: 'application/json' }), webhookRoutes);

// ─── Body parsers for all other routes ───────────────────
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

// ─── Health check ─────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), env: env.NODE_ENV });
});

// ─── API Routes ───────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/leads', leadsRoutes);
app.use('/api/admin/ai', adminRoutes);
app.use('/api/payments', paymentsRoutes);

// ─── Serve frontend (SPA) ─────────────────────────────────
// __dirname = backend/dist/ → ../public = backend/public/ (Vite output copied there at build time)
const frontendDist = path.resolve(__dirname, '../public');
if (existsSync(frontendDist)) {
  // Hashed assets (JS/CSS/images with content-hash in filename) — cache forever
  app.use(
    '/assets',
    express.static(path.join(frontendDist, 'assets'), {
      redirect: false,
      maxAge: '1y',
      immutable: true,
    }),
  );
  // Other static files (favicons, robots.txt, images without hash) — 1-hour cache.
  // `index: false` prevents express.static from auto-serving index.html for '/'
  // so that the SPA fallback below can set no-cache on it properly.
  app.use(express.static(frontendDist, { redirect: false, maxAge: '1h', index: false }));
  // SPA fallback — serve index.html for all non-API client-side routes
  // index.html itself must NOT be cached (it references new hashed assets after deploys)
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

// ─── 404 for unknown API routes ───────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ─── Global error handler ─────────────────────────────────
app.use(errorHandler);

export default app;
