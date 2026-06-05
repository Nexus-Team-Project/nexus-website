/**
 * Tenant (organization) branding routes - org logo + brand color.
 *
 *   POST   /api/v1/tenant/logo         - multipart 'logo' (square-cropped image)
 *   DELETE /api/v1/tenant/logo         - revert to name initials
 *   PATCH  /api/v1/tenant/brand-color  - JSON { brandColor: "#rrggbb" | null }
 *
 * Gated by the workspace.update_settings permission; the tenant id is derived
 * from the caller's membership, never trusted from the client.
 */
import { Router, Request, Response } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/authenticate';
import { apiLimiter } from '../middleware/rateLimiter';
import { getMongoDb } from '../config/mongo';
import { resolveTenantContextWithPermission } from '../utils/resolve-tenant-context';
import { setTenantLogo, removeTenantLogo, setTenantBrandColor } from '../services/tenant-logo.service';

/** 6-digit hex color, with the leading '#'. */
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

const router = Router();

// Rate-limit branding routes (100 req/min/IP); guards the multipart upload path.
router.use(apiLimiter);

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_BYTES } });

/** Map a thrown permission/error to a status. */
function handleError(e: unknown, res: Response): void {
  const status = (e as { status?: number }).status;
  if (status === 403) { res.status(403).json({ error: 'forbidden' }); return; }
  if (status === 401) { res.status(401).json({ error: 'unauthorized' }); return; }
  if (e instanceof Error && e.message.includes('CLOUDINARY_URL')) {
    res.status(503).json({ error: 'logo_upload_unavailable' });
    return;
  }
  console.error('[tenant-logo] error:', e);
  res.status(500).json({ error: 'internal_error' });
}

router.post('/logo', authenticate, upload.single('logo'), async (req: Request, res: Response) => {
  try {
    const { tenantId } = await resolveTenantContextWithPermission(req, 'workspace.update_settings');
    const file = req.file;
    if (!file) { res.status(400).json({ error: 'no_file' }); return; }
    if (!ALLOWED_TYPES.has(file.mimetype)) { res.status(400).json({ error: 'invalid_type' }); return; }
    const db = await getMongoDb();
    const out = await setTenantLogo(db, { tenantId, buffer: file.buffer, filename: file.originalname });
    res.json(out);
  } catch (e) {
    handleError(e, res);
  }
});

router.delete('/logo', authenticate, async (req: Request, res: Response) => {
  try {
    const { tenantId } = await resolveTenantContextWithPermission(req, 'workspace.update_settings');
    const db = await getMongoDb();
    await removeTenantLogo(db, { tenantId });
    res.json({ ok: true });
  } catch (e) {
    handleError(e, res);
  }
});

router.patch('/brand-color', authenticate, async (req: Request, res: Response) => {
  try {
    const { tenantId } = await resolveTenantContextWithPermission(req, 'workspace.update_settings');
    const raw = (req.body as { brandColor?: unknown }).brandColor;
    // Accept either a valid hex string (set) or null/empty (clear). Reject
    // anything else so a malformed value never lands in the tenant document.
    let brandColor: string | null;
    if (raw === null || raw === '' || raw === undefined) {
      brandColor = null;
    } else if (typeof raw === 'string' && HEX_COLOR.test(raw)) {
      brandColor = raw.toLowerCase();
    } else {
      res.status(400).json({ error: 'invalid_color' });
      return;
    }
    const db = await getMongoDb();
    const out = await setTenantBrandColor(db, { tenantId, brandColor });
    res.json(out);
  } catch (e) {
    handleError(e, res);
  }
});

export default router;
