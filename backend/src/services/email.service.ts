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
    const plainText = options.text ?? options.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const body = JSON.stringify({
      email: {
        html: Buffer.from(options.html, 'utf8').toString('base64'),
        text: Buffer.from(plainText, 'utf8').toString('base64'),
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
  language: 'en' | 'he' = 'en',
) {
  const prefix = language === 'he' ? '/he' : '';
  const verifyUrl = `${FRONTEND}${prefix}/verify-email?token=${rawToken}`;
  const logoUrl = `${FRONTEND}/nexus-logo-black.png`;

  const isHe = language === 'he';

  const subject = isHe
    ? 'ברוכים הבאים לנקסוס — אימות חשבון'
    : 'Welcome to Nexus — Verify Your Account';

  const text = isHe
    ? `ברוכים הבאים לנקסוס!\n\nיש לאמת את כתובת המייל כדי להפעיל את החשבון:\n\n${verifyUrl}\n\nאם לא יצרת חשבון, ניתן להתעלם מהמייל.`
    : `Welcome to Nexus!\n\nPlease verify your email to activate your account:\n\n${verifyUrl}\n\nIf you didn't create an account, you can ignore this email.`;

  const html = isHe
    ? `<!doctype html>
<html lang="he" dir="rtl">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>ברוכים הבאים לנקסוס</title></head>
<body style="margin:0;background:#f5f7fb;font-family:Arial,Helvetica,sans-serif;direction:rtl;">
<table width="100%" cellpadding="0" cellspacing="0">
<tr>
<td align="center" style="padding:40px 20px;">
<table width="560" cellpadding="0" cellspacing="0" style="background:white;border-radius:14px;padding:40px;box-shadow:0 10px 30px rgba(0,0,0,0.06);">
<tr>
<td align="center">
<img src="${logoUrl}" width="120" style="margin-bottom:30px;" alt="Nexus">
<h1 style="margin:0;color:#111;font-size:26px;">ברוכים הבאים לנקסוס</h1>
<p style="margin:18px 0 0 0;color:#555;font-size:16px;line-height:1.6;">
עוד רגע מתחילים.<br>
יש רק לאמת את כתובת המייל כדי להפעיל את החשבון.
</p>
</td>
</tr>
<tr>
<td align="center" style="padding:30px 0;">
<a href="${verifyUrl}" style="background:#111;color:white;padding:15px 36px;border-radius:10px;font-size:16px;font-weight:bold;text-decoration:none;display:inline-block;">
אימות והמשך לנקסוס
</a>
</td>
</tr>
<tr>
<td>
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:10px;padding:18px;margin-top:10px;">
<tr>
<td style="font-size:14px;color:#333;line-height:1.9;">
<strong>לאחר האימות תוכלו:</strong>
<br><br>
✔ להקים מועדון הטבות דיגיטלי
<br>
✔ להוסיף הטבות לחברי הקהילה
<br>
✔ לנהל משתמשים והרשאות
<br>
✔ לעקוב אחרי פעילות ורכישות
</td>
</tr>
</table>
</td>
</tr>
<tr>
<td align="center" style="padding-top:30px;">
<div style="font-size:13px;color:#777;line-height:1.7;">
שלב 1 ✓ יצירת חשבון
<br>
שלב 2 → אימות מייל
<br>
שלב 3 התחלה בדאשבורד
</div>
</td>
</tr>
<tr>
<td align="center">
<p style="font-size:13px;color:#888;margin-top:25px;">
אם הכפתור לא עובד ניתן להיכנס דרך הקישור:
</p>
<p style="font-size:13px;color:#444;word-break:break-all;">
${verifyUrl}
</p>
</td>
</tr>
<tr>
<td align="center">
<p style="font-size:12px;color:#999;margin-top:30px;line-height:1.6;">
קישור זה תקף לזמן מוגבל מטעמי אבטחה.<br>
אם לא ניסית ליצור חשבון ניתן להתעלם מהמייל.
</p>
</td>
</tr>
</table>
</td>
</tr>
</table>
</body>
</html>`
    : `<!doctype html>
<html lang="en" dir="ltr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;background:#f5f7fb;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0">
<tr><td align="center" style="padding:40px 20px;">
<table width="560" cellpadding="0" cellspacing="0" style="background:white;border-radius:14px;padding:40px;box-shadow:0 10px 30px rgba(0,0,0,0.06);">
<tr><td align="center">
  <img src="${logoUrl}" width="120" style="margin-bottom:30px;" alt="Nexus" />
  <h1 style="margin:0;color:#111;font-size:26px;">Welcome to Nexus</h1>
  <p style="margin:18px 0 0 0;color:#555;font-size:16px;line-height:1.6;">
    Almost there.<br>Just verify your email to activate your account.
  </p>
</td></tr>
<tr><td align="center" style="padding:30px 0;">
  <a href="${verifyUrl}" style="background:#111;color:white;padding:15px 36px;border-radius:10px;font-size:16px;font-weight:bold;text-decoration:none;display:inline-block;">
    Verify &amp; Continue to Nexus
  </a>
</td></tr>
<tr><td>
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:10px;padding:18px;margin-top:10px;">
  <tr><td style="font-size:14px;color:#333;line-height:1.9;">
    <strong>After verifying you can:</strong><br><br>
    ✔ Set up a digital loyalty club<br>
    ✔ Add perks for your community members<br>
    ✔ Manage users and permissions<br>
    ✔ Track activity and purchases
  </td></tr></table>
</td></tr>
<tr><td align="center" style="padding-top:30px;">
  <div style="font-size:13px;color:#777;line-height:1.7;">
    Step 1 ✓ Account created<br>
    Step 2 → Verify email<br>
    Step 3 &nbsp;&nbsp; Start on dashboard
  </div>
</td></tr>
<tr><td align="center">
  <p style="font-size:13px;color:#888;margin-top:25px;">If the button doesn't work, use this link:</p>
  <p style="font-size:13px;color:#444;word-break:break-all;">${verifyUrl}</p>
</td></tr>
<tr><td align="center">
  <p style="font-size:12px;color:#999;margin-top:30px;line-height:1.6;">
    This link is valid for a limited time for security reasons.<br>If you didn't create an account, you can ignore this email.
  </p>
</td></tr>
</table>
</td></tr></table>
</body></html>`;

  await sendMail({ to: email, toName: fullName, subject, text, html });
}

// ─── Password reset ────────────────────────────────────────

export async function sendPasswordResetEmail(
  email: string,
  fullName: string,
  rawToken: string,
  language: 'en' | 'he' = 'en',
) {
  const prefix = language === 'he' ? '/he' : '';
  const resetUrl = `${FRONTEND}${prefix}/reset-password?token=${rawToken}`;
  const logoUrl = `${FRONTEND}/nexus-logo-black.png`;

  const isHe = language === 'he';

  const subject = isHe ? 'איפוס סיסמה — Nexus' : 'Password Reset — Nexus';

  const text = isHe
    ? `שלום ${fullName},\n\nקיבלנו בקשה לאיפוס הסיסמה שלך.\n\nלאיפוס הסיסמה לחץ על הקישור:\n\n${resetUrl}\n\nהקישור בתוקף לשעה אחת.\n\nאם לא ביקשת לאפס סיסמה, אנא התעלם מהאימייל הזה.`
    : `Hi ${fullName},\n\nWe received a request to reset your password.\n\nClick the link to reset your password:\n\n${resetUrl}\n\nThis link is valid for one hour.\n\nIf you didn't request a password reset, please ignore this email.`;

  const html = isHe
    ? `<!doctype html>
<html lang="he" dir="rtl">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;background:#f5f7fb;font-family:Arial,Helvetica,sans-serif;direction:rtl;">
<table width="100%" cellpadding="0" cellspacing="0">
<tr><td align="center" style="padding:40px 20px;">
<table width="560" cellpadding="0" cellspacing="0" style="background:white;border-radius:14px;padding:40px;box-shadow:0 10px 30px rgba(0,0,0,0.06);">
<tr><td align="center">
  <img src="${logoUrl}" width="120" style="margin-bottom:30px;" alt="Nexus" />
  <h1 style="margin:0;color:#111;font-size:26px;">איפוס סיסמה</h1>
  <p style="margin:18px 0 0 0;color:#555;font-size:16px;line-height:1.6;">
    שלום ${fullName},<br>קיבלנו בקשה לאיפוס הסיסמה שלך.
  </p>
</td></tr>
<tr><td align="center" style="padding:30px 0;">
  <a href="${resetUrl}" style="background:#111;color:white;padding:15px 36px;border-radius:10px;font-size:16px;font-weight:bold;text-decoration:none;display:inline-block;">
    איפוס סיסמה
  </a>
</td></tr>
<tr><td align="center">
  <p style="font-size:13px;color:#888;margin-top:25px;">אם הכפתור לא עובד ניתן להיכנס דרך הקישור:</p>
  <p style="font-size:13px;color:#444;word-break:break-all;">${resetUrl}</p>
</td></tr>
<tr><td align="center">
  <p style="font-size:12px;color:#999;margin-top:30px;line-height:1.6;">
    הקישור תקף לשעה אחת מטעמי אבטחה.<br>אם לא ביקשת לאפס סיסמה, ניתן להתעלם מהמייל.
  </p>
</td></tr>
</table>
</td></tr></table>
</body></html>`
    : `<!doctype html>
<html lang="en" dir="ltr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;background:#f5f7fb;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0">
<tr><td align="center" style="padding:40px 20px;">
<table width="560" cellpadding="0" cellspacing="0" style="background:white;border-radius:14px;padding:40px;box-shadow:0 10px 30px rgba(0,0,0,0.06);">
<tr><td align="center">
  <img src="${logoUrl}" width="120" style="margin-bottom:30px;" alt="Nexus" />
  <h1 style="margin:0;color:#111;font-size:26px;">Password Reset</h1>
  <p style="margin:18px 0 0 0;color:#555;font-size:16px;line-height:1.6;">
    Hi ${fullName},<br>We received a request to reset your password.
  </p>
</td></tr>
<tr><td align="center" style="padding:30px 0;">
  <a href="${resetUrl}" style="background:#111;color:white;padding:15px 36px;border-radius:10px;font-size:16px;font-weight:bold;text-decoration:none;display:inline-block;">
    Reset Password
  </a>
</td></tr>
<tr><td align="center">
  <p style="font-size:13px;color:#888;margin-top:25px;">If the button doesn't work, use this link:</p>
  <p style="font-size:13px;color:#444;word-break:break-all;">${resetUrl}</p>
</td></tr>
<tr><td align="center">
  <p style="font-size:12px;color:#999;margin-top:30px;line-height:1.6;">
    This link is valid for one hour for security reasons.<br>If you didn't request a password reset, you can ignore this email.
  </p>
</td></tr>
</table>
</td></tr></table>
</body></html>`;

  await sendMail({ to: email, toName: fullName, subject, text, html });
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
