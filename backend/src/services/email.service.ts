import nodemailer from 'nodemailer';
import { env } from '../config/env';

const FROM = env.EMAIL_FROM ?? env.SMTP_USER ?? 'noreply@nexus-payment.com';
const FRONTEND = env.FRONTEND_URL;

function createTransport() {
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS) return null;
  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT ?? 587,
    secure: (env.SMTP_PORT ?? 587) === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  });
}

async function sendMail(options: { to: string; subject: string; html: string }) {
  const transport = createTransport();
  if (!transport) {
    console.warn('⚠️  Email not sent — SMTP not configured (SMTP_HOST/SMTP_USER/SMTP_PASS missing)');
    return;
  }
  try {
    const info = await transport.sendMail({ from: FROM, ...options });
    console.log(`✅  Email sent to ${options.to} — messageId: ${info.messageId}`);
  } catch (err: any) {
    console.error(`❌  Email send failed to ${options.to}:`, err?.message ?? err);
    throw err;
  }
}

// ─── Welcome email ─────────────────────────────────────────

export async function sendWelcomeEmail(email: string, fullName: string) {
  await sendMail({
    to: email,
    subject: 'ברוכים הבאים ל-Nexus! 🎉',
    html: `
      <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #6366f1;">שלום ${fullName},</h1>
        <p>ברוכים הבאים ל-Nexus — פלטפורמת התשלומים המובילה לעסקים.</p>
        <p>החשבון שלך נוצר בהצלחה. אנחנו שמחים שאתה איתנו!</p>
        <a href="${FRONTEND}/dashboard" style="
          display: inline-block;
          background: #6366f1;
          color: white;
          padding: 12px 24px;
          border-radius: 8px;
          text-decoration: none;
          margin: 16px 0;
        ">כניסה לדשבורד</a>
        <p style="color: #6b7280; font-size: 14px;">
          אם לא יצרת חשבון זה, אנא התעלם מהאימייל הזה.
        </p>
      </div>
    `,
  });
}

// ─── Email verification ─────────────────────────────────────

export async function sendVerificationEmail(
  email: string,
  fullName: string,
  rawToken: string,
) {
  const verifyUrl = `${FRONTEND}/verify-email?token=${rawToken}`;
  await sendMail({
    to: email,
    subject: 'Verify your Nexus account',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #6366f1;">Welcome to Nexus, ${fullName}!</h1>
        <p>Thanks for signing up. Please verify your email address to activate your account.</p>
        <p>The link is valid for <strong>24 hours</strong>.</p>
        <a href="${verifyUrl}" style="
          display: inline-block;
          background: #6366f1;
          color: white;
          padding: 12px 24px;
          border-radius: 8px;
          text-decoration: none;
          margin: 16px 0;
          font-size: 15px;
        ">Verify my email</a>
        <p style="color: #6b7280; font-size: 14px;">
          If you didn't create a Nexus account, you can safely ignore this email.
        </p>
      </div>
    `,
  });
}

// ─── Password reset ────────────────────────────────────────

export async function sendPasswordResetEmail(
  email: string,
  fullName: string,
  rawToken: string,
) {
  const resetUrl = `${FRONTEND}/reset-password?token=${rawToken}`;
  await sendMail({
    to: email,
    subject: 'איפוס סיסמה — Nexus',
    html: `
      <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #6366f1;">שלום ${fullName},</h1>
        <p>קיבלנו בקשה לאיפוס הסיסמה שלך.</p>
        <p>לחץ על הכפתור למטה לאיפוס הסיסמה (בתוקף לשעה אחת):</p>
        <a href="${resetUrl}" style="
          display: inline-block;
          background: #6366f1;
          color: white;
          padding: 12px 24px;
          border-radius: 8px;
          text-decoration: none;
          margin: 16px 0;
        ">איפוס סיסמה</a>
        <p style="color: #6b7280; font-size: 14px;">
          אם לא ביקשת לאפס סיסמה, אנא התעלם מהאימייל הזה.<br/>
          הקישור יפוג תוך שעה אחת.
        </p>
      </div>
    `,
  });
}

// ─── Daily digest ──────────────────────────────────────────

export async function sendDailyDigest(
  to: string,
  stats: {
    visitors: number;
    chats: number;
    leads: number;
    pendingChats: number;
    date: string;
  },
) {
  await sendMail({
    to,
    subject: `סיכום יומי Nexus — ${stats.date}`,
    html: `
      <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #6366f1;">סיכום יומי — ${stats.date}</h1>
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
          <tr style="background: #f3f4f6;">
            <td style="padding: 12px; border-radius: 8px 0 0 8px;">👥 מבקרים</td>
            <td style="padding: 12px; font-weight: bold; text-align: left;">${stats.visitors}</td>
          </tr>
          <tr>
            <td style="padding: 12px;">💬 שיחות</td>
            <td style="padding: 12px; font-weight: bold; text-align: left;">${stats.chats}</td>
          </tr>
          <tr style="background: #f3f4f6;">
            <td style="padding: 12px;">📩 לידים חדשים</td>
            <td style="padding: 12px; font-weight: bold; text-align: left;">${stats.leads}</td>
          </tr>
          ${
            stats.pendingChats > 0
              ? `<tr style="background: #fef3c7;">
              <td style="padding: 12px; border-radius: 0 0 0 8px;">⚠️ שיחות ממתינות לנציג</td>
              <td style="padding: 12px; font-weight: bold; color: #d97706; text-align: left;">${stats.pendingChats}</td>
            </tr>`
              : ''
          }
        </table>
        <a href="${FRONTEND}/dashboard" style="
          display: inline-block;
          background: #6366f1;
          color: white;
          padding: 12px 24px;
          border-radius: 8px;
          text-decoration: none;
        ">פתח דשבורד</a>
      </div>
    `,
  });
}
