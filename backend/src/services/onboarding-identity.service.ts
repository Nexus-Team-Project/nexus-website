/**
 * Keeps Mongo onboarding identity fields aligned with the authenticated Prisma user.
 * Mongo still uses `userId` as the stable key, while email is stored for search and member management.
 */
import { getMongoDb } from '../config/mongo';
import { normalizeEmail } from '../config/platform-admins';
import { getOnboardingCollections } from '../models/onboarding.models';

/**
 * Saves the current normalized email on every Mongo onboarding membership for a user.
 * Input: Prisma user id and current Prisma email from trusted auth data.
 * Output: matching Mongo member documents have an up-to-date email field.
 */
export async function syncOnboardingMemberEmail(userId: string, email: string): Promise<void> {
  const db = await getMongoDb();
  const collections = getOnboardingCollections(db);
  const normalizedEmail = normalizeEmail(email);

  await Promise.all([
    collections.tenantMembers.updateMany(
      { userId, email: { $ne: normalizedEmail } },
      { $set: { email: normalizedEmail, updatedAt: new Date() } },
    ),
    collections.members.updateMany(
      { userId, email: { $ne: normalizedEmail } },
      { $set: { email: normalizedEmail, updatedAt: new Date() } },
    ),
  ]);
}
