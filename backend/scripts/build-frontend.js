#!/usr/bin/env node
/**
 * build-frontend.js — prebuild script for Railway deployment
 *
 * Railway's buildCommand (in root railway.toml) runs:
 *   1. npm install           — installs root devDeps (Vite, etc.)
 *   2. npx vite build        — builds the frontend → dist/
 *   3. cd backend && npm install && npx prisma generate && npm run build
 *      └─ prebuild: this script — copies dist/ → backend/public/
 *      └─ build:    tsc
 *
 * Express then serves backend/public/ as the SPA static root.
 */

const path = require('path');
const fs = require('fs');

const rootDir = path.resolve(__dirname, '../..');
const backendDir = path.resolve(__dirname, '..');
const distSrc = path.join(rootDir, 'dist');
const distDest = path.join(backendDir, 'public');

// Skip if no vite.config.ts at root (not a full-stack repo)
if (!fs.existsSync(path.join(rootDir, 'vite.config.ts'))) {
  console.log('[prebuild] No vite.config.ts found at root — skipping frontend copy');
  process.exit(0);
}

// In local dev, dist/ might not exist yet — skip silently
if (!fs.existsSync(distSrc)) {
  console.log('[prebuild] dist/ not found — skipping frontend copy (local dev mode)');
  process.exit(0);
}

try {
  if (fs.existsSync(distDest)) {
    fs.rmSync(distDest, { recursive: true, force: true });
  }
  fs.cpSync(distSrc, distDest, { recursive: true });
  console.log('[prebuild] ✅ Frontend copied to backend/public/');
} catch (err) {
  console.error('[prebuild] ❌ Failed to copy frontend:', err.message);
  process.exit(1); // Fatal — don't deploy without frontend
}
