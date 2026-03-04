import { OAuth2Client } from 'google-auth-library';
import { prisma } from '../config/database';
import { env } from '../config/env';
import { hashPassword, comparePassword, generateToken, hashToken } from '../utils/crypto';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt';
import { createError } from '../middleware/errorHandler';

const googleClient = new OAuth2Client(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET);

export async function register(
  data: {
    email: string;
    fullName: string;
    password: string;
    country?: string;
    emailUpdates?: boolean;
  },
  meta: { userAgent?: string; ipAddress?: string } = {},
) {
  const email = data.email.toLowerCase().trim();
  const fullName = data.fullName.trim();

  // Reject if a verified account already exists
  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) throw createError('Email already registered', 409);

  const passwordHash = await hashPassword(data.password);
  const rawVerificationToken = generateToken(48);
  const tokenHash = hashToken(rawVerificationToken);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

  // Store as a pending registration — user row is NOT created until email is confirmed
  await prisma.pendingRegistration.upsert({
    where: { email },
    update: { passwordHash, fullName, country: data.country ?? 'IL', emailUpdates: data.emailUpdates ?? true, tokenHash, expiresAt },
    create: { email, passwordHash, fullName, country: data.country ?? 'IL', emailUpdates: data.emailUpdates ?? true, tokenHash, expiresAt },
  });

  return { email, fullName, rawVerificationToken };
}

export async function verifyEmail(
  rawToken: string,
  meta: { userAgent?: string; ipAddress?: string } = {},
) {
  const tokenHash = hashToken(rawToken);
  const pending = await prisma.pendingRegistration.findUnique({ where: { tokenHash } });

  if (!pending || pending.expiresAt < new Date()) {
    throw createError('Invalid or expired verification link', 400);
  }

  // Atomically: create the verified user and delete the pending record
  const user = await prisma.$transaction(async (tx) => {
    const newUser = await tx.user.create({
      data: {
        email: pending.email,
        fullName: pending.fullName,
        passwordHash: pending.passwordHash,
        country: pending.country,
        emailUpdates: pending.emailUpdates,
        provider: 'EMAIL',
        emailVerified: true,
        lastLoginAt: new Date(),
      },
    });
    await tx.pendingRegistration.delete({ where: { id: pending.id } });
    return newUser;
  });

  return issueTokens(user.id, user.email, user.role, false, meta);
}

export async function resendVerification(email: string) {
  const pending = await prisma.pendingRegistration.findUnique({
    where: { email: email.toLowerCase().trim() },
  });
  if (!pending) return null; // either not registered or already verified (User row exists)

  const rawToken = generateToken(48);
  await prisma.pendingRegistration.update({
    where: { id: pending.id },
    data: {
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });

  return { rawToken, email: pending.email, fullName: pending.fullName };
}

export async function login(
  email: string,
  password: string,
  rememberMe = false,
  meta: { userAgent?: string; ipAddress?: string } = {},
) {
  const normalizedEmail = email.toLowerCase().trim();
  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (!user || !user.passwordHash) {
    // Give a specific error if the user registered but hasn't verified yet
    const pending = await prisma.pendingRegistration.findUnique({ where: { email: normalizedEmail } });
    if (pending) throw createError('Please verify your email before logging in', 403);
    throw createError('Invalid email or password', 401);
  }

  const valid = await comparePassword(password, user.passwordHash);
  if (!valid) throw createError('Invalid email or password', 401);

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  return issueTokens(user.id, user.email, user.role, rememberMe, meta);
}

export async function googleAuth(
  idToken: string,
  meta: { userAgent?: string; ipAddress?: string } = {},
) {
  const ticket = await googleClient.verifyIdToken({
    idToken,
    audience: env.GOOGLE_CLIENT_ID,
  });
  const payload = ticket.getPayload();
  if (!payload?.email) throw createError('Invalid Google token', 401);

  let user = await prisma.user.findFirst({
    where: { OR: [{ googleId: payload.sub }, { email: payload.email }] },
  });

  if (user) {
    if (!user.googleId) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { googleId: payload.sub, provider: 'GOOGLE', emailVerified: true },
      });
    }
  } else {
    user = await prisma.user.create({
      data: {
        email: payload.email,
        fullName: payload.name ?? payload.email.split('@')[0],
        googleId: payload.sub,
        provider: 'GOOGLE',
        emailVerified: true,
        avatarUrl: payload.picture,
      },
    });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  return issueTokens(user.id, user.email, user.role, false, meta);
}

export async function googleAuthFromCode(
  code: string,
  meta: { userAgent?: string; ipAddress?: string } = {},
  redirectUri: string = 'postmessage',
) {
  if (!env.GOOGLE_CLIENT_SECRET) throw createError('Google OAuth is not configured on this server', 503);
  const codeClient = new OAuth2Client(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    redirectUri,
  );
  const { tokens } = await codeClient.getToken(code);
  if (!tokens.id_token) throw createError('Google did not return an ID token', 401);
  return googleAuth(tokens.id_token, meta);
}

export async function googleAuthFromAccessToken(
  accessToken: string,
  meta: { userAgent?: string; ipAddress?: string } = {},
) {
  const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw createError('Invalid Google access token', 401);
  const payload = await response.json() as { sub: string; email: string; name?: string; picture?: string };
  if (!payload.email) throw createError('Invalid Google token', 401);

  let user = await prisma.user.findFirst({
    where: { OR: [{ googleId: payload.sub }, { email: payload.email }] },
  });

  if (user) {
    if (!user.googleId) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { googleId: payload.sub, provider: 'GOOGLE', emailVerified: true },
      });
    }
  } else {
    user = await prisma.user.create({
      data: {
        email: payload.email,
        fullName: payload.name ?? payload.email.split('@')[0],
        googleId: payload.sub,
        provider: 'GOOGLE',
        emailVerified: true,
        avatarUrl: payload.picture,
      },
    });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  return issueTokens(user.id, user.email, user.role, false, meta);
}

export async function refreshTokens(
  rawToken: string,
  meta: { userAgent?: string; ipAddress?: string } = {},
) {
  let payload: ReturnType<typeof verifyRefreshToken>;
  try {
    payload = verifyRefreshToken(rawToken);
  } catch {
    throw createError('Invalid refresh token', 401);
  }

  const tokenHash = hashToken(rawToken);
  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash } });

  if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
    if (stored?.revokedAt) {
      await prisma.refreshToken.updateMany({
        where: { userId: payload.sub },
        data: { revokedAt: new Date() },
      });
    }
    throw createError('Invalid refresh token', 401);
  }

  await prisma.refreshToken.update({
    where: { id: stored.id },
    data: { revokedAt: new Date() },
  });

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user) throw createError('User not found', 401);

  return issueTokens(user.id, user.email, user.role, false, meta);
}

export async function logout(rawToken: string) {
  const tokenHash = hashToken(rawToken);
  await prisma.refreshToken.updateMany({
    where: { tokenHash },
    data: { revokedAt: new Date() },
  });
}

export async function forgotPassword(email: string): Promise<string | null> {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
  if (!user || user.provider !== 'EMAIL') return null;

  await prisma.passwordReset.updateMany({
    where: { userId: user.id, used: false },
    data: { used: true },
  });

  const rawToken = generateToken(48);
  await prisma.passwordReset.create({
    data: {
      tokenHash: hashToken(rawToken),
      userId: user.id,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });

  return rawToken;
}

export async function resetPassword(rawToken: string, newPassword: string) {
  const tokenHash = hashToken(rawToken);
  const record = await prisma.passwordReset.findUnique({ where: { tokenHash } });

  if (!record || record.used || record.expiresAt < new Date()) {
    throw createError('Invalid or expired reset token', 400);
  }

  const passwordHash = await hashPassword(newPassword);
  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
    prisma.passwordReset.update({ where: { id: record.id }, data: { used: true } }),
    prisma.refreshToken.updateMany({
      where: { userId: record.userId },
      data: { revokedAt: new Date() },
    }),
  ]);
}

async function issueTokens(
  userId: string,
  email: string,
  role: string,
  rememberMe: boolean,
  meta: { userAgent?: string; ipAddress?: string },
) {
  const accessToken = signAccessToken({ sub: userId, email, role });
  const rawRefresh = generateToken(64);
  const tokenHash = hashToken(rawRefresh);

  const ttlDays = rememberMe ? 30 : 7;
  const refreshRecord = await prisma.refreshToken.create({
    data: {
      tokenHash,
      userId,
      expiresAt: new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000),
      userAgent: meta.userAgent,
      ipAddress: meta.ipAddress,
    },
  });

  return {
    accessToken,
    rawRefreshToken: rawRefresh,
    refreshTokenId: refreshRecord.id,
    ttlDays,
    userId,
  };
}
