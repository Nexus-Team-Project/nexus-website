/**
 * Bilingual email delivery for the login new-device OTP (privileged
 * website logins). Re-uses the shared sendMail transport + the centered
 * transactional email layout so it matches the password-reset / wallet-OTP
 * emails. This module is the ONLY place that touches the plaintext code
 * beyond the in-flight request. Never logged.
 * Spec: docs/superpowers/specs/2026-07-06-login-device-otp-design.md
 */
import { sendMail, buildAuthEmailBannerHtml } from '../email.service';

/**
 * Send a 6-digit login-OTP for a new-device sign-in.
 * @param args.to recipient address
 * @param args.code six-digit OTP (generated + hashed by the caller)
 * @param args.lang 'he' (default) or 'en'
 */
export async function sendLoginOtpMessage(args: {
  to: string;
  code: string;
  lang?: 'he' | 'en';
}): Promise<void> {
  const isHe = (args.lang ?? 'he') === 'he';
  const subject = isHe ? 'קוד אימות להתחברות ל-Nexus' : 'Your Nexus sign-in code';
  const safeCode = escapeHtml(args.code);
  const banner = buildAuthEmailBannerHtml();

  const title = isHe ? 'אימות התחברות ממכשיר חדש' : 'New device sign-in';
  const intro = isHe
    ? 'זיהינו התחברות ממכשיר שאיננו מכירים. הזינו את הקוד הבא כדי להמשיך:'
    : 'We noticed a sign-in from a device we do not recognize. Enter this code to continue:';
  const note = isHe
    ? 'הקוד תקף ל-10 דקות. אם לא ניסיתם להתחבר, מומלץ להחליף סיסמה מיד.'
    : "This code is valid for 10 minutes. If you didn't try to sign in, change your password immediately.";

  // Centered code chip; dir=ltr keeps digits left-to-right in the RTL email.
  const codeBlock = `<div dir="ltr" style="display:inline-block;background:#f5f7fb;border:1px solid #ececf3;border-radius:12px;padding:16px 26px;font-size:30px;font-weight:700;letter-spacing:8px;color:#111;font-family:'Courier New',Courier,monospace;">${safeCode}</div>`;

  const html = `<!doctype html>
<html lang="${isHe ? 'he' : 'en'}" dir="${isHe ? 'rtl' : 'ltr'}">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f7fb;font-family:Arial,Helvetica,sans-serif;${isHe ? 'direction:rtl;' : ''}">
<table width="100%" cellpadding="0" cellspacing="0">
<tr><td align="center" style="padding:40px 20px;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:white;border-radius:14px;padding:40px;box-shadow:0 10px 30px rgba(0,0,0,0.06);">
<tr><td align="center">
  ${banner}
  <h1 style="margin:0;color:#111;font-size:26px;">${title}</h1>
  <p style="margin:18px 0 0 0;color:#555;font-size:16px;line-height:1.6;">${intro}</p>
</td></tr>
<tr><td align="center" style="padding:30px 0;">
  ${codeBlock}
</td></tr>
<tr><td align="center">
  <p style="font-size:12px;color:#999;margin-top:10px;line-height:1.6;">${note}</p>
</td></tr>
</table>
</td></tr></table>
</body></html>`;

  const text = isHe
    ? `קוד ההתחברות שלך ל-Nexus: ${args.code}\n\nהקוד תקף ל-10 דקות. אם לא ניסית להתחבר, החלף סיסמה מיד.`
    : `Your Nexus sign-in code: ${args.code}\n\nValid for 10 minutes. If you didn't try to sign in, change your password immediately.`;

  await sendMail({ to: args.to, subject, html, text, _label: 'LOGIN_OTP' });
}

/** Minimal HTML escape for interpolation safety. */
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      case "'": return '&#39;';
      default: return c;
    }
  });
}
