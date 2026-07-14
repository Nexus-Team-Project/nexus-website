/**
 * Tests the website forgot/reset password behaviors added by the wallet
 * email+password work: forgot now issues tokens for PASSWORDLESS accounts
 * (Google/wallet-created - lets them SET a password), and reset rejects
 * reusing the current password (password_unchanged).
 * Prisma is mocked; no Mongo involved.
 * Spec: docs/superpowers/specs/2026-07-14-wallet-email-password-auth-design.md
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';

const mocks = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  userUpdate: vi.fn(),
  passwordResetUpdateMany: vi.fn(),
  passwordResetCreate: vi.fn(),
  passwordResetFindUnique: vi.fn(),
  passwordResetUpdate: vi.fn(),
  refreshTokenUpdateMany: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock('../../src/config/database', () => ({
  prisma: {
    user: { findUnique: mocks.userFindUnique, update: mocks.userUpdate },
    passwordReset: {
      updateMany: mocks.passwordResetUpdateMany,
      create: mocks.passwordResetCreate,
      findUnique: mocks.passwordResetFindUnique,
      update: mocks.passwordResetUpdate,
    },
    refreshToken: { updateMany: mocks.refreshTokenUpdateMany },
    $transaction: mocks.transaction,
  },
}));

import { forgotPassword, resetPassword } from '../../src/services/auth.service';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.passwordResetUpdateMany.mockResolvedValue({ count: 0 });
  mocks.passwordResetCreate.mockResolvedValue({});
  mocks.transaction.mockResolvedValue([]);
});

describe('forgotPassword', () => {
  it('returns a token for a PASSWORDLESS account (Google/wallet users can set a password)', async () => {
    mocks.userFindUnique.mockResolvedValue({ id: 'u1', email: 'g@x.com', passwordHash: null });
    const token = await forgotPassword('g@x.com');
    expect(token).toBeTruthy();
    expect(mocks.passwordResetCreate).toHaveBeenCalled();
  });

  it('still returns null for an unknown email', async () => {
    mocks.userFindUnique.mockResolvedValue(null);
    expect(await forgotPassword('nobody@x.com')).toBeNull();
  });
});

describe('resetPassword', () => {
  it('rejects reusing the current password (password_unchanged)', async () => {
    const currentHash = await bcrypt.hash('Curr3nt!pw', 4);
    mocks.passwordResetFindUnique.mockResolvedValue({
      id: 'r1',
      userId: 'u1',
      used: false,
      expiresAt: new Date(Date.now() + 60_000),
    });
    mocks.userFindUnique.mockResolvedValue({ id: 'u1', passwordHash: currentHash });
    await expect(resetPassword('raw-token', 'Curr3nt!pw')).rejects.toThrow('password_unchanged');
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it('accepts a different password and revokes sessions in one transaction', async () => {
    const currentHash = await bcrypt.hash('Curr3nt!pw', 4);
    mocks.passwordResetFindUnique.mockResolvedValue({
      id: 'r1',
      userId: 'u1',
      used: false,
      expiresAt: new Date(Date.now() + 60_000),
    });
    mocks.userFindUnique.mockResolvedValue({ id: 'u1', passwordHash: currentHash });
    await resetPassword('raw-token', 'N3w!passw');
    expect(mocks.transaction).toHaveBeenCalled();
  });

  it('sets a first password on a passwordless account', async () => {
    mocks.passwordResetFindUnique.mockResolvedValue({
      id: 'r1',
      userId: 'u1',
      used: false,
      expiresAt: new Date(Date.now() + 60_000),
    });
    mocks.userFindUnique.mockResolvedValue({ id: 'u1', passwordHash: null });
    await resetPassword('raw-token', 'N3w!passw');
    expect(mocks.transaction).toHaveBeenCalled();
  });
});
