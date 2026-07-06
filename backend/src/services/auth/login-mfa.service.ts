/**
 * Orchestrates the website email+password login with the new-device OTP
 * second factor for privileged tenant users. Order of operations is
 * security-relevant: credentials are verified FIRST (so an attacker cannot
 * probe privilege without a valid password), and NO session token or
 * refresh token exists until either (a) the user is not privileged,
 * (b) the device is trusted, or (c) the OTP is verified.
 * Spec: docs/superpowers/specs/2026-07-06-login-device-otp-design.md
 */
import { prisma } from '../../config/database';
import { getMongoDb } from '../../config/mongo';
import { verifyCredentials, issueTokens } from '../auth.service';
import { userHasPrivilegedTenantRole } from './privileged-role.helper';
import { isTrustedDevice, issueTrustedDevice } from './trusted-device.service';
import { startLoginOtpChallenge, verifyLoginOtpChallenge } from './login-otp.service';
import { createError } from '../../middleware/errorHandler';

/** Request metadata forwarded into token + device rows for auditing. */
interface RequestMeta {
  userAgent?: string;
  ipAddress?: string;
}

/** performLogin result: a full session, or an OTP challenge to complete. */
export type LoginOutcome =
  | { kind: 'session'; accessToken: string; rawRefreshToken: string; userId: string }
  | { kind: 'mfa_required'; challengeToken: string };

/** Stamps lastLoginAt; kept identical to the legacy login behavior. */
async function stampLastLogin(userId: string): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
}

/**
 * Website email+password login entry point.
 * Input: credentials, the trusted-device cookie value (or null), email
 * language for the OTP mail, and request metadata.
 * Output: a session (tokens) or an mfa_required challenge token.
 */
export async function performLogin(args: {
  email: string;
  password: string;
  trustedDeviceToken: string | null;
  lang: 'he' | 'en';
} & RequestMeta): Promise<LoginOutcome> {
  const user = await verifyCredentials(args.email, args.password);
  const db = await getMongoDb();

  const privileged = await userHasPrivilegedTenantRole(db, user.email);
  const trusted =
    privileged && args.trustedDeviceToken
      ? await isTrustedDevice(db, { prismaUserId: user.id, rawToken: args.trustedDeviceToken })
      : false;

  if (!privileged || trusted) {
    await stampLastLogin(user.id);
    const tokens = await issueTokens(user.id, user.email, user.role, {
      userAgent: args.userAgent,
      ipAddress: args.ipAddress,
    });
    return { kind: 'session', ...tokens };
  }

  const { challengeToken } = await startLoginOtpChallenge(db, {
    prismaUserId: user.id,
    email: user.email,
    ip: args.ipAddress ?? null,
    lang: args.lang,
  });
  return { kind: 'mfa_required', challengeToken };
}

/**
 * Completes an OTP challenge: verifies the code, issues the session, and
 * trusts the device for future logins.
 * Output: tokens + the raw trusted-device cookie token.
 * Throws otp_invalid / otp_locked from the challenge service, 401 when the
 * user vanished between start and verify.
 */
export async function completeLoginOtp(args: {
  challengeToken: string;
  code: string;
} & RequestMeta): Promise<{
  accessToken: string;
  rawRefreshToken: string;
  userId: string;
  trustedDeviceToken: string;
}> {
  const db = await getMongoDb();
  const { prismaUserId } = await verifyLoginOtpChallenge(db, {
    challengeToken: args.challengeToken,
    code: args.code,
  });

  const user = await prisma.user.findUnique({ where: { id: prismaUserId } });
  if (!user) throw createError('Invalid email or password', 401);

  await stampLastLogin(user.id);
  const tokens = await issueTokens(user.id, user.email, user.role, {
    userAgent: args.userAgent,
    ipAddress: args.ipAddress,
  });
  const trustedDeviceToken = await issueTrustedDevice(db, {
    prismaUserId: user.id,
    userAgent: args.userAgent ?? null,
    ipAddress: args.ipAddress ?? null,
  });
  return { ...tokens, trustedDeviceToken };
}
