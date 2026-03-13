import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import path from 'path';
import { existsSync, readFileSync } from 'fs';
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
import partnersRoutes from './routes/partners.route';
import userRoutes from './routes/user.routes';
const app = express();
app.set('trust proxy', 1);

// ─── Compression (gzip/brotli) ───────────────────────────
app.use(compression());

// ─── Security headers ────────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        'img-src': ["'self'", 'data:', 'https://flagcdn.com', 'https://lh3.googleusercontent.com', 'https://*.googleusercontent.com', 'https://*.google.com', 'https://static.wixstatic.com', 'https://images.unsplash.com'],
        'script-src': ["'self'", "'unsafe-inline'", "'unsafe-eval'", 'https://accounts.google.com', 'https://cdn.jsdelivr.net', 'https://apis.google.com', 'https://assets.apollo.io', 'https://www.googletagmanager.com', 'https://www.google-analytics.com'],
        'connect-src': ["'self'", 'https://nexus-website-production.up.railway.app', 'https://accounts.google.com', 'https://oauth2.googleapis.com', 'https://*.googleapis.com', 'https://*.apollo.io', 'https://aplo-evnt.com', 'https://*.aplo-evnt.com', 'https://api.github.com', 'https://www.google-analytics.com', 'https://analytics.google.com', 'https://www.googletagmanager.com'],
        'frame-src': ["'self'", 'https://accounts.google.com'],
        'style-src': ["'self'", "'unsafe-inline'", 'https://accounts.google.com', 'https://fonts.googleapis.com'],
        'font-src': ["'self'", 'data:', 'https://fonts.gstatic.com'],
      },
    },
  }),
);

// ─── CORS ────────────────────────────────────────────────
app.use(
  cors({
    origin: [env.FRONTEND_URL],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-anonymous-id', 'x-agent-key'],
  }),
);

// ─── Webhook routes FIRST with raw body ──────────────────
app.use('/api/webhooks', express.raw({ type: 'application/json' }), webhookRoutes);

// ─── Body parsers for all other routes ───────────────────
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

// ─── Health check ─────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    env: env.NODE_ENV,
    build: '2026-03-08a',
    emailConfigured: !!(env.SENDPULSE_CLIENT_ID && env.SENDPULSE_CLIENT_SECRET),
  });
});

// ─── API Routes ───────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/leads', leadsRoutes);
app.use('/api/admin/ai', adminRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/partners', partnersRoutes);
app.use('/api/user', userRoutes);

// ─── Serve frontend (SPA) ─────────────────────────────────
const frontendDist = path.resolve(__dirname, '../public');
if (existsSync(frontendDist)) {
  app.use(
    '/assets',
    express.static(path.join(frontendDist, 'assets'), {
      redirect: false,
      maxAge: '1y',
      immutable: true,
    }),
  );
  // index: false — prevents express.static from serving index.html for directory
  // paths (e.g. "/"), so every HTML request reaches the catch-all below where we
  // can inject the correct favicon per subdomain.
  app.use(
    express.static(frontendDist, {
      redirect: false,
      index: false,
      maxAge: '1h',
    }),
  );
  app.get(/^(?!\/api).*/, (req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    const indexPath = path.join(frontendDist, 'index.html');
    // Docs subdomain: inject the purple API favicon directly into the HTML so the
    // browser shows the correct icon before any JavaScript loads (no race condition
    // with Chrome's internal SVG fetch).
    if (req.hostname === 'docs.nexus-payment.com') {
      const html = readFileSync(indexPath, 'utf-8')
        .replace(/<link rel="icon" type="image\/svg\+xml"[^>]*>/g, '')
        .replace(
          /<link rel="icon" type="image\/png"[^>]*>/g,
          '<link rel="icon" type="image/png" sizes="64x64" href="/nexus-api-favicon.png" />',
        );
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } else {
      res.sendFile(indexPath);
    }
  });
}

// ─── 404 for unknown API routes ───────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ─── Global error handler ─────────────────────────────────
app.use(errorHandler);

export default app;