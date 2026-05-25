/**
 * Bilingual email-OTP delivery for the wallet auth flow. Re-uses the
 * shared sendMail transport in services/email.service.ts so SMTP /
 * SendPulse routing and headers stay consistent with the rest of the
 * app.
 *
 * The OTP code is interpolated into the HTML body; this module is the
 * ONLY place that touches the plaintext code beyond the in-flight
 * request. Never logged.
 *
 * Spec: docs/superpowers/specs/2026-05-25-nexus-wallet-auth-design.md sections 6 and 10.7
 */
import { sendMail } from '../email.service';

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
  const html = isHe
    ? `<div dir="rtl" style="font-family:Arial,Helvetica,sans-serif;font-size:16px;color:#1f2937">
         <p>הקוד שלך לאימות בארנק Nexus:</p>
         <p style="font-size:28px;font-weight:700;letter-spacing:6px">${safeCode}</p>
         <p>הקוד תקף ל-10 דקות. אם לא ביקשת קוד זה אפשר להתעלם מההודעה.</p>
       </div>`
    : `<div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;color:#1f2937">
         <p>Your Nexus Wallet verification code:</p>
         <p style="font-size:28px;font-weight:700;letter-spacing:6px">${safeCode}</p>
         <p>Expires in 10 minutes. If you didn't request this, you can ignore this message.</p>
       </div>`;
  await sendMail({
    to: args.to,
    subject,
    html,
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
