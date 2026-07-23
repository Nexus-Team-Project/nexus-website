/**
 * Tenant (organization) branding routes - org logo + brand color + cover gallery.
 *
 *   POST   /api/v1/tenant/logo         - multipart 'logo' file OR 'imageUrl' field
 *                                        (exactly one; URL is re-hosted to Cloudinary)
 *                                        + optional 'crop' JSON
 *   PATCH  /api/v1/tenant/logo/crop    - JSON { crop: LogoCrop | null } (adjust/revert crop)
 *   DELETE /api/v1/tenant/logo         - revert to name initials
 *   PATCH  /api/v1/tenant/brand-color  - JSON { brandColor: "#rrggbb" | null }
 *   POST   /api/v1/tenant/cover        - reconcile the cover gallery (max 5):
 *                                        multipart covers[] + newFileCrops JSON +
 *                                        remoteImages JSON + keptImages JSON
 *   DELETE /api/v1/tenant/cover        - clear the whole cover set (+ assets)
 *
 * Images are stored PRISTINE + a crop applied at display time, so crops can be
 * changed or reverted without re-uploading. Gated by the
 * workspace.update_settings permission; the tenant id is derived from the caller's
 * membership, never trusted from the client. URL sources are fetched by
 * CLOUDINARY (never this server) and only our re-hosted URLs are persisted.
 */
import { Router, Request, Response } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/authenticate';
import { apiLimiter } from '../middleware/rateLimiter';
import { getMongoDb } from '../config/mongo';
import { resolveTenantContextWithPermission } from '../utils/resolve-tenant-context';
import { setTenantLogo, setTenantLogoHosted, setTenantLogoCrop, removeTenantLogo, setTenantBrandColor } from '../services/tenant-logo.service';
import { setTenantCovers, clearTenantCovers } from '../services/tenant-cover.service';
import { buildCoverEntriesFromRequest } from '../services/tenant-cover.helper';
import { isUploadableImageUrl, TENANT_LOGO_FOLDER, uploadOfferImageFromUrl } from '../utils/cloudinary';
import { logoCropSchema, TENANT_COVER_IMAGES_MAX, type LogoCrop } from '../models/domain/tenant.models';

/** 6-digit hex color, with the leading '#'. */
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/**
 * Parse an incoming crop value (a JSON string from multipart, or a parsed object
 * from JSON body, or null/absent) into a validated LogoCrop | null.
 * Throws { status: 400 } when a non-empty value fails validation.
 */
function parseLogoCrop(raw: unknown): LogoCrop | null {
  if (raw === undefined || raw === null || raw === '' || raw === 'null') return null;
  let value: unknown;
  try {
    value = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    throw Object.assign(new Error('invalid_crop'), { status: 400 });
  }
  if (value === null) return null;
  const result = logoCropSchema.safeParse(value);
  if (!result.success) throw Object.assign(new Error('invalid_crop'), { status: 400 });
  return result.data;
}

const router = Router();

// Rate-limit branding routes (100 req/min/IP); guards the multipart upload path.
router.use(apiLimiter);

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_BYTES } });

/** Map a thrown permission/error to a status. */
function handleError(e: unknown, res: Response): void {
  const status = (e as { status?: number }).status;
  if (status === 400) { res.status(400).json({ error: (e instanceof Error && e.message) || 'bad_request' }); return; }
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
    const rawImageUrl = (req.body as { imageUrl?: unknown }).imageUrl;
    const hasImageUrl = typeof rawImageUrl === 'string' && rawImageUrl.trim() !== '';
    // Exactly ONE source: a file or a URL, never both / neither.
    if (file && hasImageUrl) { res.status(400).json({ error: 'file_and_url' }); return; }
    if (!file && !hasImageUrl) { res.status(400).json({ error: 'no_file' }); return; }
    const crop = parseLogoCrop((req.body as { crop?: unknown }).crop);
    const db = await getMongoDb();
    if (file) {
      if (!ALLOWED_TYPES.has(file.mimetype)) { res.status(400).json({ error: 'invalid_type' }); return; }
      const out = await setTenantLogo(db, { tenantId, buffer: file.buffer, filename: file.originalname, crop });
      res.json(out);
      return;
    }
    // URL source: http(s)-only + length cap; Cloudinary performs the fetch
    // (never this server), and only the re-hosted URL is persisted.
    if (!isUploadableImageUrl(rawImageUrl)) { res.status(400).json({ error: 'invalid_image_url' }); return; }
    const logoUrl = await uploadOfferImageFromUrl(rawImageUrl, TENANT_LOGO_FOLDER);
    const out = await setTenantLogoHosted(db, { tenantId, logoUrl, crop });
    res.json(out);
  } catch (e) {
    handleError(e, res);
  }
});

router.patch('/logo/crop', authenticate, async (req: Request, res: Response) => {
  try {
    const { tenantId } = await resolveTenantContextWithPermission(req, 'workspace.update_settings');
    const crop = parseLogoCrop((req.body as { crop?: unknown }).crop);
    const db = await getMongoDb();
    const out = await setTenantLogoCrop(db, { tenantId, crop });
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

router.post(
  '/cover',
  authenticate,
  upload.array('covers', TENANT_COVER_IMAGES_MAX),
  async (req: Request, res: Response) => {
    try {
      const { tenantId } = await resolveTenantContextWithPermission(req, 'workspace.update_settings');
      const files = (req.files as Express.Multer.File[] | undefined) ?? [];
      for (const file of files) {
        if (!ALLOWED_TYPES.has(file.mimetype)) { res.status(400).json({ error: 'invalid_type' }); return; }
      }
      const entries = await buildCoverEntriesFromRequest(files, req.body as Record<string, unknown>);
      const db = await getMongoDb();
      const out = await setTenantCovers(db, { tenantId, entries });
      res.json(out);
    } catch (e) {
      handleError(e, res);
    }
  },
);

router.delete('/cover', authenticate, async (req: Request, res: Response) => {
  try {
    const { tenantId } = await resolveTenantContextWithPermission(req, 'workspace.update_settings');
    const db = await getMongoDb();
    await clearTenantCovers(db, { tenantId });
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
