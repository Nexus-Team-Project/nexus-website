/**
 * Post-onboarding tenant contact-phone change with OTP re-verification for
 * Israeli mobile numbers. Reuses the wallet's low-level phone-OTP primitives
 * (same SMS provider, same bcrypt-hashed challenge, same 10-minute TTL,
 * single-use via its own verifiedAt guard) rather than onboarding's separate
 * (userId, phone) verification record - start and save happen in one request
 * here, so no bridging record is needed.
 */
import { Db } from 'mongodb';
import { startPhoneOtp, confirmPhoneOtpChallenge } from './auth/phone-otp.service';
import { classifyOnboardingPhone } from './onboarding/onboarding-phone.helper';
import { DASHBOARD_OTP_HOST } from './onboarding/onboarding-phone-otp.service';
import { updateTenantIdentity, type TenantIdentityView } from './tenant-identity.service';

/**
 * Sends an SMS OTP for an Israeli mobile the caller wants to set as the
 * tenant's contact phone.
 * @throws { status: 400 } Error('invalid_israeli_phone') for non-Israeli / malformed numbers.
 */
export async function startTenantPhoneChange(
  db: Db,
  args: { phone: string; ip: string },
): Promise<{ challengeId: string; __testCode?: string }> {
  const classified = classifyOnboardingPhone(args.phone);
  if (classified.kind !== 'israeli') {
    throw Object.assign(new Error('invalid_israeli_phone'), { status: 400 });
  }
  // __testCode is only present under NODE_ENV=test (see startPhoneOtp); the
  // route strips it before responding, same convention as the onboarding
  // phone-OTP route.
  return startPhoneOtp(db, { phone: classified.normalized, ip: args.ip, smsHost: DASHBOARD_OTP_HOST });
}

/**
 * Saves a new tenant contact phone. Israeli mobiles require a matching,
 * unexpired, unconsumed OTP challenge (challengeId + otpCode) whose own phone
 * equals the requested phone, or the change is rejected. Foreign numbers save
 * directly with no verification, mirroring onboarding's classification rule.
 * @throws { status: 400 } for a missing code, an invalid Israeli-prefixed
 *         number, or a challenge issued for a different phone; propagates
 *         confirmPhoneOtpChallenge's otp_invalid/otp_locked for wrong/expired/
 *         reused codes.
 */
export async function saveTenantPhone(
  db: Db,
  args: {
    tenantId: string;
    callerIdentityId: string;
    phone: string;
    challengeId?: string;
    otpCode?: string;
  },
): Promise<TenantIdentityView> {
  const classified = classifyOnboardingPhone(args.phone);
  if (classified.kind === 'invalid_israeli') {
    throw Object.assign(new Error('invalid_israeli_phone'), { status: 400 });
  }

  let savedPhone = args.phone.trim();
  if (classified.kind === 'israeli') {
    if (!args.challengeId || !args.otpCode) {
      throw Object.assign(new Error('otp_required'), { status: 400 });
    }
    const { phone: verifiedPhone } = await confirmPhoneOtpChallenge(db, {
      challengeId: args.challengeId,
      code: args.otpCode,
    });
    if (verifiedPhone !== classified.normalized) {
      throw Object.assign(new Error('otp_phone_mismatch'), { status: 400 });
    }
    savedPhone = classified.normalized;
  }

  return updateTenantIdentity(db, {
    tenantId: args.tenantId,
    callerIdentityId: args.callerIdentityId,
    contactPhone: savedPhone,
  });
}
