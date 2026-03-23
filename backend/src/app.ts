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
import partnersRoutes from './routes/partners.route';
import userRoutes from './routes/user.routes';
import blogRoutes from './routes/blog.routes';
import agentApprovalsRoutes from './routes/agent-approvals.routes';
import seoRoutes from './routes/seo.routes';
import adminUsersRoutes from './routes/admin.users.routes';
import orgsRoutes from './routes/orgs.routes';
import invitesRoutes from './routes/invites.routes';
import { prisma } from './config/database';
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
const allowedOrigins = [env.FRONTEND_URL, env.DASHBOARD_URL, env.USER_MGMT_URL].filter(Boolean) as string[];
app.use(
  cors({
    origin: (origin, cb) => {
      // Allow requests with no origin (e.g. curl, mobile apps) in dev
      if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
      cb(new Error(`CORS: origin ${origin} not allowed`));
    },
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
    build: '2026-03-23c',
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
app.use('/api/admin/users', adminUsersRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/partners', partnersRoutes);
app.use('/api/user', userRoutes);
app.use('/api/blog', blogRoutes);
app.use('/api/admin/agent-requests', agentApprovalsRoutes);
app.use('/api/seo', seoRoutes);
app.use('/api/orgs', orgsRoutes);
app.use('/api/invites', invitesRoutes);

// ─── Dynamic sitemap.xml (must be before static middleware) ──────────────────
app.get('/sitemap.xml', async (_req, res, next) => {
  try {
    const publishedArticles = await prisma.blogArticle.findMany({
      where: { status: 'PUBLISHED' },
      select: { slug: true, lang: true, updatedAt: true },
      orderBy: { publishedAt: 'desc' },
    });

    const today = new Date().toISOString().split('T')[0];

    const staticPages = [
      { loc: '', changefreq: 'weekly', priority: '1.0' },
      { loc: '/he', changefreq: 'weekly', priority: '1.0' },
      { loc: '/payments', changefreq: 'monthly', priority: '0.9' },
      { loc: '/he/payments', changefreq: 'monthly', priority: '0.9' },
      { loc: '/benefits', changefreq: 'monthly', priority: '0.9' },
      { loc: '/he/benefits', changefreq: 'monthly', priority: '0.9' },
      { loc: '/partners', changefreq: 'weekly', priority: '0.8' },
      { loc: '/he/partners', changefreq: 'weekly', priority: '0.8' },
      { loc: '/docs', changefreq: 'weekly', priority: '0.8' },
      { loc: '/he/docs', changefreq: 'weekly', priority: '0.8' },
      { loc: '/changelog', changefreq: 'weekly', priority: '0.6' },
      { loc: '/he/changelog', changefreq: 'weekly', priority: '0.6' },
      { loc: '/blog', changefreq: 'daily', priority: '0.8' },
      { loc: '/he/blog', changefreq: 'daily', priority: '0.8' },
      { loc: '/privacy', changefreq: 'yearly', priority: '0.3' },
      { loc: '/he/privacy', changefreq: 'yearly', priority: '0.3' },
      { loc: '/terms', changefreq: 'yearly', priority: '0.3' },
      { loc: '/he/terms', changefreq: 'yearly', priority: '0.3' },
      { loc: '/accessibility', changefreq: 'yearly', priority: '0.3' },
      { loc: '/he/accessibility', changefreq: 'yearly', priority: '0.3' },
      { loc: '/welfare', changefreq: 'monthly', priority: '0.9' },
      { loc: '/he/welfare', changefreq: 'monthly', priority: '0.9' },
    ];

    const articleUrls = publishedArticles.map((a) => {
      const prefix = a.lang === 'he' ? '/he' : '';
      const lastmod = a.updatedAt.toISOString().split('T')[0];
      return `  <url>
    <loc>https://nexus-payment.com${prefix}/blog/${a.slug}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`;
    });

    const staticUrls = staticPages.map((p) => `  <url>
    <loc>https://nexus-payment.com${p.loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`);

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${staticUrls.join('\n')}
${articleUrls.join('\n')}
</urlset>`;

    res.set('Content-Type', 'application/xml');
    res.set('Cache-Control', 'public, max-age=3600');
    res.send(xml);
  } catch (err) {
    next(err);
  }
});

// ─── Serve frontend (SPA) ─────────────────────────────────
const frontendDist = path.resolve(__dirname, '../public');

// On docs.nexus-payment.com we serve nexus-api-favicon.png for ALL favicon
// requests (including /favicon.ico auto-requests and any old cached paths).
// This route MUST be registered before express.static so it wins.
const isDocsDomain = (req: express.Request) =>
  req.hostname === 'docs.nexus-payment.com' ||
  req.headers['x-forwarded-host'] === 'docs.nexus-payment.com' ||
  req.get('host') === 'docs.nexus-payment.com';

app.get(['/nexus-favicon.svg', '/nexus-favicon.png', '/favicon.ico'], (req, res, next) => {
  if (!isDocsDomain(req)) return next();
  const apiFaviconPath = path.join(frontendDist, 'nexus-api-favicon.png');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  if (existsSync(apiFaviconPath)) return res.sendFile(apiFaviconPath);
  // Fallback if file missing (dev / fresh clone)
  res.setHeader('Content-Type', 'image/png');
  res.send(Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64',
  ));
});

if (existsSync(frontendDist)) {
  app.use(
    '/assets',
    express.static(path.join(frontendDist, 'assets'), {
      redirect: false,
      maxAge: '1y',
      immutable: true,
    }),
  );
  app.use(
    express.static(frontendDist, {
      redirect: false,
      maxAge: '1h',
      index: false, // Don't serve index.html from static — SPA handler below does it with no-cache
    }),
  );
  app.get(/^(?!\/api).*/, (req, res) => {
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