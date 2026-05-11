import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export interface AccessTokenPayload {
  sub: string;   // userId
  email: string;
  role: string;
}

export interface RefreshTokenPayload {
  sub: string;   // userId
  jti: string;   // unique token id (matches DB id)
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.ACCESS_TOKEN_SECRET, {
    expiresIn: '30m',
    algorithm: 'HS256',
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.ACCESS_TOKEN_SECRET) as AccessTokenPayload;
}

export function signRefreshToken(payload: RefreshTokenPayload): string {
  return jwt.sign(payload, env.REFRESH_TOKEN_SECRET, {
    expiresIn: '30d',
    algorithm: 'HS256',
  });
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  return jwt.verify(token, env.REFRESH_TOKEN_SECRET) as RefreshTokenPayload;
}

// ─── Email verification token ────────────────────────────
// Self-contained signed JWT — no extra DB table needed.

export interface EmailVerificationPayload {
  sub: string;      // userId
  email: string;    // email being verified (in case user changes it)
  type: 'email_verification';
}

export function signEmailVerificationToken(userId: string, email: string): string {
  const payload: EmailVerificationPayload = { sub: userId, email, type: 'email_verification' };
  return jwt.sign(payload, env.ACCESS_TOKEN_SECRET, {
    expiresIn: '24h',
    algorithm: 'HS256',
  });
}

export function verifyEmailVerificationToken(token: string): EmailVerificationPayload {
  const payload = jwt.verify(token, env.ACCESS_TOKEN_SECRET) as EmailVerificationPayload;
  if (payload.type !== 'email_verification') throw new Error('Wrong token type');
  return payload;
}
