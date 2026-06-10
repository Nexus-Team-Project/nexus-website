/**
 * Bilingual email-OTP delivery for the wallet auth flow. Re-uses the
 * shared sendMail transport + the centered, logo-topped transactional
 * email layout (services/email.service.ts) so it looks exactly like the
 * password-reset / tenant-invite emails: Nexus logo banner, centered
 * white card (max-width 560px, mobile-safe — no horizontal overflow),
 * with the verification code shown prominently in the middle.
 *
 * The OTP code is interpolated into the HTML body; this module is the
 * ONLY place that touches the plaintext code beyond the in-flight
 * request. Never logged.
 *
 * Spec: docs/superpowers/specs/2026-05-25-nexus-wallet-auth-design.md sections 6 and 10.7
 */
import { sendMail, buildAuthEmailBannerHtml } from '../email.service';

/**
 * Send a 6-digit email-OTP. The caller is responsible for generating
 * the code and storing only its bcrypt hash; we receive the plaintext
 * for delivery and never persist it.
 *
 * @param args.to recipient address
 * @param args.code six-digit OTP
 * @param args.lang 'he' (default) or 'en'
 */
export async function sendEmailOtpMessage(args: {
  to: string;
  code: string;
  lang?: 'he' | 'en';
}): Promise<void> {
  const isHe = (args.lang ?? 'he') === 'he';
  const subject = isHe ? 'קוד אימות לחשבון Nexus' : 'Your Nexus verification code';
  const safeCode = escapeHtml(args.code);
  const banner = buildAuthEmailBannerHtml();

  const title = isHe ? 'אימות כתובת האימייל' : 'Verify your email';
  const intro = isHe
    ? 'הזינו את הקוד הבא כדי לאמת את כתובת האימייל שלכם בארנק Nexus:'
    : 'Enter this code to verify your email for your Nexus Wallet:';
  const note = isHe
    ? 'הקוד תקף ל-10 דקות. אם לא ביקשתם קוד זה, אפשר להתעלם מההודעה.'
    : "This code is valid for 10 minutes. If you didn't request it, you can ignore this message.";

  // Centered code chip. letter-spacing/padding kept moderate so 6 digits never
  // overflow the card on a narrow phone. dir=ltr keeps the digits left-to-right
  // even in the RTL email.
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
    ? `קוד האימות שלך לארנק Nexus: ${args.code}\n\nהקוד תקף ל-10 דקות. אם לא ביקשת קוד זה, ניתן להתעלם מההודעה.`
    : `Your Nexus Wallet verification code: ${args.code}\n\nValid for 10 minutes. If you didn't request it, you can ignore this message.`;

  await sendMail({
    to: args.to,
    subject,
    html,
    text,
    _label: 'WALLET_OTP',
  });
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
