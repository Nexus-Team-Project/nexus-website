/**
 * Phone OTP for an ALREADY-AUTHENTICATED identity — adding a phone to a Google
 * account during onboarding, or changing it from the wallet profile. Unlike the
 * login phone-OTP this mints no session: the verified phone is simply attached
 * to the caller's NexusIdentity (and mirrored onto their tenant rows).
 */
import { Db } from 'mongodb';
import { startPhoneOtp, confirmPhoneOtpChallenge } from '../auth/phone-otp.service';
import { attachPhoneToIdentity, requireIsraeliPhone, PhoneAttachError } from './phone-attach.service';
import { getIdentityDomainCollections } from '../../models/domain';

/**
 * Send an OTP to a phone the caller wants to attach. Validates Israel-only and
 * rejects the caller's CURRENT number (no pointless re-OTP) BEFORE spending an
 * SMS.
 * @throws PhoneAttachError('phone_not_israeli' | 'phone_unchanged') |
 *         'sms_unavailable' | rate limits.
 */
export async function startWalletPhoneOtp(
  db: Db,
  args: { phone: string; ip: string; userAgentHash?: string; nexusIdentityId: string },
): Promise<{ challengeId: string; __testCode?: string }> {
  const phone = requireIsraeliPhone(args.phone);
  // Block re-verifying the number the caller already has, before any SMS cost.
  const { nexusIdentities } = getIdentityDomainCollections(db);
  const self = await nexusIdentities.findOne(
    { nexusIdentityId: args.nexusIdentityId },
    { projection: { phone: 1 } },
  );
  if (self?.phone === phone) throw new PhoneAttachError('phone_unchanged');
  return startPhoneOtp(db, { phone, ip: args.ip, userAgentHash: args.userAgentHash });
}

/**
 * Verify the OTP code and attach the now-verified phone to the caller.
 * @throws otp_invalid | otp_locked | PhoneAttachError('phone_in_use').
 */
export async function verifyWalletPhoneOtp(
  db: Db,
  args: { nexusIdentityId: string; challengeId: string; code: string },
): Promise<{ phone: string }> {
  const { phone } = await confirmPhoneOtpChallenge(db, {
    challengeId: args.challengeId,
    code: args.code,
  });
  return attachPhoneToIdentity(db, {
    nexusIdentityId: args.nexusIdentityId,
    phone,
    verified: true,
  });
}
