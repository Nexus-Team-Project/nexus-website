/**
 * Resolve the authenticated caller's NexusIdentity (id, email, display name)
 * from the request. Identity is keyed by the verified session email — never a
 * browser-supplied id — so it is safe for tenant-scoped writes. Returns null
 * when no identity owns that email.
 */
import type { Request } from 'express';
import { getMongoDb } from '../../config/mongo';
import { getIdentityDomainCollections } from '../../models/domain';

export interface CallingNexusIdentity {
  nexusIdentityId: string;
  email: string;
  displayName?: string;
}

/**
 * @param req authenticated Express request (req.user.email is set).
 * @returns the caller's identity summary, or null when no identity exists.
 */
export async function getCallingNexusIdentity(
  req: Request,
): Promise<CallingNexusIdentity | null> {
  const email = req.user!.email.toLowerCase().trim();
  const db = await getMongoDb();
  const { nexusIdentities } = getIdentityDomainCollections(db);
  const doc = await nexusIdentities.findOne(
    { normalizedEmail: email },
    { projection: { nexusIdentityId: 1, displayName: 1 } },
  );
  if (!doc) return null;
  return { nexusIdentityId: doc.nexusIdentityId, email, displayName: doc.displayName };
}
