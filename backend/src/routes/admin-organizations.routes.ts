/**
 * Platform-admin organization management (rate-limited, admin-only):
 *   POST   /api/v1/admin/organizations                  - create tenant on behalf (creator-only)
 *   GET    /api/v1/admin/organizations                  - list admin-created tenants
 *   POST   /api/v1/admin/organizations/:tenantId/owner  - assign the external owner + email
 *   DELETE /api/v1/admin/organizations/:tenantId/owner  - remove owner (typo window only)
 *   POST   /api/v1/admin/organizations/:tenantId/logo   - upload org logo (multipart)
 *
 * Gated to platform admins (email in NEXUS_ADMIN_EMAILS) via resolveTenantContext.
 * A thrown ZodError -> 400 via the shared errorHandler; the service's coded 409s
 * are answered here with bilingual { error, errorHe, code } bodies so the
 * dashboard can localize them via localizedApiError.
 * Spec: docs/superpowers/specs/2026-07-05-admin-org-management-design.md
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { authenticate } from '../middleware/authenticate';
import { apiLimiter } from '../middleware/rateLimiter';
import { getMongoDb } from '../config/mongo';
import { resolveTenantContext, type TenantContext } from '../utils/resolve-tenant-context';
import { getTenantDomainCollections, logoCropSchema } from '../models/domain/tenant.models';
import { workspaceSetupBodySchema } from '../schemas/onboarding.schemas';
import { setTenantLogo } from '../services/tenant-logo.service';
import {
  createAdminOrganization,
  listAdminOrganizations,
  assignOrganizationOwner,
  removeOrganizationOwner,
} from '../services/admin-organizations.service';

const router = Router();
router.use(apiLimiter);

// Platform-admin gate for every route in this router; the resolved context is
// stashed for handlers (identityId of the acting admin).
router.use(authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ctx = await resolveTenantContext(req);
    if (!ctx.isPlatformAdmin) { res.status(403).json({ error: 'forbidden' }); return; }
    res.locals.adminCtx = ctx;
    next();
  } catch (e) {
    next(e);
  }
});

/** Bilingual copy for the service's coded 409s. */
const ERROR_COPY: Record<string, { en: string; he: string }> = {
  owner_is_platform_admin: {
    en: 'This email belongs to a NEXUS platform admin and cannot be an organization admin.',
    he: 'האימייל הזה שייך למנהל פלטפורמת נקסוס ולא יכול לשמש כאדמין ארגון.',
  },
  owner_has_privileged_role: {
    en: 'This email is already an owner or admin of another organization.',
    he: 'האימייל הזה כבר משמש כבעלים או אדמין של ארגון אחר.',
  },
  owner_already_assigned: {
    en: 'This organization already has an assigned admin.',
    he: 'לארגון הזה כבר הוקצה אדמין.',
  },
  owner_already_active: {
    en: 'The assigned admin already signed in; the assignment can no longer be changed here.',
    he: 'האדמין שהוקצה כבר התחבר; לא ניתן עוד לשנות את ההקצאה מכאן.',
  },
};

/**
 * Answers a known coded service error as { error, errorHe, code }.
 * Input: response + thrown error. Output: true when handled here.
 */
function sendKnownError(res: Response, e: unknown): boolean {
  const err = e as { code?: string; statusCode?: number };
  if (err.code && ERROR_COPY[err.code]) {
    res.status(err.statusCode ?? 409).json({
      error: ERROR_COPY[err.code].en,
      errorHe: ERROR_COPY[err.code].he,
      code: err.code,
    });
    return true;
  }
  return false;
}

const createBody = workspaceSetupBodySchema.extend({
  brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { brandColor, ...data } = createBody.parse(req.body);
    const ctx = res.locals.adminCtx as TenantContext;
    res.status(201).json(await createAdminOrganization({
      adminUserId: req.user!.sub,
      adminIdentityId: ctx.identityId,
      adminEmail: req.user!.email,
      data,
      brandColor,
    }));
  } catch (e) {
    next(e);
  }
});

const listQuery = z.object({
  search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await listAdminOrganizations(listQuery.parse(req.query)));
  } catch (e) {
    next(e);
  }
});

const assignBody = z.object({
  email: z.string().trim().email().max(254),
  // Language for the notification email; mirrors the admin's dashboard language.
  language: z.enum(['he', 'en']).default('he'),
});

router.post('/:tenantId/owner', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, language } = assignBody.parse(req.body);
    res.json(await assignOrganizationOwner(req.params.tenantId, email, language, req.user!.email));
  } catch (e) {
    if (!sendKnownError(res, e)) next(e);
  }
});

router.delete('/:tenantId/owner', async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await removeOrganizationOwner(req.params.tenantId));
  } catch (e) {
    if (!sendKnownError(res, e)) next(e);
  }
});

// Logo upload - same limits/validation as the tenant self-service logo route
// (tenant-logo.routes.ts); the tenant id comes from the URL because the admin
// has no membership in the target tenant. Only admin-created tenants.
const MAX_LOGO_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_LOGO_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const logoUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_LOGO_BYTES } });

router.post('/:tenantId/logo', logoUpload.single('logo'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = await getMongoDb();
    const tenant = await getTenantDomainCollections(db).domainTenants.findOne(
      { tenantId: req.params.tenantId, adminCreated: { $exists: true } },
      { projection: { tenantId: 1 } },
    );
    if (!tenant) { res.status(404).json({ error: 'organization_not_found' }); return; }

    const file = req.file;
    if (!file) { res.status(400).json({ error: 'no_file' }); return; }
    if (!ALLOWED_LOGO_TYPES.has(file.mimetype)) { res.status(400).json({ error: 'invalid_type' }); return; }

    // Optional crop JSON (multipart string), validated like the tenant route.
    const rawCrop = (req.body as { crop?: unknown }).crop;
    let crop = null;
    if (rawCrop !== undefined && rawCrop !== null && rawCrop !== '' && rawCrop !== 'null') {
      const parsed = typeof rawCrop === 'string' ? JSON.parse(rawCrop) : rawCrop;
      const result = logoCropSchema.safeParse(parsed);
      if (!result.success) { res.status(400).json({ error: 'invalid_crop' }); return; }
      crop = result.data;
    }

    const out = await setTenantLogo(db, {
      tenantId: req.params.tenantId,
      buffer: file.buffer,
      filename: file.originalname,
      crop,
    });
    res.json(out);
  } catch (e) {
    next(e);
  }
});

export default router;
