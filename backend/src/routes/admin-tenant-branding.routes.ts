/**
 * Platform-admin tenant branding routes - edit ANY organization's logo + brand
 * color (rate-limited, platform-admin only):
 *
 *   POST   /api/v1/admin/tenants/:tenantId/logo         - multipart 'logo' OR 'imageUrl' field
 *                                                         (exactly one; URL re-hosted) + optional 'crop' JSON
 *   PATCH  /api/v1/admin/tenants/:tenantId/logo/crop    - JSON { crop: LogoCrop | null }
 *   DELETE /api/v1/admin/tenants/:tenantId/logo         - clear logo (revert to initials)
 *   PATCH  /api/v1/admin/tenants/:tenantId/brand-color  - JSON { brandColor: "#rrggbb" | null }
 *   POST   /api/v1/admin/tenants/:tenantId/cover        - reconcile the cover gallery (max 5):
 *                                                         multipart covers[] + newFileCrops +
 *                                                         remoteImages + keptImages JSON fields
 *   DELETE /api/v1/admin/tenants/:tenantId/cover        - clear the whole cover set (+ assets)
 *
 * Unlike the tenant self-service routes (tenant-logo.routes.ts) the tenant id
 * comes from the URL because a platform admin has no membership in the target
 * tenant. The gate (platform admin) + a tenant-existence check are the boundary;
 * the reused services no-op on a missing tenant, so we verify it exists first.
 * These operate on ANY tenant (unlike admin-organizations.routes.ts, which is
 * restricted to admin-created orgs and upload-only).
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/authenticate';
import { apiLimiter } from '../middleware/rateLimiter';
import { getMongoDb } from '../config/mongo';
import { resolveTenantContext } from '../utils/resolve-tenant-context';
import { getTenantDomainCollections, logoCropSchema, TENANT_COVER_IMAGES_MAX, type LogoCrop } from '../models/domain/tenant.models';
import {
  setTenantLogo,
  setTenantLogoHosted,
  setTenantLogoCrop,
  removeTenantLogo,
  setTenantBrandColor,
} from '../services/tenant-logo.service';
import { setTenantCovers, clearTenantCovers } from '../services/tenant-cover.service';
import { buildCoverEntriesFromRequest } from '../services/tenant-cover.helper';
import { isUploadableImageUrl, TENANT_LOGO_FOLDER, uploadOfferImageFromUrl } from '../utils/cloudinary';

/** 6-digit hex color, with the leading '#'. */
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_BYTES } });

const router = Router();

// Rate-limit branding routes (100 req/min/IP); guards the multipart upload path.
router.use(apiLimiter);

// Platform-admin gate for every route in this router.
router.use(authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ctx = await resolveTenantContext(req);
    if (!ctx.isPlatformAdmin) { res.status(403).json({ error: 'forbidden' }); return; }
    next();
  } catch (e) {
    next(e);
  }
});

/**
 * Parse an incoming crop value (a JSON string from multipart, or a parsed object
 * from a JSON body, or null/absent) into a validated LogoCrop | null.
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

/** Assert the target tenant exists; 404 otherwise. Returns nothing. */
async function assertTenantExists(tenantId: string): Promise<void> {
  const db = await getMongoDb();
  const tenant = await getTenantDomainCollections(db).domainTenants.findOne(
    { tenantId },
    { projection: { _id: 0, tenantId: 1 } },
  );
  if (!tenant) throw Object.assign(new Error('organization_not_found'), { status: 404 });
}

/** Map a thrown error to a status. Mirrors tenant-logo.routes.ts. */
function handleError(e: unknown, res: Response): void {
  const status = (e as { status?: number }).status;
  if (status === 404) { res.status(404).json({ error: 'organization_not_found' }); return; }
  if (status === 400) { res.status(400).json({ error: (e instanceof Error && e.message) || 'bad_request' }); return; }
  if (status === 403) { res.status(403).json({ error: 'forbidden' }); return; }
  if (status === 401) { res.status(401).json({ error: 'unauthorized' }); return; }
  if (e instanceof Error && e.message.includes('CLOUDINARY_URL')) {
    res.status(503).json({ error: 'logo_upload_unavailable' });
    return;
  }
  console.error('[admin-tenant-branding] error:', e);
  res.status(500).json({ error: 'internal_error' });
}

router.post('/:tenantId/logo', upload.single('logo'), async (req: Request, res: Response) => {
  try {
    const { tenantId } = req.params;
    await assertTenantExists(tenantId);
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
    // URL source: http(s)-only + length cap; Cloudinary performs the fetch.
    if (!isUploadableImageUrl(rawImageUrl)) { res.status(400).json({ error: 'invalid_image_url' }); return; }
    const logoUrl = await uploadOfferImageFromUrl(rawImageUrl, TENANT_LOGO_FOLDER);
    const out = await setTenantLogoHosted(db, { tenantId, logoUrl, crop });
    res.json(out);
  } catch (e) {
    handleError(e, res);
  }
});

router.post(
  '/:tenantId/cover',
  upload.array('covers', TENANT_COVER_IMAGES_MAX),
  async (req: Request, res: Response) => {
    try {
      const { tenantId } = req.params;
      await assertTenantExists(tenantId);
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

router.delete('/:tenantId/cover', async (req: Request, res: Response) => {
  try {
    const { tenantId } = req.params;
    await assertTenantExists(tenantId);
    const db = await getMongoDb();
    await clearTenantCovers(db, { tenantId });
    res.json({ ok: true });
  } catch (e) {
    handleError(e, res);
  }
});

router.patch('/:tenantId/logo/crop', async (req: Request, res: Response) => {
  try {
    const { tenantId } = req.params;
    await assertTenantExists(tenantId);
    const crop = parseLogoCrop((req.body as { crop?: unknown }).crop);
    const db = await getMongoDb();
    const out = await setTenantLogoCrop(db, { tenantId, crop });
    res.json(out);
  } catch (e) {
    handleError(e, res);
  }
});

router.delete('/:tenantId/logo', async (req: Request, res: Response) => {
  try {
    const { tenantId } = req.params;
    await assertTenantExists(tenantId);
    const db = await getMongoDb();
    await removeTenantLogo(db, { tenantId });
    res.json({ ok: true });
  } catch (e) {
    handleError(e, res);
  }
});

router.patch('/:tenantId/brand-color', async (req: Request, res: Response) => {
  try {
    const { tenantId } = req.params;
    await assertTenantExists(tenantId);
    const raw = (req.body as { brandColor?: unknown }).brandColor;
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
