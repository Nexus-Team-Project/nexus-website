import { OrgRole } from '@prisma/client';
import { prisma } from '../config/database';

// ─── Slug helpers ─────────────────────────────────────────────────

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\u0590-\u05ff]+/g, '-') // keep Hebrew chars
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

async function uniqueSlug(base: string): Promise<string> {
  let slug = base;
  let attempt = 0;
  while (true) {
    const exists = await prisma.organization.findUnique({ where: { slug } });
    if (!exists) return slug;
    attempt++;
    slug = `${base}-${attempt + 1}`;
  }
}

// ─── Role hierarchy ───────────────────────────────────────────────

const ROLE_RANK: Record<OrgRole, number> = {
  OWNER: 3,
  ADMIN: 2,
  MEMBER: 1,
};

export function roleRank(role: OrgRole): number {
  return ROLE_RANK[role];
}

// ─── CRUD ─────────────────────────────────────────────────────────

export interface CreateOrgInput {
  name: string;
  nameHe?: string;
  logoUrl?: string;
  primaryColor?: string;
  plan?: string;
  websiteUrl?: string;
  isPremium?: boolean;
  isPublished?: boolean;
  /** userId of the creator — will be added as OWNER */
  creatorId: string;
  /** override auto-generated slug */
  slug?: string;
}

export async function createOrg(input: CreateOrgInput) {
  const baseSlug = input.slug ? toSlug(input.slug) : toSlug(input.name);
  const slug = await uniqueSlug(baseSlug);

  return prisma.organization.create({
    data: {
      slug,
      name: input.name,
      nameHe: input.nameHe,
      logoUrl: input.logoUrl,
      primaryColor: input.primaryColor,
      plan: input.plan,
      websiteUrl: input.websiteUrl,
      isPremium: input.isPremium ?? false,
      isPublished: input.isPublished ?? false,
      members: {
        create: {
          userId: input.creatorId,
          role: 'OWNER',
        },
      },
    },
    include: { members: { include: { user: { select: { id: true, email: true, fullName: true, avatarUrl: true } } } } },
  });
}

export async function listOrgs() {
  return prisma.organization.findMany({
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { members: true } } },
  });
}

export async function getOrgBySlug(slug: string) {
  return prisma.organization.findUnique({
    where: { slug },
    include: { _count: { select: { members: true } } },
  });
}

export interface UpdateOrgInput {
  name?: string;
  nameHe?: string;
  logoUrl?: string;
  primaryColor?: string;
  plan?: string;
  websiteUrl?: string;
  isPremium?: boolean;
  isPublished?: boolean;
}

export async function updateOrg(slug: string, data: UpdateOrgInput) {
  return prisma.organization.update({
    where: { slug },
    data,
  });
}

export async function deleteOrg(slug: string) {
  return prisma.organization.delete({ where: { slug } });
}

// ─── Membership ───────────────────────────────────────────────────

/** Find a user's membership in an org — null if not a member */
export async function getMembership(orgId: string, userId: string) {
  return prisma.organizationMember.findUnique({
    where: { userId_orgId: { userId, orgId } },
  });
}

/** Add a user to an org by email. If already a member, updates role. */
export async function addMember(orgSlug: string, email: string, role: OrgRole = 'MEMBER') {
  const org = await prisma.organization.findUnique({ where: { slug: orgSlug } });
  if (!org) throw Object.assign(new Error('Organization not found'), { status: 404 });

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw Object.assign(new Error('User not found'), { status: 404 });

  return prisma.organizationMember.upsert({
    where: { userId_orgId: { userId: user.id, orgId: org.id } },
    create: { userId: user.id, orgId: org.id, role },
    update: { role },
    include: { user: { select: { id: true, email: true, fullName: true, avatarUrl: true } } },
  });
}

export async function listMembers(orgSlug: string) {
  const org = await prisma.organization.findUnique({ where: { slug: orgSlug } });
  if (!org) throw Object.assign(new Error('Organization not found'), { status: 404 });

  return prisma.organizationMember.findMany({
    where: { orgId: org.id },
    orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
    include: {
      user: { select: { id: true, email: true, fullName: true, avatarUrl: true, createdAt: true, lastLoginAt: true } },
    },
  });
}

export interface UpdateMemberInput {
  role?: OrgRole;
  displayName?: string;
  avatarUrl?: string;
  title?: string;
}

export async function updateMember(orgSlug: string, userId: string, data: UpdateMemberInput) {
  const org = await prisma.organization.findUnique({ where: { slug: orgSlug } });
  if (!org) throw Object.assign(new Error('Organization not found'), { status: 404 });

  // If promoting to OWNER, demote previous owner to ADMIN
  if (data.role === 'OWNER') {
    await prisma.organizationMember.updateMany({
      where: { orgId: org.id, role: 'OWNER', userId: { not: userId } },
      data: { role: 'ADMIN' },
    });
  }

  return prisma.organizationMember.update({
    where: { userId_orgId: { userId, orgId: org.id } },
    data,
    include: { user: { select: { id: true, email: true, fullName: true, avatarUrl: true } } },
  });
}

export async function removeMember(orgSlug: string, userId: string) {
  const org = await prisma.organization.findUnique({ where: { slug: orgSlug } });
  if (!org) throw Object.assign(new Error('Organization not found'), { status: 404 });

  return prisma.organizationMember.delete({
    where: { userId_orgId: { userId, orgId: org.id } },
  });
}

/** All orgs a user belongs to, with their role in each */
export async function getUserOrgs(userId: string) {
  return prisma.organizationMember.findMany({
    where: { userId },
    orderBy: { joinedAt: 'asc' },
    include: {
      org: {
        include: { _count: { select: { members: true } } },
      },
    },
  });
}

// ─── Invites ──────────────────────────────────────────────────────

export interface CreateInviteInput {
  orgSlug: string;
  createdBy: string;
  role?: OrgRole;
  label?: string;
  maxUses?: number;
  expiresInDays?: number;
}

export async function createInvite(input: CreateInviteInput) {
  const org = await prisma.organization.findUnique({ where: { slug: input.orgSlug } });
  if (!org) throw Object.assign(new Error('Organization not found'), { status: 404 });

  const expiresAt = input.expiresInDays
    ? new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000)
    : null;

  return prisma.orgInvite.create({
    data: {
      orgId: org.id,
      createdBy: input.createdBy,
      role: input.role ?? 'MEMBER',
      label: input.label,
      maxUses: input.maxUses ?? null,
      expiresAt,
    },
    include: { org: { select: { id: true, slug: true, name: true, logoUrl: true, primaryColor: true } } },
  });
}

export async function listInvites(orgSlug: string) {
  const org = await prisma.organization.findUnique({ where: { slug: orgSlug } });
  if (!org) throw Object.assign(new Error('Organization not found'), { status: 404 });

  return prisma.orgInvite.findMany({
    where: { orgId: org.id },
    orderBy: { createdAt: 'desc' },
    include: { org: { select: { id: true, slug: true, name: true } } },
  });
}

export async function deleteInvite(orgSlug: string, inviteId: string) {
  const org = await prisma.organization.findUnique({ where: { slug: orgSlug } });
  if (!org) throw Object.assign(new Error('Organization not found'), { status: 404 });

  const invite = await prisma.orgInvite.findFirst({ where: { id: inviteId, orgId: org.id } });
  if (!invite) throw Object.assign(new Error('Invite not found'), { status: 404 });

  return prisma.orgInvite.delete({ where: { id: inviteId } });
}

/** Public: validate token and return invite + org info */
export async function getInviteByToken(token: string) {
  const invite = await prisma.orgInvite.findUnique({
    where: { token },
    include: { org: { select: { id: true, slug: true, name: true, nameHe: true, logoUrl: true, primaryColor: true, _count: { select: { members: true } } } } },
  });
  if (!invite) throw Object.assign(new Error('Invalid invite link'), { status: 404 });
  if (invite.expiresAt && invite.expiresAt < new Date()) {
    throw Object.assign(new Error('This invite link has expired'), { status: 410 });
  }
  if (invite.maxUses !== null && invite.useCount >= invite.maxUses) {
    throw Object.assign(new Error('This invite link has reached its maximum uses'), { status: 410 });
  }
  return invite;
}

/** Authenticated: accept an invite — add user to org, bump useCount */
export async function acceptInvite(token: string, userId: string) {
  const invite = await getInviteByToken(token); // validates expiry/maxUses

  // Upsert membership (idempotent — if already a member, role stays as-is)
  const existing = await prisma.organizationMember.findUnique({
    where: { userId_orgId: { userId, orgId: invite.orgId } },
  });

  let membership;
  if (existing) {
    // Already a member — just return current membership
    membership = existing;
  } else {
    membership = await prisma.organizationMember.create({
      data: { userId, orgId: invite.orgId, role: invite.role },
    });
    // Increment use count
    await prisma.orgInvite.update({
      where: { id: invite.id },
      data: { useCount: { increment: 1 } },
    });
  }

  return { membership, org: invite.org, alreadyMember: !!existing };
}
