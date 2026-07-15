/**
 * Wallet email+password auth orchestration: SEPARATE login vs register intents
 * (a login typo never creates an account) with MANDATORY email 2FA on every
 * login (no trusted-device skip, by design), and the code-based forgot-password
 * flow (which also SETS a first password for passwordless wallet/Google
 * accounts). Reuses the loginOtpChallenges machinery via purpose-tagged
 * challenges. Enumeration posture: unknown-email forgot returns a decoy token,
 * and login's invalid_credentials never says whether the account exists or
 * merely has no password; register does reveal existence via account_exists,
 * which is inherent to any register form. Passwords/codes never logged.
 * Spec: docs/superpowers/specs/2026-07-14-wallet-email-password-auth-design.md
 */
import { Db } from 'mongodb';
import { prisma } from '../../config/database';
import { hashPassword, comparePassword, generateToken, hashToken } from '../../utils/crypto';
import { isPasswordPolicyCompliant } from '../../utils/password-policy';
import { LOGIN_OTP_COLLECTION, type LoginOtpChallenge } from '../../models/auth/login-otp.models';
import {
  startLoginOtpChallenge,
  verifyLoginOtpChallenge,
  type StartLoginOtpResult,
} from './login-otp.service';
import { assertRateLimit, countRecentEvents, recordEvent } from './wallet-rate-limit';
import { resolveWalletIdentity, type ResolvedWalletIdentity } from './wallet-identity.service';

/** Per-account lockout: 5 FAILED password attempts per email per 15 minutes. */
const FAIL_BUCKET = 'pwd_fail';
const FAIL_WINDOW_SEC = 15 * 60;
const MAX_FAILED_ATTEMPTS = 5;

const normalize = (e: string): string => e.trim().toLowerCase();

/**
 * Email+password entry point. The caller states an explicit intent so login and
 * registration are separate actions (a login typo must never create an account):
 *
 * - intent 'login' (default): existing account + matching password -> wallet_login
 *   2FA challenge (code emailed). Wrong password, a passwordless account, OR an
 *   unknown email -> invalid_credentials. NOTHING is ever created here. The
 *   unknown-email case is NOT counted toward the lockout (no account to protect,
 *   and it would let anyone lock an email they do not own); a wrong password on a
 *   real account still counts.
 * - intent 'signup': unknown email -> wallet_signup challenge stashing
 *   bcrypt(password) (the 2FA code doubles as email verification). An email that
 *   already exists -> account_exists (the UI sends the user to sign in instead).
 *
 * Output: the challenge token the client holds for verify/resend.
 * @throws account_locked | invalid_credentials | account_exists | weak_password | rate_limited:*
 */
export async function startPasswordLogin(
  db: Db,
  args: {
    email: string;
    password: string;
    ip: string | null;
    lang: 'he' | 'en';
    intent?: 'login' | 'signup';
  },
): Promise<StartLoginOtpResult> {
  const email = normalize(args.email);
  const intent = args.intent ?? 'login';
  const failures = await countRecentEvents(db, {
    bucket: FAIL_BUCKET,
    key: email,
    windowSec: FAIL_WINDOW_SEC,
  });
  // Locked even for a correct password: a brute-forcer must not be able to
  // confirm a hit while the account is locked.
  if (failures >= MAX_FAILED_ATTEMPTS) throw new Error('account_locked');

  const user = await prisma.user.findUnique({ where: { email } });

  if (intent === 'signup') {
    // Register: refuse an email that already has an account (the client offers
    // "sign in instead"); otherwise stash the policy-checked new password on a
    // signup challenge until the 2FA code verifies the mailbox.
    if (user) throw new Error('account_exists');
    if (!isPasswordPolicyCompliant(args.password)) throw new Error('weak_password');
    const pendingPasswordHash = await hashPassword(args.password);
    return startLoginOtpChallenge(db, {
      prismaUserId: null,
      email,
      ip: args.ip,
      lang: args.lang,
      purpose: 'wallet_signup',
      pendingPasswordHash,
    });
  }

  // Login: an unknown email is a generic invalid_credentials (no account made,
  // not counted toward lockout). A real account with the wrong/no password is
  // the same generic error, but does count.
  if (!user) throw new Error('invalid_credentials');
  const ok = user.passwordHash ? await comparePassword(args.password, user.passwordHash) : false;
  if (!ok) {
    await recordEvent(db, { bucket: FAIL_BUCKET, key: email });
    throw new Error('invalid_credentials');
  }
  return startLoginOtpChallenge(db, {
    prismaUserId: user.id,
    email,
    ip: args.ip,
    lang: args.lang,
    purpose: 'wallet_login',
  });
}

/**
 * Complete a wallet_login / wallet_signup 2FA challenge. Resolves (or
 * creates) the paired Prisma User + NexusIdentity, applies a stashed signup
 * password (never overwriting an existing hash - the race guard), and stamps
 * lastLoginAt. The route mints the session (it owns the Response).
 * Output: the resolved wallet identity for session minting.
 * @throws otp_invalid | otp_locked
 */
export async function completePasswordChallenge(
  db: Db,
  args: { challengeToken: string; code: string },
): Promise<ResolvedWalletIdentity> {
  const v = await verifyLoginOtpChallenge(db, args);
  if (v.purpose !== 'wallet_login' && v.purpose !== 'wallet_signup') throw new Error('otp_invalid');

  const resolved = await resolveWalletIdentity({ email: v.email, verifiedPhone: null });
  if (v.purpose === 'wallet_signup' && v.pendingPasswordHash) {
    // Race guard: only set the password if none exists (the account may have
    // been created with a password between /login and /verify).
    await prisma.user.updateMany({
      where: { email: v.email, passwordHash: null },
      data: { passwordHash: v.pendingPasswordHash },
    });
  }
  await prisma.user.update({
    where: { id: resolved.prismaUserId },
    data: { lastLoginAt: new Date() },
  });
  return resolved;
}

/**
 * Start a code-based password reset. ALWAYS returns a challenge token: for an
 * unknown email it is a random decoy (never stored - a later verify fails
 * exactly like a wrong code), so the API never reveals account existence.
 * Works for passwordless accounts (this is how they SET a first password).
 * @throws rate_limited:*
 */
export async function startPasswordForgot(
  db: Db,
  args: { email: string; ip: string | null; lang: 'he' | 'en' },
): Promise<StartLoginOtpResult> {
  const email = normalize(args.email);
  // Applied before the account lookup so known and unknown emails are
  // rate-limited identically (no oracle via 429 behavior).
  await assertRateLimit(db, { bucket: 'pwd_forgot_send', key: email, windowSec: 30, max: 1 });
  await assertRateLimit(db, { bucket: 'pwd_forgot_send_hourly', key: email, windowSec: 3600, max: 5 });

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return { challengeToken: generateToken(48) };
  return startLoginOtpChallenge(db, {
    prismaUserId: user.id,
    email,
    ip: args.ip,
    lang: args.lang,
    purpose: 'wallet_reset',
  });
}

/**
 * Verify the reset code (step 2 of 3). Marks the challenge verified
 * (single-use for the code); the password change happens in
 * completePasswordForgot against the same token.
 * @throws otp_invalid | otp_locked
 */
export async function verifyPasswordForgot(
  db: Db,
  args: { challengeToken: string; code: string },
): Promise<void> {
  const v = await verifyLoginOtpChallenge(db, args);
  if (v.purpose !== 'wallet_reset') throw new Error('otp_invalid');
}

/**
 * Complete the reset: requires a VERIFIED, unconsumed, unexpired wallet_reset
 * challenge. Enforces the policy + rejects the current password, then swaps
 * the hash and revokes ALL refresh tokens (website + wallet sessions die) in
 * one transaction. Single-use; sibling reset challenges are expired.
 * @throws otp_invalid | weak_password | password_unchanged
 */
export async function completePasswordForgot(
  db: Db,
  args: { challengeToken: string; newPassword: string },
): Promise<void> {
  const col = db.collection<LoginOtpChallenge>(LOGIN_OTP_COLLECTION);
  const doc = await col.findOne({
    challengeTokenHash: hashToken(args.challengeToken),
    purpose: 'wallet_reset',
  });
  const dead =
    !doc || !doc.verifiedAt || doc.consumedAt || doc.expiresAt < new Date() || !doc.prismaUserId;
  if (dead || !doc) throw new Error('otp_invalid');

  if (!isPasswordPolicyCompliant(args.newPassword)) throw new Error('weak_password');
  const user = await prisma.user.findUnique({ where: { id: doc.prismaUserId as string } });
  if (!user) throw new Error('otp_invalid');
  if (user.passwordHash && (await comparePassword(args.newPassword, user.passwordHash))) {
    throw new Error('password_unchanged');
  }

  const passwordHash = await hashPassword(args.newPassword);
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
    prisma.refreshToken.updateMany({
      where: { userId: user.id },
      data: { revokedAt: new Date() },
    }),
  ]);
  await col.updateOne({ _id: doc._id }, { $set: { consumedAt: new Date() } });
  // Expire any other in-flight reset challenges for this email.
  await col.updateMany(
    { _id: { $ne: doc._id }, email: doc.email, purpose: 'wallet_reset' },
    { $set: { expiresAt: new Date(0) } },
  );
}
