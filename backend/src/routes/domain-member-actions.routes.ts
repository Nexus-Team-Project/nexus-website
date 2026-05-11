/**
 * Protected routes for tenant member and contact action operations.
 * Covers: change email, change roles, remove member, remove contact.
 * All routes require a valid Bearer token. Permission checks (member.manage)
 * are enforced inside each service call — tenant context is derived from the
 * authenticated token, never from the request body.
 */
import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/authenticate';
import { apiLimiter } from '../middleware/rateLimiter';
import {
  updateMemberRolesSchema,
  updateMemberEmailSchema,
  updateContactEmailSchema,
} from '../schemas/domain-member-actions.schemas';
import {
  updateTenantMemberRoles,
  updateTenantMemberEmail,
  removeTenantMemberFromTenant,
  removeTenantContact,
  updateTenantContactEmail,
} from '../services/domain-member-actions.service';

const router = Router();

/**
 * PATCH /api/v1/tenant/members/:tenantMemberId/roles
 * Replaces the full role list for a tenant member.
 * Syncs roles on any still-pending invitation.
 * Guards against removing the last admin.
 */
router.patch(
  '/members/:tenantMemberId/roles',
  authenticate,
  apiLimiter,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = updateMemberRolesSchema.parse(req.body);
      const result = await updateTenantMemberRoles(
        req.user!.sub,
        req.params.tenantMemberId,
        input.roles as never,
      );
      res.json(result);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * PATCH /api/v1/tenant/members/:tenantMemberId/email
 * Changes the invite email address for a not-yet-accepted member.
 * Revokes the old invite and sends a fresh one to the new address.
 */
router.patch(
  '/members/:tenantMemberId/email',
  authenticate,
  apiLimiter,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = updateMemberEmailSchema.parse(req.body);
      const result = await updateTenantMemberEmail(
        req.user!.sub,
        req.params.tenantMemberId,
        input.email,
      );
      res.json(result);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * DELETE /api/v1/tenant/members/:tenantMemberId
 * Removes a member from the tenant. Deletes all tenant-scoped Mongo records
 * and sends a removal notification email. Never touches cross-tenant identity.
 */
router.delete(
  '/members/:tenantMemberId',
  authenticate,
  apiLimiter,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await removeTenantMemberFromTenant(req.user!.sub, req.params.tenantMemberId);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
);

/**
 * PATCH /api/v1/tenant/contacts/:tenantContactId/email
 * Updates the email address of a contact. For inactive contacts, rewrites the
 * email only. For pending/expired contacts, revokes the old invite and sends
 * a new one to the new address.
 */
router.patch(
  '/contacts/:tenantContactId/email',
  authenticate,
  apiLimiter,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = updateContactEmailSchema.parse(req.body);
      await updateTenantContactEmail(req.user!.sub, req.params.tenantContactId, input.email);
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * DELETE /api/v1/tenant/contacts/:tenantContactId
 * Removes a contact from the address book. If the contact was invited, also
 * removes the linked TenantMember and sends a removal email. Inactive contacts
 * are silently deleted.
 */
router.delete(
  '/contacts/:tenantContactId',
  authenticate,
  apiLimiter,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await removeTenantContact(req.user!.sub, req.params.tenantContactId);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
);

export default router;
