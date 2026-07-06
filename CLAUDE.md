# Nexus Website Agent Guide

> **Writing rule - no em-dashes.** Never use an em-dash (—) or en-dash (–) anywhere: not in code, comments, documentation, commit messages, UI/i18n text, or chat replies. Use a regular hyphen (-) instead (optionally spaced as " - "). This applies to all generated output in this repo.

This file covers the `nexus-website` project (login/entry frontend + backend). Treat source code as final truth when behavior differs.

## Workspace Overview

`nexus-website/` contains:
- **Frontend** — login/entry UI (React 19, TypeScript, Vite, Tailwind). Users authenticate here before entering `nexus-dashboard`.
- **`backend/`** — the production backend for the entire Nexus platform (Express, TypeScript, Prisma, PostgreSQL, MongoDB, Socket.io).

The whole backend lives here. There is no backend in `nexus-dashboard`.

Related projects:
- `nexus-dashboard/` — real Nexus product app; receives sessions from this backend.
- `nexus-files/` (at workspace root `C:\Nexus`) — authoritative specs (`.docx`): `NEXUS_PRODSPEC_Roles_v0_1.docx`, `NEXUS_Developer_Onboarding_Guide_v1_0.docx`, `NEXUS_Data_Model_v9_3.docx`, `NEXUS_SDD_Identity_Service_v4_3.docx`, `NEXUS_SDD_Tenant_Onboarding_v2_6.docx`, `NEXUS_SDD_Member_Management_v4_4.docx`, `NEXUS_SDD_Catalog_Service_v4_3.docx`, `NEXUS_SDD_Supply_Service_v4_4.docx`, `NEXUS_SDD_Platform_Pricing_Service_v1_3.docx`, `NEXUS_SDD_Orchestrator_v1_3.docx`, `NEXUS_FLOW_00*` flow docs.
- `progress.md` (at repo root) — management-facing summary; update when alignment progress changes.

## High-Level Architecture

Three deployable services:
- **Website frontend**: `nexus-website` — React 19, TypeScript, Vite, Tailwind. Role: login/entry.
- **Backend API**: `nexus-website/backend` — Express, TypeScript, Prisma, PostgreSQL, MongoDB, Socket.io.
- **Dashboard frontend**: `nexus-dashboard` — React 19, TypeScript, Vite. Primary user-facing Nexus app.

**Databases:**
- **PostgreSQL/Prisma** — login website only: users, refresh tokens, pending registrations, password reset tokens, OAuth accounts, dashboard auth handoff. Non-login Prisma schemas (orgs, blog, analytics, chat, orders, payments) are legacy/non-authoritative.
- **MongoDB** — authoritative for all NEXUS domain data: tenants, members, roles, onboarding, business setup, providers, catalog, pricing, wallet, ledger, payments, transactions, allocations, recovery, events, sagas.

Frontends must not connect directly to MongoDB. Dashboard context comes through backend APIs (`/api/me`, `/api/onboarding/status`, `/api/business-setup`). Prefer `/api/v1/*` for new clients.

**Catalog rules:**
- Every offer must have a public image URL; backend applies a Cloudinary default if missing. `CLOUDINARY_URL` is backend-only — never expose to frontend.
- Public contracts use `subOffers` = internal `Variant`. `subOfferId` = `variant_id`. Never add a SubOffer DB entity.
- **Per-tenant voucher pricing = stored markup PERCENTAGE (2026-07-01, Phase 1).** `TenantOfferConfig.variantMarkupPct` (variantId -> pct >= 0) is the tenant's intent; `variantPrices` is its cached absolute projection (the catalog read/display/sort/filter path is unchanged). `PATCH /api/v1/offers/:offerId/tenant-price` body is now `{ markupPct, variantId? }`; `setTenantVoucherPrice` clamps the % to `[0, maxMarkupPct]`, computes `effective = min(base*(1+pct/100), face_value)` (base = variant `member_price`, agorot rounding) and caches it into `variantPrices` + `displayPrice`. Base-change re-sync (`clampTenantVariantPricesToBounds` / `resetTenantPricesForChangedVariants` in `tenant-pricing.service.ts`) recomputes the cached price from the stored % on offer edit + clamps the % if `maxPct` shrank; legacy absolute-only overrides keep their old clamp/snap. Catalog read (`catalog.service.toItem`) exposes `variants[].baseMemberPrice` + `variants[].tenantMarkupPct`. Pure math (`maxMarkupPct`/`markupToPrice`/`clampMarkupPct`/`priceToMarkupPct`) in `supply-price.helper.ts`. **Phase 2 (planned, not built):** adoption becomes a frozen versioned snapshot linked to the global offer id (inventory stays global); global edits do not auto-propagate - adopters see an "updated" indicator + change list + a re-adopt (delete+recreate) button. This will replace the live-base recompute above.
- **Dev-only business-setup relax for global offers (2026-07-01, Phase 2 M2).** The business-setup gate on BOTH ecosystem OFFER CREATE (`offers.routes.ts` create) and ADOPT (`POST /:offerId/adopt`) is enforced ONLY in production, via the pure `isEcosystemBusinessSetupGateEnforced(env.NODE_ENV)` (`services/supply-ecosystem-gate.helper.ts`, true iff `NODE_ENV === 'production'`). Outside production the gate is skipped so the global upload + adopt flow can be tested locally. The dashboard mirrors this: `OfferVisibilityCard` enables the ecosystem radio when `businessSetupComplete || import.meta.env.DEV`, and the Benefits Partnerships adopt handler skips its client-side block when `import.meta.env.DEV`. Production behavior is unchanged (both `import.meta.env.DEV` and the non-prod backend branch are false/inactive in prod).
- **Tenant logo is stored PRISTINE + a crop as metadata (2026-07-01).** `Tenant.logoUrl` holds the uncropped original; `Tenant.logoCrop` (nullable normalized fractions, same shape as offer `imageCrop`) is applied at display time via a Cloudinary transform (frontend `buildOfferImageUrl`), so the crop is FREE (any shape) and reversible. Routes: `POST /api/v1/tenant/logo` (multipart `logo` + optional `crop` JSON), `PATCH /api/v1/tenant/logo/crop` (`{ crop|null }` - adjust/revert without re-upload), `DELETE /api/v1/tenant/logo` (clears both + deletes the Cloudinary asset). `/api/me` exposes `context.tenantLogoCrop`. The catalog read also carries `createdByTenantLogoCrop` so the Benefits Partnerships uploader badge shows the cropped uploader logo. Only ONE Cloudinary asset per logo (the original) - cropping/adjusting/reverting create no new assets, so `delete-login-user` needs no change (it already deletes the owned tenant logo). NOTE: the nexus-wallet logo render sites still show the uncropped original (flagged follow-up).
- **Catalog read exposes the uploading tenant (2026-07-01, Phase 2 M3).** `catalog.service.getTenantCatalogView` batch-joins the creating tenants for the page in ONE `domainTenants.find({ tenantId: { $in } })` (no N+1) and `toItem` exposes `createdByTenantName` / `createdByTenantLogoUrl` / `createdByTenantBrandColor` on each `CatalogItem` (pure `uploaderFieldsFromTenant` maps a tenant doc or the NEXUS-platform sentinel/missing -> "NEXUS"). The dashboard shows these as an "uploaded by <org>" badge on Benefits Partnerships (a dedicated Business column + on cards).
- **Business-setup approval gates ALL tenant supply (2026-07-02, Phase 2 M9).** A non-admin tenant needs `businessSetupApproved` to CREATE (both ecosystem + tenant_only) AND to ADOPT (dev + prod). Re-adopting your OWN offer + platform admins bypass. Decisions live in pure `canTenantCreateOffer` / `canTenantAdoptOffer` (`business-setup-approval.helper.ts`); the create + adopt routes call `isTenantBusinessSetupApproved` then the helper. On-behalf creates store `NexusOffer.uploadedByIdentityId` (acting admin); a platform admin's `getTenantCatalogView` ownedOnly scope = `{ uploadedByIdentityId: { $exists: true } }` (the admin Product Catalog = on-behalf offers). Dashboard: Product Catalog is locked when not approved (only if the tenant has 0 offers; admin-seeded offers stay visible with Create disabled).
- **Admin upload-on-behalf-of-tenant (2026-07-02, Phase 2 M7).** The offer create route accepts an ADMIN-ONLY `onBehalfOfTenantId` (non-admin -> 403; unknown tenant -> 404). When set, the offer is stamped `createdByTenantId`/`createdByIdentityId` = the target tenant + its owner, the admin's chosen visibility is honored (NOT forced ecosystem), and an on-behalf ecosystem offer is written `active` (not `pending_approval`) via `CreateOfferInput.forceActiveStatus` + pure `resolveCreateStatus`/`resolveCreateAttribution` helpers. On-behalf `tenant_only` auto-adopts for the target. Picker source = new `GET /api/v1/admin/tenants/lookup` (ALL tenants, gated + rate-limited, `lookupTenants`) - distinct from `/admin/tenants` (approved-only + pending counts). The M3 uploader badge shows the chosen tenant automatically. Never trust `onBehalfOfTenantId` from a non-admin. **On-behalf offers are Nexus-managed for the owning tenant (2026-07-02 fix):** the owning tenant may NOT edit, delete, or reprice an offer stamped `uploadedByIdentityId`. Enforced in `supply.service.updateOffer`/`deleteOffer` (non-admin owner lookup adds `uploadedByIdentityId: {$exists:false}`) and `tenant-pricing.setTenantVoucherPrice` (returns `owner_locked` -> 403 when `offer.uploadedByIdentityId && offer.createdByTenantId === callerTenant`). Platform admins bypass; ADOPTING tenants keep their own per-tenant price. Catalog read exposes `CatalogItem.uploadedByAdmin` so the dashboard renders the owner's edit/delete/price as locked (tooltip "Managed by Nexus").
- **Business-setup admin approval gates publish + go-live (2026-07-02, Phase 2 M8).** Submitting business setup sets `domain Tenant.businessSetupApproval.status='pending'`; a NEXUS admin approves/denies via `/api/v1/admin/business-setup-approvals` (gated + rate-limited; deny carries a free-text reason emailed to the owner; admins emailed on submit). Ecosystem offer CREATE (`offers.routes.ts`) + GO LIVE (`domain-tenant.routes.ts`) require `isTenantBusinessSetupApproved(tenantId)` in dev AND prod (this SUPERSEDES M2's dev relax for those two gates; ADOPT still uses the M2 `isEcosystemBusinessSetupGateEnforced` prod-only helper). Dev satisfies the gate via `POST /api/business-setup/dev-request` (HARD-DISABLED in production - `env.NODE_ENV !== 'production'`), submitting pending + `devMode:true`. `/api/me` exposes `authorization.businessSetupApproved` (+ `businessSetupApprovalStatus`/`Reason`). The M4 trusted-tenants list (`admin-tenants.service.listAllTenants`) is now `businessSetupApproval.status==='approved'`-only in dev + prod. Use `businessSetupApproved` for these gates, NOT `businessSetupComplete` (submitted).
- **Benefits Partnerships browse is GLOBAL-only (2026-07-01, Phase 2 M5).** `catalog.service.getTenantCatalogView`'s non-`ownedOnly` scope is `{ visibility: 'ecosystem' }` only. A tenant's own `tenant_only` offers are NOT returned by the browse view - they live in Product Catalog (`ownedOnly: true` -> `createdByTenantId === tenantId`). Do NOT re-add a `tenant_only + invitedByTenantId` branch to the browse scope. The status clause still surfaces a tenant's own ecosystem `pending_approval`/`denied` on BP. Only `tenant_only` offers are auto-adopted on create (`offers.routes.ts`); ecosystem offers are never auto-adopted, so an own global offer defaults to not-adopted.
- **Voucher validity is UNIT-LEVEL (2026-06-25, OpenSpec `voucher-unit-level-dating`).** Validity TYPE is **per batch/unit**, not per variant: a unit is self-typed by which fields it carries - `validityValue`/`validityUnit` (the "limit" recipe) OR `validFrom`/`validUntil` (the actual window; authored for `from_until`, empty for `limit` until purchase). `NexusOffer.defaultValidityType` (`limit` | `from_until`) is kept ONLY as the upload-modal's default selection - it does NOT constrain units, and there is **no** per-variant `validityTypeOverride` (removed). Validity is absent from `offerVariantSchema`, `variantSignature` (dedupe), and `validateVoucherVariants`. Each `voucherCodes` unit also has `createdAt` + `updatedAt` (stamped on create + every validity edit). Inventory routes validate each batch as self-contained (`resolveBatchValidity` in `offers.routes.ts` - duration XOR window) and expose `GET .../inventory/units` (paged + date filter, returns created/updated), `POST .../inventory` (add a dated batch), `PATCH`/`DELETE .../inventory/:codeId` (single), and `PATCH .../inventory` (BULK: `{ codeIds[], validity }` via `updateUnitsValidity` - one `updateMany`; response carries the per-unit before->after `changes[]` + `updatedBy`/`updatedAt` audit) - all admin + ownership + voucher-only. No "never expires". Migration: `scripts/backfill-voucher-unit-dating.ts` (stamps each unit from its variant's prior mode; offer default = majority). Purchase-time fill of `validFrom`/`validUntil` for `limit` units is the future redemption flow (nexus-wallet, out of scope).

## Current User Flow

1. User signs in at `nexus-website/src/pages/Login.tsx` (email/password or Google).
2. Frontend calls `/api/auth`. Backend validates against Prisma and issues: access token (JSON) + httpOnly refresh cookie `nexus_refresh`.
3. Website calls `/api/auth/create-code` → one-time dashboard handoff code.
4. Browser redirects to dashboard: `/auth/callback?code=...&redirect=...&lang=...`.
5. Dashboard calls `/api/auth/code-exchange`, stores access token **in memory only**, relies on refresh cookie for session restore.
6. Dashboard calls `/api/me` → MongoDB-derived context → decides: onboarding / member mode / tenant dashboard.
7. Invite links: email opens website login with `dashboardRedirect=/member-invite/accept?token=...`; after auth, SSO redirects to dashboard accept.
8. New registrations via invite: website stores `dashboardRedirect` through signup + email verification, creates SSO code after verification. **Do not redirect verified invite signups to `/workspace`.**
9. Google OAuth must preserve `dashboardRedirect` through `google_oauth_redirect` and `/api/auth/google`.
10. Email/password invite signup stores `dashboardRedirect` in server-side `PendingRegistration.dashboardRedirect` (not just sessionStorage — must survive different browser/device).
11. Multiple invites per email = multiple `tenantMemberInvitations` records. Never replace with a boolean flag. Recover via `/api/v1/member-invitations/mine`.
12. Deployments need matching login-DB migration before email invite signup is complete.

**Auth details:**
- Handoff codes: in-memory, single-use, 30s TTL.
- Access tokens: frontend memory only, 30min TTL.
- Refresh tokens: 30-day rotation via `/api/auth/refresh`. `replacedByTokenHash` chain with 30s grace window prevents bulk-revoke on concurrent refresh.
- Dashboard API deduplicates concurrent refresh calls via `_refreshPromise`, retries once on 401 (`nexus-dashboard/src/lib/api.ts`).
- Cookie: `SameSite=Lax; HttpOnly`. Set `COOKIE_DOMAIN=.nexus-payment.com` in Railway prod for cross-subdomain sharing.
- Unauthenticated dashboard users redirect to website login, preserving current path in `dashboardRedirect`.
- **Login new-device OTP (2026-07-06):** email+password login for a user with ANY non-`member` tenant role on an unrecognized device returns `{ mfaRequired, challengeToken }` instead of tokens (no refresh cookie yet). The website Login card switches to an OTP step (`components/LoginOtpStep.tsx`); `POST /api/auth/mfa/verify` completes it and sets `nexus_refresh` + a 180-day httpOnly `nexus_trusted_device` cookie (path `/api/auth`) that skips the OTP on later logins; `POST /api/auth/mfa/resend` re-sends (1/30s + 5/h per email). Members + Google logins unaffected. Backend: `services/auth/login-mfa.service.ts` (orchestration; `auth.service.login` was replaced by `verifyCredentials` + `performLogin`), `services/auth/login-otp.service.ts`, `services/auth/trusted-device.service.ts`, `services/auth/privileged-role.helper.ts`, routes `routes/auth-mfa.routes.ts`, cookies in `utils/auth-cookies.ts`, Mongo models `models/auth/login-otp.models.ts` + `models/auth/trusted-device.models.ts`. `delete-login-user` removes both collections. The login `rememberMe` field/toggle was REMOVED (schema + UI). Spec: `docs/superpowers/specs/2026-07-06-login-device-otp-design.md`.

## User Types And Onboarding

Identity has two layers:
- **Prisma `User.role`**: `USER`, `ADMIN`, `AGENT` — legacy login-site only. **Do not use for NEXUS tenant auth.**
- **Mongo tenant/member context**: authoritative product identity. Do not confuse Mongo tenant `admin` with Prisma `ADMIN`.

**Tenant billing (Mongo `Tenant.plan`):**
- `basic` = 3 non-member seats, `advanced` = 5, `premium` = 10. New tenants default to `basic`.
- `member` role is unlimited; all other roles consume a seat.
- `/api/me` includes `context.plan` and `context.seats`. Backend enforces limit on invite and role change.

**Dashboard modes from `/api/me`:**
- `needs_workspace_setup` — no active tenant/member record → force `WorkspaceSetupModal`.
- `tenant` — active `tenantMembers` record. Roles: `admin`, `finance`, `operator`, `analyst`, `developer`, `support`, `supply_manager`, `member`.
  - Invited users with only `NexusIdentity` + `TenantMember` (no legacy `tenantMembers`) must still resolve as `tenant`.
  - `/api/me` returns `context.tenantName`, `authorization.canViewMembers`, `authorization.canManageMembers`.
  - Member list includes `invitationStatus` + `invitationExpiresAt`; must include pending-only rows even without a `TenantMember` record.
- `regular_user` — skipped workspace setup; member-only screen.
- `workspace_setup_deferred` — chose complete later; locked/deferred screen.
- `platform_admin` — (2026-07-01, Phase 2 M1) a NEXUS platform admin (`isPlatformAdminEmail`) with NO tenant + NO member. `getMe` overrides the mode to `platform_admin` and returns `onboarding.required=false` (pure decision in `services/onboarding-admin.helper.ts` `isNoTenantPlatformAdmin`), so the dashboard skips the workspace wizard and the admin uses the full dashboard. An admin who IS a tenant member still resolves as `tenant`.

**Admin org management (2026-07-05, `feature/admin-org-management`):** platform admins create tenants ON BEHALF of future owners via `/api/v1/admin/organizations` (`admin-organizations.routes.ts` + `admin-organizations.service.ts`; rate-limited + platform-admin gated). Create reuses `workspaceSetupBodySchema` (+ optional `brandColor`, logo via `POST /:tenantId/logo` reusing `setTenantLogo`) and calls `syncDomainTenantCoreDocs` (extracted from `syncDomainTenantMembership`) - the admin gets NO membership/role rows; `domainTenants.adminCreated` marks these tenants. `POST /:tenantId/owner` assigns ONE external email as `owner`: immediate active membership + owner role + single-language email (`org-owner-email.service.ts`); stored in `domainTenants.ownerAssignment` with `activatedAt` stamped on the owner's first `/api/me` resolution (locks `DELETE /:tenantId/owner`). Blocks: `NEXUS_ADMIN_EMAILS` (`owner_is_platform_admin`) + emails holding owner/admin in ANY tenant (`owner_has_privileged_role`); coded 409s return `{ error, errorHe, code }`. TWO shared changes: context resolution (`getDomainTenantContextForUser` + `resolve-tenant-context.ts`) prefers PRIVILEGED memberships via `utils/preferred-tenant-membership.ts`, and the `owner` role never consumes a seat (`domain-tenant-plan.service.ts`). `delete-login-user`: assigned-owner deletion clears `ownerAssignment` (tenant kept); creator deletion skips admin-created tenants that have an assigned owner.

**Workspace setup** (`POST /api/onboarding/workspace`): creates Mongo `tenants` + `tenantMembers` (role `admin`) + `onboardingStates` (`business_setup_required`).

**Onboarding phone OTP + Monday lead (2026-07-06):** `createWorkspace` gates ISRAELI contact phones - must normalize to a valid 05X mobile AND have a server-side OTP verification (`onboardingPhoneVerifications`, 1h TTL, single-use) written by `POST /api/v1/onboarding/phone-otp/start|verify` (`onboarding-phone-otp.routes.ts` -> `services/onboarding/onboarding-phone-otp.service.ts`, reusing the wallet OTP machinery; SMS WebOTP line binds to `DASHBOARD_URL`). Foreign numbers pass unverified; Israeli-prefixed junk 400s (`classifyOnboardingPhone` in `onboarding-phone.helper.ts`). On success `createWorkspace` fire-and-forgets a Monday "Website Leads" item via `services/monday-lead.service.ts` (board `MONDAY_LEADS_BOARD_ID` default 1767743351, group + column ids live-verified constants; never fails onboarding; no PII in logs). `delete-login-user` covers the new collection.

**Skip options:** `regular_user` → `members` doc + `member_created` state. `complete_later` → `workspace_setup_deferred` state, no tenant/member created.

**Business setup** (`/api/business-setup`): tenant admins only. `GET` = load draft, `PATCH` = save draft, `POST` = submit. Backend derives tenant from Mongo membership; never trust tenant id from browser. Invited members must not be sent to business setup.

## Important Backend Files

**Core:**
- `backend/src/app.ts` — Express setup, CORS, health, route registration, 404/error handling
- `backend/src/routes/v1.routes.ts` — official `/api/v1/*` registry; add new APIs here; legacy `/api/*` kept as aliases
- `backend/src/index.ts` — bootstrap: DB connections, Mongo indexes, seeding, Socket.io, cron, graceful shutdown
- `backend/src/config/env.ts` — source of truth for all env vars
- `backend/src/config/database.ts` — Prisma singleton
- `backend/src/config/mongo.ts` — Mongo singleton (backend only)
- `backend/src/config/cors.ts` — trusted origin policy

**Auth:**
- `backend/src/routes/auth.routes.ts` — register, login, Google, refresh, logout, password reset, email verify, create-code, code-exchange
- `backend/src/services/auth.service.ts` — hashing, Google identity, token issuing, refresh rotation, dashboard one-time code store
- `backend/src/middleware/authenticate.ts` — Bearer token middleware, role guards
- `backend/src/utils/jwt.ts` — token helpers
- `backend/src/utils/crypto.ts` — password/token hashing
- `backend/scripts/delete-login-user.ts` — admin CLI: deletes user by email from Prisma + Mongo domain data. Dry-run by default; requires `--apply`. Use `npx tsx` directly on Windows.
- `backend/scripts/delete-login-user/` — helpers: `index.ts`, `prisma.ts`, `mongo.ts`, `targets.ts`, `types.ts`

**Onboarding/tenant/member:**
- `backend/src/routes/onboarding.routes.ts` — `/api/me`, `/api/onboarding/*`, `/api/business-setup`
- `backend/src/routes/domain-tenant.routes.ts` — `/api/v1/tenant/*`: member list, role list, single/bulk invite, benefits-catalog activate
- `backend/src/routes/domain-member-invitations.routes.ts` — public invite lookup + acceptance at `/api/v1/member-invitations/:token`, pending recovery at `/api/v1/member-invitations/mine`
- `backend/src/services/onboarding.service.ts` — Mongo tenant/member context, workspace creation, skip, business setup
- `backend/src/models/onboarding.models.ts` — Mongo collection names, interfaces, indexes
- `backend/src/schemas/onboarding.schemas.ts` — Zod validation for workspace/business-setup payloads
- `backend/src/services/onboarding-identity.service.ts` — syncs Prisma identity into onboarding/member records
- `backend/src/services/domain-identity.service.ts` — syncs Prisma login users into Mongo `NexusIdentity` + `ContactProfile`; upgrades invited identities on login
- `backend/src/services/domain-member.service.ts` — tenant member management: invite, `NexusIdentity`, `TenantMember`, `TenantUserRole`, `TenantMemberInvitation`
- `backend/src/services/domain-member-read.service.ts` — reads tenant members and role permissions
- `backend/src/services/domain-member-invitation-read.service.ts` — safe invite previews, pending invite list, invite acceptance
- `backend/src/services/domain-member-invite-email.service.ts` — Hebrew/English invite emails with website-login-first accept links
- `backend/src/services/domain-tenant-sync.service.ts` — mirrors legacy onboarding data into domain `Tenant`, `TenantMember`, `TenantUserRole`
- `backend/src/services/domain-permissions.service.ts` — seeds default `RolePermissionMap` on startup; removes stale rows
- `backend/src/services/domain-authorization.service.ts` — resolves domain roles/permissions. Use this (not Prisma `User.role`) for new protected routes.
- `backend/src/services/domain-service-activation.service.ts` — activates tenant services; creates `TenantServiceActivation`, `TenantCatalogPolicy`
- `backend/src/middleware/domain-authorize.ts` — permission middleware for new Mongo-backed routes
- `backend/scripts/backfill-domain-model.ts` — one-time CLI: backfills Prisma users + legacy Mongo into domain records. Dry-run by default; requires `--apply`.

**Domain model (`backend/src/models/domain/`):**
- `identity.models.ts` — `NexusIdentity`, `ContactProfile`, `TenantUserRole`, `RolePermissionMap`
- `tenant.models.ts` — `Tenant`, onboarding state, profile, service activation, `TenantMember`, groups, `TenantCatalogPolicy`
- `orchestration.models.ts` — `PlatformEvent`, `SagaInstance`, `ProcessedStep`, `ConsumedEvent`
- `indexes.ts` — idempotent Mongo indexes; called on startup

**Legacy/other:**
- `backend/src/routes/orgs.routes.ts` + `services/org.service.ts` — legacy Prisma org CRUD. Not the target NEXUS tenant model.
- `backend/src/routes/user.routes.ts` — authenticated self/user, legacy orders/org memberships
- `backend/src/routes/admin.users.routes.ts` — global admin user management
- `backend/src/routes/dashboard.routes.ts` — analytics API; requires `AGENT` or `ADMIN`
- `backend/src/routes/payments.routes.ts` + `services/payment.service.ts` — legacy Stripe/PayPlus. **Not the target. New payments = PayMe + Mongo domain models.**
- `backend/src/routes/chat.routes.ts` + `services/chat.service.ts` — AI/human chat
- `backend/src/socket.ts` — Socket.io rooms, admin broadcast
- `backend/src/jobs/dailyDigest.ts`, `biRefresh.ts` — scheduled jobs
- `backend/prisma/schema.prisma` — PostgreSQL schema
- `backend/prisma/migrations/` — Prisma migrations + `bi_views.sql`
- `backend/prisma/seed.ts` — seed data

## Important Website Frontend Files

- `src/App.tsx` — route tree, language routing
- `src/pages/Login.tsx` — login UI, dashboard handoff code creation
- `src/contexts/AuthContext.tsx` — auth state, Google callback, token memory, refresh, handoff helpers
- `src/lib/api.ts` — API client: credentials, Bearer token, visitor id, auto-refresh on 401
- `src/pages/Signup.tsx`, `VerifyEmailPage.tsx`, `ForgotPassword.tsx`, `ResetPassword.tsx` — account lifecycle
- `src/pages/ApiDocsPage.tsx` — public API docs
- `src/components/GoogleSignIn.tsx` — Google auth entry
- `src/i18n/` — Hebrew/English localization
- `src/components/ProtectedRoute.tsx` — website route gate

Website may contain marketing/public pages. **Tenant/member workflows belong in `nexus-dashboard`.**

## Environment And URLs

**Required backend env** (`src/config/env.ts`):
`FRONTEND_URL`, `DATABASE_URL`, `MONGODB_URI`, `MONGODB_DB`, `ACCESS_TOKEN_SECRET`, `REFRESH_TOKEN_SECRET`, `GOOGLE_CLIENT_ID`

**Optional backend env:**
`BACKEND_URL`, `DASHBOARD_URL`, `USER_MGMT_URL`, `CLOUDINARY_URL` (backend-only), `GOOGLE_CLIENT_SECRET`, `OPENAI_API_KEY`, `EMAIL_ASSET_BASE_URL`, SMTP/SendPulse, MS Graph, WhatsApp, Monday.com, Stripe/PayPlus, VAPID, agent proxy

**Frontend env:**
- Website: `VITE_API_URL` (backend), `VITE_DASHBOARD_URL` (handoff)

**Local ports:** Website: `3000` | Backend: `3001` | Dashboard: `5174`

**Production:** `nexus-payment.com` | `dashboard.nexus-payment.com` | `api.nexus-payment.com`

Never commit production secrets. Keep `.env` local; use Railway variables for prod.

## Database Backups

MongoDB = all NEXUS domain data. PostgreSQL = login/session only. Back up both.

Rules: never commit dumps; never paste URIs into docs; store outside repo, encrypt before cloud upload; test restores in a separate DB; back up Mongo before domain/catalog/payment changes; back up Postgres before Prisma migrations.

```powershell
mongodump --uri "<MONGODB_URI>" --db "<MONGODB_DB>" --archive="backups/mongodb/nexus-YYYY-MM-DD.archive" --gzip
mongorestore --uri "<RESTORE_MONGODB_URI>" --archive="backups/mongodb/nexus-YYYY-MM-DD.archive" --gzip --nsInclude "<MONGODB_DB>.*"

pg_dump --dbname "<DATABASE_URL>" --format=custom --no-owner --no-acl --file "backups/postgres/nexus-login-YYYY-MM-DD.dump"
pg_restore --dbname "<RESTORE_DATABASE_URL>" --clean --if-exists --no-owner --no-acl "backups/postgres/nexus-login-YYYY-MM-DD.dump"
```

## Commands

```powershell
# Website frontend — C:\Nexus\nexus-website
npm run dev | build | lint

# Backend — C:\Nexus\nexus-website\backend
npm run dev | build | db:generate | db:migrate | db:migrate:dev | db:seed
npx tsx scripts/delete-login-user.ts --email=user@example.com [--apply]
npm run domain:backfill [-- --apply]

# All services at once — from C:\Nexus
npm run dev           # website:3000, backend:3001, dashboard:5174
npm run install:all
```

## Branching Strategy

Integration branch: `development`.

**Before any change:** `git checkout development && git pull origin development && git checkout -b <type>/<short-name>`

Branch types: `feature/`, `fix/`, `chore/`, `docs/`, `refactor/`

**Rules:**
- Never work directly on `development`; never merge/push without user approval.
- For changes touching both projects, create matching branches in both repos.
- Backend/domain-only: proceed through small slices, verify yourself.
- Frontend/UI: require manual user check before moving to next UI step.
- Push after stable checkpoint, before risky work, or before handoff.

**Deployment configs:**
- `nexus-website/railway.toml` — website Vite build
- `nexus-website/backend/railway.toml` — Prisma generate + TS build + migrate + `node dist/index.js`
- `nexus-website/metabase/` — Metabase service with own Dockerfile

## Security Boundaries

- Dashboard routes must use backend-protected endpoints and Bearer tokens.
- Backend routes must derive user id from `req.user.sub` only.
- Tenant APIs must derive tenant context from Mongo membership; never trust browser-supplied tenant id.
- Never expose secrets (MONGODB_URI, DATABASE_URL, JWT, OAuth, SMTP, payment, raw refresh tokens) to frontend.
- Access tokens: memory only, never localStorage. Refresh cookie: httpOnly always.
- CORS is a browser boundary only, not API auth. Verify actual middleware wiring on protected routes.
- Use Zod at all API input boundaries.
- Keep admin/platform permissions separate from tenant roles.
- **Frontend guards are UX only — every business rule enforced in the UI must also be enforced in the backend route or service.** A frontend check with no matching backend check is not a guard, it is a hint. Never ship a frontend-only guard for anything that affects data integrity, money, or access control.

## Service Teaser Page Pattern

Every service page in the dashboard must show a professional teaser when `serviceMode === 'inactive'`. Backend has no role here — this is a pure frontend presentation pattern. Reference implementation: `nexus-dashboard/src/components/BenefitsCatalogTeaser.tsx`.

## Coding Standards

- **Production-grade always.** No prototype shortcuts, demo branches, silent failures, or hardcoded secrets.
- **Security:** validate/sanitize inputs, enforce auth/authz server-side, no XSS interpolation, least-privilege.
- **Document all code:** file purpose comment at top; every function documents inputs/outputs; document complex state and security decisions.
- **File size ≤350 lines.** Split when larger.
- **Fail gracefully** with logging; never swallow errors silently.
- **Tests** for behavior, security, data contracts, and shared flows.
- **TypeScript strict:** no `any`; prefer narrow interfaces and `unknown`.
- **React:** functional components, hooks, semantic HTML, ARIA, keyboard nav, fully responsive.
- **Tailwind mobile-first.** Use `cn()` for conditional classes.
- **UI/frontend changes:** always invoke `ui-ux-pro-max` or `frontend-design` skill before implementing.
- **Design consistency:** read 2+ existing pages before adding a new one. No ad-hoc color tokens.
- **Skeleton loading mandatory:** `animate-pulse` skeleton on every API-dependent page. No blank screens while loading.
- **NEVER commit or push without explicit user approval.** Workflow: stage → diff summary → caveman-commit message → wait for "yes/go ahead" → commit/push. No exceptions.

## Unbreakable Rules

- Update `progress.md` before final response when meaningful work happened.
- Update `CLAUDE.md` + `specs.md` when architecture, flows, routes, DB contracts, or security behavior change.
- Work on feature/fix branch from `development`; never directly on `development`; never merge without user approval.
- New APIs use `/api/v1/*`. Keep `/api/*` as compatibility aliases only.
- MongoDB = NEXUS domain data. Prisma = login website only.
- All billing/payments = PayMe + Mongo domain models. Never Stripe/PayPlus for new work.
- Never expose `nexus_price` or secrets to frontend. Backend stays as modular monolith.
- Check `progress.md` before marking done.

## Agent Working Rules

- Start with specific files listed above; check `nexus-files/` first for heavy features.
- Auth/security → inspect route middleware and service code.
- New backend APIs → `/api/v1/*`.
- Env/deployment → check Railway config + `src/config/env.ts` first.
- DB changes → state explicitly: MongoDB-only or requires Prisma migration.
- Mongo onboarding changes → update interfaces, indexes, schemas, services, and dashboard API types together.
- `delete-login-user.ts` must remove Prisma login records + Mongo domain records (invitations by email, identity, tenant member, owned tenant).
- Frontend auth changes → test full chain: login → handoff code → dashboard exchange → `/api/me` → refresh restore → logout.
- Do not modify `_recycled/` without explicit user request.
- Windows git safe-directory: `git -c safe.directory='C:/Nexus/nexus-website' ...`
- Windows Prisma: stop backend process before `prisma generate`, migrations, or build to avoid `.dll.node` file lock.

## Known Drift Points

Re-check when touched:
- CORS allow-list: `backend/src/config/cors.ts`
- Production URLs: frontend env files or Railway variables
- Auth handoff: `auth.routes.ts`, `AuthContext.tsx`
- Onboarding context: `onboarding.service.ts`
- `.env.example` lags `src/config/env.ts`; prefer `env.ts`
