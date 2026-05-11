/**
 * Registers the official v1 API surface for Nexus backend clients.
 * Legacy `/api/*` routes stay active while clients migrate to `/api/v1/*`.
 */
import { Router } from 'express';
import adminAgentsRoutes from './admin-agents.routes';
import adminRoutes from './admin.routes';
import adminSeoRoutes from './admin-seo.routes';
import adminUsersRoutes from './admin.users.routes';
import agentApprovalsRoutes from './agent-approvals.routes';
import analyticsRoutes from './analytics.routes';
import authRoutes from './auth.routes';
import blogRoutes from './blog.routes';
import chatRoutes from './chat.routes';
import dashboardRoutes from './dashboard.routes';
import domainContactsRoutes from './domain-contacts.routes';
import domainMemberActionsRoutes from './domain-member-actions.routes';
import domainMemberInvitationsRoutes from './domain-member-invitations.routes';
import domainTenantRoutes from './domain-tenant.routes';
import invitesRoutes from './invites.routes';
import leadsRoutes from './leads.routes';
import onboardingRoutes from './onboarding.routes';
import orgsRoutes from './orgs.routes';
import partnersRoutes from './partners.route';
import paymentsRoutes from './payments.routes';
import pushRoutes from './push.routes';
import seoRoutes from './seo.routes';
import userRoutes from './user.routes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/', onboardingRoutes);
router.use('/tenant', domainTenantRoutes);
router.use('/tenant', domainMemberActionsRoutes);
router.use('/tenant/contacts', domainContactsRoutes);
router.use('/member-invitations', domainMemberInvitationsRoutes);
router.use('/chat', chatRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/leads', leadsRoutes);
router.use('/admin/ai', adminRoutes);
router.use('/admin/users', adminUsersRoutes);
router.use('/payments', paymentsRoutes);
router.use('/partners', partnersRoutes);
router.use('/user', userRoutes);
router.use('/blog', blogRoutes);
router.use('/admin/agent-requests', agentApprovalsRoutes);
router.use('/admin/agents', adminAgentsRoutes);
router.use('/admin/seo', adminSeoRoutes);
router.use('/seo', seoRoutes);
router.use('/orgs', orgsRoutes);
router.use('/invites', invitesRoutes);
router.use('/push', pushRoutes);

export default router;
