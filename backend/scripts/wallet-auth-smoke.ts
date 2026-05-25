/**
 * Manual end-to-end smoke for /api/v1/auth/phone/{start,verify}.
 *
 * THIS SENDS A REAL SMS via InforU and consumes real SMS credits.
 * Only run after the user has approved the spend. Default phone is the
 * test number 0508465858 (Rony); pass a different one as argv[2].
 *
 * Usage:
 *   npx tsx backend/scripts/wallet-auth-smoke.ts [0508465858]
 *
 * Requires .env to have INFORU_USER, INFORU_TOKEN, MONGODB_URI.
 *
 * Spec: docs/superpowers/specs/2026-05-25-nexus-wallet-auth-design.md section 11 (testing)
 */
import 'dotenv/config';
import readline from 'readline';
import { getMongoDb, closeMongoConnection } from '../src/config/mongo';
import { startPhoneOtp, verifyPhoneOtp } from '../src/services/auth/phone-otp.service';

async function main(): Promise<void> {
  const phone = process.argv[2] ?? '0508465858';
  console.log(`[smoke] sending OTP to ${phone} via InforU...`);

  const db = await getMongoDb();
  const start = await startPhoneOtp(db, { phone, ip: '127.0.0.1' });
  console.log(`[smoke] challengeId = ${start.challengeId}`);

  const code = await prompt('Enter the 6-digit code from the SMS: ');
  try {
    const r = await verifyPhoneOtp(db, { challengeId: start.challengeId, code: code.trim() });
    console.log('[smoke] verify =>', r);
  } catch (e) {
    console.error('[smoke] verify failed:', e instanceof Error ? e.message : e);
  } finally {
    await closeMongoConnection();
  }
}

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

main().catch((err) => {
  console.error('[smoke] fatal:', err);
  process.exit(1);
});
