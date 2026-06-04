/**
 * Phone OTP for an ALREADY-AUTHENTICATED identity — adding a phone to a Google
 * account during onboarding, or changing it from the wallet profile. Unlike the
 * login phone-OTP this mints no session: the verified phone is simply attached
 * to the caller's NexusIdentity (and mirrored onto their tenant rows).
 */
import { Db } from 'mongodb';
import { startPhoneOtp, confirmPhoneOtpChallenge } from '../auth/phone-otp.service';
import { attachPhoneToIdentity, requireIsraeliPhone } from './phone-attach.service';

/**
 * Whether InforU SMS is configured. The test-attach path is only permitted when
 * it is NOT — a dev stopgap until the env vars are set; it must never run in
 * production once SMS is live.
 */
export function isInforuConfigured(): boolean {
  return Boolean(process.env.INFORU_USER && process.env.INFORU_TOKEN);
}

/**
 * Send an OTP to a phone the caller wants to attach. Validates Israel-only
 * before spending an SMS.
 * @throws PhoneAttachError('phone_not_israeli') | 'sms_unavailable' | rate limits.
 */
export async function startWalletPhoneOtp(
  db: Db,
  args: { phone: string; ip: string; userAgentHash?: string },
): Promise<{ challengeId: string }> {
  requireIsraeliPhone(args.phone);
  return startPhoneOtp(db, args);
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

/**
 * TEST-ONLY: attach the phone WITHOUT an OTP (saved unverified). Exercises the
 * full DB write path while InforU is not configured. Route-gated by
 * isInforuConfigured(); never reachable once SMS is live.
 * @throws PhoneAttachError('phone_not_israeli' | 'phone_in_use').
 */
export async function attachWalletPhoneTest(
  db: Db,
  args: { nexusIdentityId: string; phone: string },
): Promise<{ phone: string }> {
  return attachPhoneToIdentity(db, {
    nexusIdentityId: args.nexusIdentityId,
    phone: args.phone,
    verified: false,
  });
}
