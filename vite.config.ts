import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { visualizer } from 'rollup-plugin-visualizer'
import { readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'

// ─── Dynamic Sitemap Generator ────────────────────────────
// Extracts blog article slugs by regex — no TS import needed at build time.
// Runs on every `vite build` and `vite dev`, so any new article or page added
// below will automatically appear in the sitemap on the next build.

const BASE_URL = 'https://nexus-payment.com';

const STATIC_ROUTES: Array<{ loc: string; priority: string; changefreq: string }> = [
  { loc: '/',                 priority: '1.0', changefreq: 'weekly'  },
  { loc: '/he',               priority: '1.0', changefreq: 'weekly'  },
  { loc: '/payments',         priority: '0.9', changefreq: 'monthly' },
  { loc: '/he/payments',      priority: '0.9', changefreq: 'monthly' },
  { loc: '/benefits',         priority: '0.9', changefreq: 'monthly' },
  { loc: '/he/benefits',      priority: '0.9', changefreq: 'monthly' },
  { loc: '/partners',         priority: '0.8', changefreq: 'weekly'  },
  { loc: '/he/partners',      priority: '0.8', changefreq: 'weekly'  },
  { loc: '/docs',             priority: '0.8', changefreq: 'weekly'  },
  { loc: '/he/docs',          priority: '0.8', changefreq: 'weekly'  },
  { loc: '/changelog',        priority: '0.6', changefreq: 'weekly'  },
  { loc: '/he/changelog',     priority: '0.6', changefreq: 'weekly'  },
  { loc: '/blog',             priority: '0.8', changefreq: 'daily'   },
  { loc: '/he/blog',          priority: '0.8', changefreq: 'daily'   },
  { loc: '/privacy',          priority: '0.3', changefreq: 'yearly'  },
  { loc: '/he/privacy',       priority: '0.3', changefreq: 'yearly'  },
  { loc: '/terms',            priority: '0.3', changefreq: 'yearly'  },
  { loc: '/he/terms',         priority: '0.3', changefreq: 'yearly'  },
  { loc: '/accessibility',    priority: '0.3', changefreq: 'yearly'  },
  { loc: '/he/accessibility', priority: '0.3', changefreq: 'yearly'  },
];

function generateSitemap() {
  const today = new Date().toISOString().split('T')[0];
  const slugRegex = /slug:\s*['"]([^'"]+)['"]/g;

  const enFile = readFileSync(resolve('./src/data/blog/articles-en.ts'), 'utf-8');
  const heFile = readFileSync(resolve('./src/data/blog/articles-he.ts'), 'utf-8');

  const enSlugs: string[] = [];
  const heSlugs: string[] = [];
  let m: RegExpExecArray | null;

  while ((m = slugRegex.exec(enFile)) !== null) enSlugs.push(m[1]);
  slugRegex.lastIndex = 0;
  while ((m = slugRegex.exec(heFile)) !== null) heSlugs.push(m[1]);

  const allUrls = [
    ...STATIC_ROUTES,
    ...enSlugs.map((s) => ({ loc: `/blog/${s}`,    priority: '0.7', changefreq: 'monthly' })),
    ...heSlugs.map((s) => ({ loc: `/he/blog/${s}`, priority: '0.7', changefreq: 'monthly' })),
  ];

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    allUrls
      .map(
        (u) =>
          `  <url>\n` +
          `    <loc>${BASE_URL}${u.loc}</loc>\n` +
          `    <lastmod>${today}</lastmod>\n` +
          `    <changefreq>${u.changefreq}</changefreq>\n` +
          `    <priority>${u.priority}</priority>\n` +
          `  </url>`,
      )
      .join('\n') +
    `\n</urlset>\n`;

  writeFileSync(resolve('./public/sitemap.xml'), xml, 'utf-8');
}

function sitemapPlugin(): Plugin {
  return {
    name: 'nexus-sitemap',
    buildStart() { generateSitemap(); },
    configureServer() { generateSitemap(); },
  };
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    sitemapPlugin(),
    visualizer({
      filename: './dist/stats.html',
      open: false,
      gzipSize: true,
      brotliSize: true,
    }),
  ],
  server: {
    port: 3000,
    host: true,
  },
  build: {
    target: 'esnext',
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
        pure_funcs: ['console.log', 'console.info', 'console.debug'],
        passes: 2,          // Second pass catches more dead-code
      },
      mangle: { safari10: false },
    },
    rollupOptions: {
      output: {
        // Granular vendor splitting — each chunk is cached independently
        manualChunks(id) {
          // Core React runtime — changes rarely, cached forever
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) {
            return 'react-vendor';
          }
          // Router — changes rarely
          if (id.includes('node_modules/react-router')) {
            return 'react-router-vendor';
          }
          // Icons — large, rarely changes
          if (id.includes('node_modules/lucide-react')) {
            return 'ui-vendor';
          }
          // Socket.io — real-time only needed on chat
          if (id.includes('node_modules/socket.io-client') || id.includes('node_modules/engine.io')) {
            return 'socket-vendor';
          }
          // 3D globe — heavy, isolated
          if (id.includes('node_modules/react-globe') || id.includes('node_modules/three')) {
            return 'globe-vendor';
          }
          // Google OAuth — only on auth pages (already lazy-loaded)
          if (id.includes('node_modules/@react-oauth')) {
            return 'auth-vendor';
          }
        },
        // Ensure asset filenames include content hash for long-term caching
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
    // Raise warning threshold — three.js chunks are legitimately large
    chunkSizeWarningLimit: 800,
    sourcemap: false,
    // Inline small assets directly in JS (saves HTTP requests)
    assetsInlineLimit: 4096,
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom', 'lucide-react'],
  },
})
