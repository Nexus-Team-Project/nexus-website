import { env } from '../config/env';

const FROM_EMAIL = env.EMAIL_FROM ?? 'noreply@nexus-payment.com';
const FROM_NAME = 'Nexus';
const FRONTEND = env.FRONTEND_URL;

// ─── SendPulse HTTP API client ──────────────────────────────

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value;
  }
  const res = await fetch('https://api.sendpulse.com/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      client_id: env.SENDPULSE_CLIENT_ID,
      client_secret: env.SENDPULSE_CLIENT_SECRET,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`SendPulse auth failed: ${res.status} ${text}`);
  }
  const data = await res.json() as { access_token: string; expires_in: number };
  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return cachedToken.value;
}

async function sendMail(options: { to: string; toName?: string; subject: string; html: string; text?: string }) {
  if (!env.SENDPULSE_CLIENT_ID || !env.SENDPULSE_CLIENT_SECRET) {
    console.warn('⚠️  Email not sent — SENDPULSE_CLIENT_ID/SECRET not configured');
    return;
  }
  console.log(`📧  Sending email to ${options.to}, subject: "${options.subject}", html length: ${options.html?.length ?? 0}`);
  try {
    const token = await getAccessToken();
    const body = JSON.stringify({
      email: {
        html: options.html,
        text: options.text ?? options.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
        subject: options.subject,
        from: { name: FROM_NAME, email: FROM_EMAIL },
        to: [{ name: options.toName ?? options.to, email: options.to }],
      },
    });
    const res = await fetch('https://api.sendpulse.com/smtp/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Authorization': `Bearer ${token}`,
      },
      body,
    });
    const data = await res.json() as { result?: boolean; message?: string };
    console.log(`📬  SendPulse response:`, JSON.stringify(data));
    if (!res.ok || data.result === false) {
      throw new Error(data.message ?? `HTTP ${res.status}`);
    }
    console.log(`✅  Email sent to ${options.to}`);
  } catch (err: any) {
    console.error(`❌  Email send failed to ${options.to}:`, err?.message ?? err);
    throw err;
  }
}

// ─── Welcome email ─────────────────────────────────────────

export async function sendWelcomeEmail(email: string, fullName: string) {
  await sendMail({
    to: email,
    toName: fullName,
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
    toName: fullName,
    subject: 'Verify your Nexus account',
    text: `Welcome to Nexus, ${fullName}!\n\nPlease verify your email address by clicking the link below:\n\n${verifyUrl}\n\nThe link is valid for 24 hours.\n\nIf you didn't create a Nexus account, you can safely ignore this email.`,
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
    toName: fullName,
    subject: 'איפוס סיסמה — Nexus',
    text: `שלום ${fullName},\n\nקיבלנו בקשה לאיפוס הסיסמה שלך.\n\nלאיפוס הסיסמה לחץ על הקישור:\n\n${resetUrl}\n\nהקישור בתוקף לשעה אחת.\n\nאם לא ביקשת לאפס סיסמה, אנא התעלם מהאימייל הזה.`,
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
    signups: number;
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
          <tr>
            <td style="padding: 12px;">✅ הרשמות חדשות</td>
            <td style="padding: 12px; font-weight: bold; text-align: left;">${stats.signups}</td>
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
