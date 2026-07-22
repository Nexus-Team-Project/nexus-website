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
- **Per-tenant voucher pricing = stored markup PERCENTAGE (2026-07-01, Phase 1).** `TenantOfferConfig.variantMarkupPct` (variantId -> pct >= 0) is the tenant's intent; `variantPrices` is its cached absolute projection (the catalog read/display/sort/filter path is unchanged). `PATCH /api/v1/offers/:offerId/tenant-price` body is now `{ markupPct, variantId? }`; `setTenantVoucherPrice` clamps the % to `[0, maxMarkupPct]`, computes `effective = min(base*(1+pct/100), face_value)` (base = variant `member_price`, agorot rounding) and caches it into `variantPrices` + `displayPrice`. Base-change re-sync (`clampTenantVariantPricesToBounds` / `resetTenantPricesForChangedVariants` in `tenant-pricing.service.ts`) recomputes the cached price from the stored % on offer edit + clamps the % if `maxPct` shrank; legacy absolute-only overrides keep their old clamp/snap. Catalog read (`catalog.service.toItem`) exposes `variants[].baseMemberPrice` + `variants[].tenantMarkupPct`. Pure math (`maxMarkupPct`/`markupToPrice`/`clampMarkupPct`/`priceToMarkupPct`) in `supply-price.helper.ts`. **Amendment (2026-07-19) - no subsidy + whole-shekel, enforced server-side:** `setTenantVoucherPrice` no longer floors the absolute price at `0` (the below-base subsidy) or stores agorot. Both branches now funnel through `price = min(ceil(rawPrice), face_value)` where the absolute path uses `rawPrice = max(memberPrice, base)` and the legacy markup path uses `markupToPrice(...)` (already base-floored at 0%) - so every stored per-tenant price is a WHOLE shekel in `[base, face_value]`. This mirrors + enforces the dashboard popover so a crafted request cannot price below base or with decimals (`roundAgorot` import dropped from `tenant-pricing.service.ts`). The deal-price RE-SYNC helpers (`clampTenantVariantPricesToBounds` / `resetTenantPricesForChangedVariants`, run on owner face/`nexus_cost` edits) were deliberately left at floor `0` - a different flow that cannot push below base unless the offer is misconfigured. Spec: `../docs/superpowers/specs/2026-07-19-voucher-tenant-price-no-subsidy-whole-shekel-design.md`. **Amendment (2026-07-19b) - owner never has a per-tenant price:** the tenant that UPLOADED an offer (`createdByTenantId === caller`) may NOT set a per-tenant selling price on it - `setTenantVoucherPrice` returns `owner_locked` for ANY such caller (broadened from the on-behalf-only check at M7; platform admins exempt; the `/tenant-price` route threads `isPlatformAdmin` into the service). The catalog read (`getTenantCatalogView` + `getTenantOfferDetail`) applies per-tenant overrides (`variantPrices`/`variantMarkupPct`/`memberPrice`/`displayPrice`) ONLY to adopters (`!isOwnOffer`), never to the owner's OWN offer, so a stale/leftover override (even from an `excluded` adoption) never masks the base `member_price` - the owner always shows the sale price it set in Edit Offer. **Phase 2 (planned, not built):** adoption becomes a frozen versioned snapshot linked to the global offer id (inventory stays global); global edits do not auto-propagate - adopters see an "updated" indicator + change list + a re-adopt (delete+recreate) button. This will replace the live-base recompute above.
- **NEXUS FEE on voucher offers (2026-07-20, spec `../docs/superpowers/specs/2026-07-19-nexus-fee-design.md`).** Every voucher offer carries `NexusOffer.nexusFeePct` (default `NEXUS_FEE_DEFAULT_PCT = 10`, range 0..100, MAY be fractional) - the platform's cut of each variant's margin (`face_value - nexus_cost`). The fee-inflated price is BAKED into `variant.member_price` at write time: `applyNexusFee(cost, face, pct) = min(face, ceil(roundAgorot(cost + pct% * margin)))` (`supply-price.helper.ts`, with `nexusFeeAmount` for the raw amount receipts will read). Bake points: create + edit (`buildVoucherVariants(variants, flat, feePct)` - REQUIRED third param; client-sent variant `member_price` is IGNORED when cost+face are present), the two admin endpoints below, and `scripts/backfill-nexus-fee.ts` (dry-run default; run `--apply` per environment on deploy AFTER a Mongo backup). Admin-only endpoints (both `resolveTenantContext().isPlatformAdmin`-gated, voucher-only): `PATCH /api/v1/offers/:offerId/nexus-fee` `{ pct }` (sets the offer fee, re-bakes all variants) and `PATCH /api/v1/offers/:offerId/variants/:variantId/sale-price` `{ salePrice }` (edits one variant's `nexus_cost` in (0, face], fee % untouched, member_price re-bakes). Both re-sync adopter configs: `syncTenantPricesToFeeFloor` (tenant-pricing.service; overrides below the NEW fee floor snap UP, above are preserved, capped at face) - the sale-price endpoint uses `resetTenantPricesForChangedVariants` for tenant_only offers (snap-to-base) instead. `nexusFeePct` is exposed on `CatalogItem` ONLY to platform admins (voucher offers; pre-backfill docs read as the default) - tenants NEVER see the fee anywhere. Also (same change): `GET /api/v1/offers/platform` gained `orgSearch` (free-text on the creating tenant's organizationName, resolved to tenantIds server-side, capped $in), and `inStockOnly` now derives voucher stock from AVAILABLE `voucherCodes` units via async `buildInStockClause` (offer.stockLimit null must not read as unlimited for vouchers; legacy semantics kept for non-vouchers; applied to admin + member views).
- **Voucher branch-list link (2026-07-20).** `NexusOffer.branchListUrl` (optional, voucher-only - forced `null` server-side for other execution types, the inverse of the `implementationLink` voucher-null gate) is OFFER-LEVEL ONLY (never per-variant, unlike terms/`implementationInstructions`). Validated **https-only** (`httpsUrlSchema` in `offers.routes.ts`, both create + update schemas; update preprocesses `''` -> `null` to support clearing). `CreateOfferInput`/`UpdateOfferInput` + the Mongo doc builders in `supply.service.ts` mirror the `implementationLink` plumbing exactly (just the voucher-gate direction flipped), and `catalog.service.toItem` exposes it on `CatalogItem` so every catalog read (tenant/member/ecosystem) carries it with no extra plumbing. Spec: `../docs/superpowers/specs/2026-07-20-voucher-branch-list-link-design.md`. **2026-07-22: two more fields with the IDENTICAL contract at every site - `regulationsUrl` (תקנון) + `returnPolicyUrl` (מדיניות החזרות).** Authored below the branch-list field, shown as Benefits Partnerships columns / Product Catalog links / OfferModal rows / wallet offer-page buttons (wallet buttons render only when set). Spec: `../docs/superpowers/specs/2026-07-22-voucher-regulations-return-policy-links-design.md`.
- **Dev-only business-setup relax for global offers (2026-07-01, Phase 2 M2; superseded).** Historical: the M2 gate relax applied to ecosystem OFFER CREATE and ADOPT. CREATE is now governed by M9/M8 (dev + prod), and the ADOPT gate was removed entirely (2026-07-15) - `isEcosystemBusinessSetupGateEnforced` (`services/supply-ecosystem-gate.helper.ts`) currently has no caller. The dashboard `OfferVisibilityCard` still enables the ecosystem radio when `businessSetupComplete || import.meta.env.DEV`.
- **Tenant logo is stored PRISTINE + a crop as metadata (2026-07-01).** `Tenant.logoUrl` holds the uncropped original; `Tenant.logoCrop` (nullable normalized fractions, same shape as offer `imageCrop`) is applied at display time via a Cloudinary transform (frontend `buildOfferImageUrl`), so the crop is FREE (any shape) and reversible. Routes: `POST /api/v1/tenant/logo` (multipart `logo` + optional `crop` JSON), `PATCH /api/v1/tenant/logo/crop` (`{ crop|null }` - adjust/revert without re-upload), `DELETE /api/v1/tenant/logo` (clears both + deletes the Cloudinary asset). `/api/me` exposes `context.tenantLogoCrop`. The catalog read also carries `createdByTenantLogoCrop` so the Benefits Partnerships uploader badge shows the cropped uploader logo. Only ONE Cloudinary asset per logo (the original) - cropping/adjusting/reverting create no new assets, so `delete-login-user` needs no change (it already deletes the owned tenant logo). NOTE: the nexus-wallet logo render sites still show the uncropped original (flagged follow-up). **Admin branding for ANY tenant (2026-07-12):** platform admins edit any org's logo + brand color via `admin-tenant-branding.routes.ts` at `/api/v1/admin/tenants/:tenantId/logo` (POST upload / PATCH `/crop` / DELETE) + `PATCH .../brand-color` - same `tenant-logo.service` functions, but the tenantId is the URL param (admin has no membership); platform-admin gated (`resolveTenantContext().isPlatformAdmin`) + `apiLimiter` + a tenant-existence check (404). `lookupTenants` now also returns `logoCrop`. Powers the dashboard Settings > Appearance page for admins (searchable org picker). Spec: `docs/superpowers/specs/2026-07-12-admin-appearance-branding-design.md`. **Background removal (2026-07-20):** every stored logo is now the BACKGROUND-REMOVED transparent PNG - `setTenantLogoHosted` (the convergence point for ALL logo paths: self file/URL + both admin flows) runs `removeLogoBackground` (`utils/cloudinary-background.ts`: Cloudinary's built-in `e_background_removal/f_png` derived URL, polls HTTP 423 up to ~40s, re-uploads the PNG via `uploadTenantLogo`, deletes the intermediate original - still ONE asset per logo). Never throws: on failure/timeout the ORIGINAL logo (with background) is stored + a warning logged - removal never fails an upload. Dimensions are preserved so `logoCrop` fractions stay valid. Spec: `docs/superpowers/specs/2026-07-20-logo-background-removal-design.md`.
- **Tenant COVER gallery + add-image-by-URL (2026-07-17, change `voucher-image-url-and-tenant-cover`).** Tenants have an ORDERED cover-image gallery `Tenant.coverImages: {url, crop|null}[]` (max `TENANT_COVER_IMAGES_MAX`=5; same pristine+crop pattern as the logo, one Cloudinary asset per entry in `nexus/tenant-covers`). Managed by ONE reconcile-style save - self `POST /api/v1/tenant/cover` (multipart `covers[]` + `newFileCrops` + `remoteImages` + `keptImages` JSON; stored order = kept -> files -> remote; dropped entries' assets are DELETED) + `DELETE /api/v1/tenant/cover`; admin variants at `/api/v1/admin/tenants/:tenantId/cover` (`tenant-cover.service.ts` + `tenant-cover.helper.ts`). Exposed on `/api/me` (`context.tenantCoverImages`), the public tenant lookup (`coverImages` - powers the wallet offer-page hero; >1 = 5s slideshow), and admin `lookupTenants`; covered by `account-deletion`. **Add image by URL:** the logo POST routes (self + admin) accept `imageUrl` XOR the file (re-hosted via `uploadOfferImageFromUrl(url, folder)` - CLOUDINARY fetches the remote image, never our server, and ONLY the re-hosted URL is persisted); offer create/update accept `remoteImages` JSON `[{url, crop|null}]` appended after files (voucher single-image rule counts them). All URL inputs are http(s)-only + capped at `MAX_IMAGE_URL_LENGTH` (2048) via `isUploadableImageUrl`. **Cover dominant colors (2026-07-20):** every cover upload (file `uploadTenantCover` + URL `uploadTenantCoverFromUrl`) also requests Cloudinary's `colors=true` analysis (a signed upload param, free - part of the upload response) and stores up to 3 picked hexes on `TenantCoverImage.colors` (pure `utils/dominant-color.ts` `pickDominantColors`: near-white/near-black filtered so a white logo background never wins). `setTenantCovers` RE-ATTACHES stored colors to kept entries by URL (the reconcile wire never carries colors - do not remove that merge or every re-save wipes them). The colors ride `createdByTenantCoverImage` into both wallet catalog feeds automatically (shared type) and tint the wallet store-tile bottom fade. Backfill for pre-existing covers: `scripts/backfill-cover-colors.ts` (Admin API + basic auth, throttled, dry-run default - run `--apply` per env on deploy). Spec: `../docs/superpowers/specs/2026-07-20-store-tile-color-fade-design.md`.
- **Catalog read exposes the uploading tenant (2026-07-01, Phase 2 M3).** `catalog.service.getTenantCatalogView` batch-joins the creating tenants for the page in ONE `domainTenants.find({ tenantId: { $in } })` (no N+1) and `toItem` exposes `createdByTenantName` / `createdByTenantLogoUrl` / `createdByTenantBrandColor` on each `CatalogItem` (pure `uploaderFieldsFromTenant` maps a tenant doc or the NEXUS-platform sentinel/missing -> "NEXUS"). The dashboard shows these as an "uploaded by <org>" badge on Benefits Partnerships (a dedicated Business column + on cards). **2026-07-20:** the WALLET feeds (`getMemberCatalogView` + `getEcosystemCatalogView`) additionally project `coverImages` into that join and expose `createdByTenantCoverImage` (the creator's FIRST cover entry, `{url, crop|null}`) so wallet store tiles render the creator's cover background with no per-tenant `GET /api/v1/public/tenants/:id` request; the dashboard views (`getTenantCatalogView`/`getTenantOfferDetail`) do not project it.
- **Business-setup approval gates offer CREATE only (2026-07-02, Phase 2 M9; ADOPT gate REMOVED 2026-07-15).** A non-admin tenant needs `businessSetupApproved` to CREATE (both ecosystem + tenant_only). Platform admins bypass. Decision lives in pure `canTenantCreateOffer` (`business-setup-approval.helper.ts`); the create route calls `isTenantBusinessSetupApproved` then the helper. ADOPT (`POST /:offerId/adopt`) has NO business-setup gate at all - any tenant with `catalog.adopt_offer` may adopt regardless of approval status (`canTenantAdoptOffer` + the dashboard `adoptBlocked` toggle-disable/tooltip were deleted). On-behalf creates store `NexusOffer.uploadedByIdentityId` (acting admin); a platform admin's `getTenantCatalogView` ownedOnly scope = `{ uploadedByIdentityId: { $exists: true } }` (the admin Product Catalog = on-behalf offers). Dashboard: Product Catalog is locked when not approved (only if the tenant has 0 offers; admin-seeded offers stay visible with Create disabled).
- **Admin upload-on-behalf-of-tenant (2026-07-02, Phase 2 M7).** The offer create route accepts an ADMIN-ONLY `onBehalfOfTenantId` (non-admin -> 403; unknown tenant -> 404). When set, the offer is stamped `createdByTenantId`/`createdByIdentityId` = the target tenant + its owner, the admin's chosen visibility is honored (NOT forced ecosystem), and an on-behalf ecosystem offer is written `active` (not `pending_approval`) via `CreateOfferInput.forceActiveStatus` + pure `resolveCreateStatus`/`resolveCreateAttribution` helpers. On-behalf `tenant_only` auto-adopts for the target. Picker source = new `GET /api/v1/admin/tenants/lookup` (ALL tenants, gated + rate-limited, `lookupTenants`) - distinct from `/admin/tenants` (approved-only + pending counts). The M3 uploader badge shows the chosen tenant automatically. Never trust `onBehalfOfTenantId` from a non-admin. **On-behalf offers are Nexus-managed for the owning tenant (2026-07-02 fix):** the owning tenant may NOT edit, delete, or reprice an offer stamped `uploadedByIdentityId`. Enforced in `supply.service.updateOffer`/`deleteOffer` (non-admin owner lookup adds `uploadedByIdentityId: {$exists:false}`) and `tenant-pricing.setTenantVoucherPrice` (returns `owner_locked` -> 403 when `offer.uploadedByIdentityId && offer.createdByTenantId === callerTenant`). Platform admins bypass; ADOPTING tenants keep their own per-tenant price. Catalog read exposes `CatalogItem.uploadedByAdmin` so the dashboard renders the owner's edit/delete/price as locked (tooltip "Managed by Nexus").
- **Business-setup admin approval gates publish + go-live (2026-07-02, Phase 2 M8).** Submitting business setup sets `domain Tenant.businessSetupApproval.status='pending'`; a NEXUS admin approves/denies via `/api/v1/admin/business-setup-approvals` (gated + rate-limited; deny carries a free-text reason emailed to the owner; admins emailed on submit). Ecosystem offer CREATE (`offers.routes.ts`) + GO LIVE (`domain-tenant.routes.ts`) require `isTenantBusinessSetupApproved(tenantId)` in dev AND prod (this SUPERSEDES M2's dev relax for those two gates; ADOPT is not gated on business setup at all since 2026-07-15). Dev satisfies the gate via `POST /api/business-setup/dev-request` (HARD-DISABLED in production - `env.NODE_ENV !== 'production'`), submitting pending + `devMode:true`. `/api/me` exposes `authorization.businessSetupApproved` (+ `businessSetupApprovalStatus`/`Reason`). The M4 trusted-tenants list (`admin-tenants.service.listAllTenants`) is now `businessSetupApproval.status==='approved'`-only in dev + prod. Use `businessSetupApproved` for these gates, NOT `businessSetupComplete` (submitted).
- **Admin-offer auto-adopt (2026-07-16).** An ADMIN OFFER (`uploadedByIdentityId` set + `visibility 'ecosystem'` + `status 'active'` + `NOT_DELETED`) is auto-adopted into every ELIGIBLE tenant's catalog (active `benefits_catalog` `TenantServiceActivation` + `Tenant.autoAdoptAdminOffers !== false`, default true). Implementation: `services/admin-offer-auto-adopt.service.ts` (`autoAdoptOfferForAllTenants` fan-out, `autoAdoptAdminOffersForTenant` catch-up incl. `dryRun`, `setAutoAdoptAdminOffers` toggle). Triggers (all best-effort, never fail the parent flow): on-behalf ecosystem CREATE (`offers.routes.ts`), platform-admin visibility flip to ecosystem on an on-behalf offer (`supply.service.updateOffer`), catalog activation (`activateBenefitsCatalogForUser`), toggle enable (`PATCH /api/v1/tenant/auto-adopt-admin-offers`, gate `catalog.adopt_offer`, returns `{ ok, adoptedCount }`). SAFETY INVARIANT: every write is a `$setOnInsert`-only upsert - an existing `TenantOfferConfig` row of ANY status is never modified (a tenant's `excluded` cancellation is permanently respected; catch-up also skips any offer with an existing row). Regular tenant offers never auto-adopt. Retroactive backfill: `scripts/backfill-admin-offer-adoption.ts` (dry-run default, `--apply`). `/api/me` exposes `context.autoAdoptAdminOffers` + `authorization.canAdoptOffers`. Spec: `../docs/superpowers/specs/2026-07-16-admin-offer-auto-adopt-design.md`.
- **Benefits Partnerships browse is GLOBAL-only (2026-07-01, Phase 2 M5).** `catalog.service.getTenantCatalogView`'s non-`ownedOnly` scope is `{ visibility: 'ecosystem' }` only. A tenant's own `tenant_only` offers are NOT returned by the browse view - they live in Product Catalog (`ownedOnly: true` -> `createdByTenantId === tenantId`). Do NOT re-add a `tenant_only + invitedByTenantId` branch to the browse scope. The status clause still surfaces a tenant's own ecosystem `pending_approval`/`denied` on BP. Only `tenant_only` offers are auto-adopted on create (`offers.routes.ts`); ecosystem offers are never auto-adopted, so an own global offer defaults to not-adopted.
- **CATALOG-SEARCH module for the wallet feeds (2026-07-21, change `openspec/changes/wallet-store-search-filter-sort/`).** Both wallet feeds (`GET /api/v1/offers/:tenantId` member + `GET /api/v1/wallet/ecosystem-offers`) now obtain their offer docs through ONE narrow module `backend/src/services/catalog-search/` (`searchCatalog({context, query})` - context gates: adopted set / ecosystem visibility / active / open validity, NEVER search-scored). Engines: **Atlas Search** (`ATLAS_SEARCH_ENABLED=true` in env.ts; Mongo must be on Atlas) runs fuzzy `$search` (maxEdits 1, prefix 1) over `title` + `descriptionText` UNIONed with creator tenants matched via a second index over `domainTenants.organizationName` + `businessDescription` (a SEARCH MIRROR of `tenantProfiles.businessDescription`, write-through in `syncDomainTenantCoreDocs` - the single profile write funnel); **regex fallback** (default, used by tests/CI + non-Atlas envs) is the same contract minus typo tolerance. Search indexes (`offers_search`, `tenants_search`; 2 of M0's 3-index budget) are code-managed at boot (`ensureSearchIndexes`, flag-gated, never throws). `CatalogSearchCache` seam = no-op today; Redis later = one new implementation via `setCatalogSearchCache`, zero caller changes. NEW stored offer fields (MongoDB-only): `descriptionText` (HTML-stripped mirror of `description`, engines never match raw HTML) and base `cashbackMinPct`/`cashbackMaxPct` (integer %, from variant `face_value` vs fee-baked `member_price`), both stamped by `offer-search-fields.helper.ts` at EVERY `displayPrice` write site (create/update/nexus-fee/variant-sale-price) and B-tree indexed; backfill/repair: `scripts/backfill-search-fields.ts` (dry-run default, also mirrors businessDescription; run `--apply` per env after a Mongo backup, before enabling the flag). Query contract additions in `catalogListQuerySchema`: `stackable=with|without` (any-variant match, offer-level fallback, no-signal offers match neither) and sorts `cashback_desc` (ecosystem = indexed Mongo sort, nulls last) / `cashback_asc` (JS nulls-last) / `title_asc` (Hebrew collation); member-feed cashback/price sorts rank by the tenant's EFFECTIVE values (override map) via the existing JS effective-sort pattern. Deploy order: fields+backfill are additive first, flag on second, wallet UI last; paramless requests behave exactly as before.
- **Wallet "Nexus catalog" = default pricing (2026-07-19).** The switcher's `all` context is served by `GET /api/v1/wallet/ecosystem-offers` (`wallet-tenants.routes.ts`), now backed by `getEcosystemCatalogView` (`services/wallet/ecosystem-catalog-view.service.ts`). It returns EVERY `visibility:'ecosystem'` + `status:'active'` offer at its DEFAULT (base) price - as a non-member would see it - by reusing the exported `catalog.service.toItem` with an EMPTY per-tenant override context (no `TenantOfferConfig` join), so `nexus_cost` stays stripped and the item shape/`{items,pagination}` envelope match the member catalog. Unlike the old thin feed it does NOT exclude offers the caller's tenants adopted/re-priced (they appear here at base price). Cashback is NOT a backend field - the wallet derives it from `face_value` vs price, so base pricing yields default cashback for free. Authenticated only; reuses the exported `catalogListQuerySchema`. The prior thin `ecosystem-catalog.service.ts` (`getEcosystemCatalogForWallet`, adopted-offer exclusion) was DELETED.
- **Voucher validity is UNIT-LEVEL (2026-06-25, OpenSpec `voucher-unit-level-dating`).** Validity TYPE is **per batch/unit**, not per variant: a unit is self-typed by which fields it carries - `validityValue`/`validityUnit` (the "limit" recipe) OR `validFrom`/`validUntil` (the actual window; authored for `from_until`, empty for `limit` until purchase). `NexusOffer.defaultValidityType` (`limit` | `from_until`) is kept ONLY as the upload-modal's default selection - it does NOT constrain units, and there is **no** per-variant `validityTypeOverride` (removed). Validity is absent from `offerVariantSchema`, `variantSignature` (dedupe), and `validateVoucherVariants`. Each `voucherCodes` unit also has `createdAt` + `updatedAt` (stamped on create + every validity edit). Inventory routes validate each batch as self-contained (`resolveBatchValidity` in `offers.routes.ts` - duration XOR window) and expose `GET .../inventory/units` (paged + date filter, returns created/updated), `POST .../inventory` (add a dated batch), `PATCH`/`DELETE .../inventory/:codeId` (single), and `PATCH .../inventory` (BULK: `{ codeIds[], validity }` via `updateUnitsValidity` - one `updateMany`; response carries the per-unit before->after `changes[]` + `updatedBy`/`updatedAt` audit) - all admin + ownership + voucher-only. No "never expires". Migration: `scripts/backfill-voucher-unit-dating.ts` (stamps each unit from its variant's prior mode; offer default = majority). Purchase-time fill of `validFrom`/`validUntil` for `limit` units is the future redemption flow (nexus-wallet, out of scope). **Read-side (2026-07-17):** `GET /api/v1/offers/:offerId/inventory/counts` also returns `validity` - per-variant DISTINCT validity batches aggregated from the units (`services/voucher-validity-summary.service.ts`; window-first classification, identical batches merged across dormant leftover fields, nearest-expiring first, capped 12/variant) - so the dashboard variant table shows real validity; same numbers/dates-only exposure and `catalog.view` gate as the counts. **2026-07-22:** the same response also returns `bought` - per-variant count of units members already PURCHASED (`status` assigned + redeemed; `getOfferVariantInventoryCounts` now returns `{counts, bought}` from one variant+status aggregation) - powering the dashboard's Bought column + the inventory modal's left/bought chips (left = counts - bought). Same exposure envelope (numbers only).

## Payments - PayMe + SUMIT (2026-07-21, sandbox)

Wallet voucher purchases run on PayMe (sandbox until go-live; prod switch = env values only). Spec: `../docs/superpowers/specs/2026-07-21-payme-sandbox-integration-design.md`; curated provider docs: `../docs/paymeDocs/`; credentials: `../docs/paymeDocs/credentials.local.md` (gitignored).

- **Provider boundaries** (the ONLY files with provider wire shapes): `backend/src/services/payme/payme.client.ts` (generate-sale token charge, refund; PaymeError codes; integer agorot) and `backend/src/services/sumit/sumit.client.ts` (receipt create + pdf; decimal shekels; `IsDraft: true` outside production - the SUMIT company is the REAL Nexus books).
- **Collections** (`models/payments/wallet-payments.models.ts`, both in account-deletion): `walletPaymentCards` (PayMe `buyer_key` token + mask/brand/expiry; buyerKey NEVER serialized to clients) and `walletPurchases` (one doc per attempt carrying `quantity` units 1..`PURCHASE_MAX_QUANTITY`; only lookup indexes - the old `uniq_active_purchase_per_variant` unique index + `active` flag were REMOVED with multi-quantity, superseded by the per-customer cap below).
- **Purchase flow** (`services/wallet/purchase.service.ts`): card ownership check -> server-side price via `purchase-pricing.helper.ts` (mirrors catalog pricing exactly: adopter override, owner base, ecosystem base; shekels -> agorot) -> insert pending -> **PER-CUSTOMER CAP (2026-07-22, `purchase-quantity.helper.ts`): a customer may hold at most `PURCHASE_MAX_QUANTITY`=5 units of one variant CUMULATIVE across their pending+completed purchases (refunded/failed free the allowance); enforced insert-then-recount so concurrent attempts see each other's pending docs - violation -> purchase marked failed + `quantity_limit` (409), nothing charged. The wallet mirrors the cap on the stepper (owned units subtracted) and localizes the error** -> CLAIM `quantity` `voucherCodes` units `available->assigned` BEFORE charging (not enough -> `out_of_stock`) -> `paymeChargeToken` (failure -> units released + `card_declined`) -> completed + fire-and-forget SUMIT receipt (`purchase-receipt.service.ts`, outcome on `purchase.receipt`, never fails the purchase). Inventory/collection helpers live in `purchase-inventory.helper.ts` (shared with the IPN handler). Installments: `PURCHASE_INSTALLMENTS = 1` (single seam for the future).
- **Routes**: `POST/GET /api/v1/wallet/purchases[/mine]` + `GET /api/v1/wallet/purchases/:purchaseId/receipt` (PDF proxy) in `wallet-purchases.routes.ts`; saved cards `GET/POST/DELETE /api/v1/wallet/payment-cards` in `wallet-payment-cards.routes.ts`; PayMe IPN `POST /api/v1/payments/payme/callback` in `payme-callback.routes.ts` (public, urlencoded, ALWAYS 200; reconciliation matches purchaseId + payme_sale_id + exact price and ignores everything else). **IPN verification (2026-07-22):** before acting, the handler verifies the callback SERVER-TO-SERVER via `paymeGetSale` (`POST /get-sales`, authenticated by our client key - `payme-ipn-verify.helper.ts`; used because PayMe did not provide the `payme_signature` formula, and stronger than an MD5 check anyway). A verdict of `mismatch` (PayMe's records contradict the callback) is ignored in EVERY env; `unavailable` (lookup failed / PayMe env missing) fails CLOSED in production and OPEN elsewhere so sandbox/dev/test flows keep working. The old mock `purchase.routes.ts` stub was REMOVED.
- **Dev callbacks**: PayMe rejects localhost - run `cloudflared tunnel --url http://localhost:3001` and set `PAYME_CALLBACK_BASE_URL` (falls back to `BACKEND_URL`). Tenant stock needs NO dashboard change - claiming a unit lowers the `available` count everywhere.

## Current User Flow

1. User signs in at `nexus-website/src/pages/Login.tsx` (email/password or Google).
2. Frontend calls `/api/auth`. Backend validates against Prisma and issues: access token (JSON) + httpOnly refresh cookie `nexus_refresh`.
3. Website calls `/api/auth/create-code` → one-time dashboard handoff code.
4. Browser redirects to dashboard: `/auth/callback?code=...&redirect=...&lang=...`.
5. Dashboard calls `/api/auth/code-exchange`, stores access token **in memory only**, relies on refresh cookie for session restore.
6. Dashboard calls `/api/me` → MongoDB-derived context → decides: onboarding / member mode / tenant dashboard.
7. Invite links: ALL new invites are PRIVILEGED-staff (2026-07-15: `member` was removed from the create-invite roles enum; regular members join ONLY via the wallet join-request flow) and open website login with `dashboardRedirect=/member-invite/accept?token=...`; after auth, SSO redirects to dashboard accept. Privileged invites are stamped with ALL `SERVICE_KEYS` server-side (the client no longer sends `services`); every invite consumes a seat. EXISTING pending `['member']` invitations keep working: their read/accept paths (incl. the wallet-link email built by `buildMemberInviteUrl` and `reconcilePendingInvitations`) are untouched. **Regular-member outreach (2026-07-15):** the dashboard Members page instead sends a service-scoped SMS/email blast - `POST /api/v1/tenant/contacts/outreach` (+ `/preview` $facet counts, `GET /api/v1/tenant/services`) rides the member-invite job queue with `kind: 'service_outreach'` (worker sends InforU SMS + `service-outreach-email.service.ts` email carrying a self-hosted short link `GET /l/:code` -> `shortLinks` collection, stamps `TenantContact.serviceInvites.<key>`); generic job aliases `GET/POST /api/v1/tenant/jobs/:jobId[/retry-failed]`. Contacts require email OR Israeli phone (partial unique indexes `uniq_tenant_email_partial`/`uniq_tenant_phone_partial`); the member catalog gate is now membership + active tenant catalog (`catalog-member-gate.service.ts` - member `services` array no longer consulted; role upgrade stamps ALL SERVICE_KEYS, downgrade clears). Wallet additions: `GET /api/v1/wallet/contact-matches` (match-screen candidates from tenant contact lists) + `POST /api/v1/wallet/email/{start,verify}` (email attach; verify re-issues the session). Spec: `../docs/superpowers/specs/2026-07-15-members-service-invite-design.md`.
8. New registrations via invite: website stores `dashboardRedirect` through signup + email verification, creates SSO code after verification. **Do not redirect verified invite signups to `/workspace`.**
9. Google OAuth must preserve `dashboardRedirect` through `google_oauth_redirect` and `/api/auth/google`.
10. Email/password invite signup stores `dashboardRedirect` in server-side `PendingRegistration.dashboardRedirect` (not just sessionStorage — must survive different browser/device).
11. Multiple invites per email = multiple `tenantMemberInvitations` records. Never replace with a boolean flag. Recover via `/api/v1/member-invitations/mine`.
12. Deployments need matching login-DB migration before email invite signup is complete.

**Auth details:**
- Handoff codes: in-memory, single-use, 30s TTL.
- **Wallet session endpoints are SLIM (2026-07-22, spec `../docs/superpowers/specs/2026-07-22-wallet-session-perf-design.md`):** `POST /api/v1/auth/refresh` (`routes/auth-refresh.routes.ts`, registered BEFORE the legacy auth router in `v1.routes.ts`) rotates the cookie exactly like `/api/auth/refresh` but returns ONLY `{accessToken}` - no `getUserProfile` query/payload; the legacy route is unchanged for website + dashboard. `GET /api/v1/wallet/me` (`routes/wallet-me.routes.ts` + `services/wallet/wallet-me.service.ts`) is the wallet's session hydration: exactly the wallet `WalletMe` contract (user, memberships-derived minimal context, memberships, defaultTenantId, profile, phone, phoneVerifiedAt, marketingConsent) resolved in one parallel wave - NEVER add dashboard/admin fields (plan, seats, permissions, approval state) to it. Same change: `getMe` (`onboarding.service.ts`) resolves its post-sync lookups in ONE `Promise.all` and fetches the `domainTenants` doc ONCE (status + branding in one projection); `syncDomainIdentityForLoginUser` (`domain-identity.service.ts`) has a read-only fast path that skips its 3 upserts when the identity + email contact profile already match the login user.
- Access tokens: frontend memory only, 30min TTL.
- Refresh tokens: 30-day rotation via `/api/auth/refresh`. `replacedByTokenHash` chain with 30s grace window prevents bulk-revoke on concurrent refresh.
- Dashboard API deduplicates concurrent refresh calls via `_refreshPromise`, retries once on 401 (`nexus-dashboard/src/lib/api.ts`).
- Cookie: `SameSite=Lax; HttpOnly`. Set `COOKIE_DOMAIN=.nexus-payment.com` in Railway prod for cross-subdomain sharing.
- Unauthenticated dashboard users redirect to website login, preserving current path in `dashboardRedirect`.
- **Wallet email magic-link auth (2026-07-16, REPLACED the 2026-07-14 email+password flow):** the nexusWallet email sign-in is now a passwordless one-time link via `POST /api/v1/auth/magic-link/{start,consume}` (`routes/wallet-magic-link.routes.ts` -> `services/auth/wallet-magic-link.service.ts`). `/start` mints a 256-bit token, stores only its sha256 hash in the new Mongo `walletMagicLinks` collection (`models/auth/wallet-magic-link.models.ts`; 15-min TTL index, unique `tokenHash`, single-use `consumedAt`), and emails a link to the wallet CONFIRM-CLICK page `/:lang/auth/magic` (`services/email/wallet-magic-link-email.service.ts`); it ALWAYS returns `{ ok: true }` (non-enumerating) and throws 503 `magic_unavailable` if `WALLET_URL` is unset. `/consume` atomically claims the token (single-use; 400 `link_invalid` for unknown/expired/used), then reuses `resolveWalletIdentity` (find-or-create, unknown email = auto-signup, email verified by the link) + `issueWalletSession` + `reconcilePendingInvitations` - the exact email-OTP/Google pipeline, so the post-login flow is unchanged. Per-email send limits (1/30s + 5/h) via `wallet-rate-limit.ts`; token never logged; no device binding (documented tradeoff). `walletMagicLinks` is covered by `account-deletion/mongo.ts`. **Removed:** all wallet email+password code (`wallet-password.routes.ts`, `wallet-password.service.ts`, `wallet-password-email.service.ts`) and the `wallet_login|wallet_signup|wallet_reset` purposes + `pendingPasswordHash` from `login-otp` (reverted to website new-device-MFA only). **Untouched:** the website's own email+password login/register/reset and `utils/password-policy.ts` (website still enforces it). Wallet links (magic + member-invite) and the SMS-OTP autofill origin all follow `env.WALLET_URL` (set per environment: localhost locally, the deploy host on Railway). Spec: `docs/superpowers/specs/2026-07-16-wallet-email-magic-link-auth-design.md`.
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

**Onboarding phone OTP + Monday lead (2026-07-06):** `createWorkspace` gates ISRAELI contact phones - must normalize to a valid 05X mobile AND have a server-side OTP verification (`onboardingPhoneVerifications`, 1h TTL, single-use) written by `POST /api/v1/onboarding/phone-otp/start|verify` (`onboarding-phone-otp.routes.ts` -> `services/onboarding/onboarding-phone-otp.service.ts`, reusing the wallet OTP machinery; SMS WebOTP line binds to `DASHBOARD_URL`). Foreign numbers pass unverified; Israeli-prefixed junk 400s (`classifyOnboardingPhone` in `onboarding-phone.helper.ts`). On success `createWorkspace` fire-and-forgets a Monday "Website Leads" item via `services/monday-lead.service.ts` (board `MONDAY_LEADS_BOARD_ID` default 1767743351, group + column ids live-verified constants; never fails onboarding; phones never logged). The contact-sales route also creates a lead (message in the Company text column + item update). Monday leads are PRODUCTION-only - outside `NODE_ENV=production` both creators log a skip and do nothing. `POST /api/v1/onboarding/phone-otp/dev-skip` marks a phone verified without SMS: allowed outside production for anyone, and for NEXUS platform admins (`isPlatformAdminEmail(req.user.email)`) in production too; 404 for non-admins in prod. `delete-login-user` covers the new collection.

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
- `backend/scripts/delete-login-user/index.ts` — CLI arg parsing only; the actual cleanup logic (2026-07-14) lives in `backend/src/services/account-deletion/` (`prisma.ts`, `mongo.ts`, `targets.ts`, `types.ts`) so it can also be called from a route, not just the CLI.
- `backend/src/routes/dev.routes.ts` — TEMPORARY: `POST /api/v1/dev/self-delete` lets the authenticated caller delete their OWN account + all their tenants/offers (same cleanup as the CLI script). Hard-disabled (404) in production. Backs the nexusWallet AND nexus-dashboard dev-only "delete my account" buttons (both in the profile/logout menu); remove all sides together once no longer needed.

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

- **Abstract swappable services behind one module.** When implementing (or touching) an integration with a third-party or internal service that could plausibly change, gain a second provider, or need a different implementation later (payment gateway, SMS/email sender, storage/CDN, auth provider, search, etc.), wrap it behind a narrow interface in its own module - callers depend on that module's contract, never on the vendor SDK/client directly. Swapping or adding a provider then means editing one file, not hunting through every call site across the codebase. Do not add this abstraction for something that will only ever have one implementation (do not over-engineer a wrapper nobody will swap).
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
- **Never add the agent as a co-author, coworker, or helper in commits or PRs.** No `Co-Authored-By: Claude ...` trailer (or any AI-attribution line) in commit messages or PR descriptions.

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
