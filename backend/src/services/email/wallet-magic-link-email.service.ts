/**
 * Bilingual email delivery for the wallet magic-link sign-in flow. Sends a
 * single "Sign in to Nexus" button linking to the confirm-click landing page.
 * The raw token lives ONLY inside the href and is never logged. Reuses the
 * shared sendMail transport + the Nexus auth banner so it matches the other
 * transactional emails.
 * Spec: docs/superpowers/specs/2026-07-16-wallet-email-magic-link-auth-design.md
 */
import { sendMail, buildAuthEmailBannerHtml } from '../email.service';

/** Copy set for one magic-link email. */
interface MagicLinkCopy {
  subject: string;
  title: string;
  intro: string;
  button: string;
  fallback: string;
  note: string;
  text: string;
}

/**
 * Send the wallet magic-link email.
 * @param args.to recipient address
 * @param args.link the full confirm-page URL (carries the raw token in its query)
 * @param args.lang 'he' (default) or 'en'
 */
export async function sendWalletMagicLinkMessage(args: {
  to: string;
  link: string;
  lang?: 'he' | 'en';
}): Promise<void> {
  const isHe = (args.lang ?? 'he') === 'he';
  const safeLink = escapeHtml(args.link);
  const banner = buildAuthEmailBannerHtml();
  const copy: MagicLinkCopy = isHe
    ? {
        subject: 'קישור התחברות ל-Nexus Wallet',
        title: 'התחברות לארנק',
        intro: 'לחצו על הכפתור כדי להתחבר ל-Nexus Wallet:',
        button: 'התחברות ל-Nexus',
        fallback: 'אם הכפתור לא עובד, העתיקו את הקישור הבא לדפדפן:',
        note: 'הקישור תקף ל-15 דקות וניתן לשימוש חד-פעמי. אם לא ביקשתם להתחבר, אפשר להתעלם מהמייל הזה.',
        text: `התחברות ל-Nexus Wallet: ${args.link}\n\nהקישור תקף ל-15 דקות, שימוש חד-פעמי. אם לא ביקשת להתחבר, התעלם מהמייל.`,
      }
    : {
        subject: 'Your Nexus Wallet sign-in link',
        title: 'Sign in to your wallet',
        intro: 'Tap the button below to sign in to Nexus Wallet:',
        button: 'Sign in to Nexus',
        fallback: 'If the button does not work, copy this link into your browser:',
        note: "This link is valid for 15 minutes and can be used once. If you didn't request it, you can ignore this email.",
        text: `Sign in to Nexus Wallet: ${args.link}\n\nValid for 15 minutes, single use. If you didn't request it, ignore this email.`,
      };

  const button = `<a href="${safeLink}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;border-radius:12px;padding:14px 34px;font-size:16px;font-weight:700;">${copy.button}</a>`;

  const html = `<!doctype html>
<html lang="${isHe ? 'he' : 'en'}" dir="${isHe ? 'rtl' : 'ltr'}">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f7fb;font-family:Arial,Helvetica,sans-serif;${isHe ? 'direction:rtl;' : ''}">
<table width="100%" cellpadding="0" cellspacing="0">
<tr><td align="center" style="padding:40px 20px;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:white;border-radius:14px;padding:40px;box-shadow:0 10px 30px rgba(0,0,0,0.06);">
<tr><td align="center">
  ${banner}
  <h1 style="margin:0;color:#111;font-size:26px;">${copy.title}</h1>
  <p style="margin:18px 0 0 0;color:#555;font-size:16px;line-height:1.6;">${copy.intro}</p>
</td></tr>
<tr><td align="center" style="padding:28px 0;">${button}</td></tr>
<tr><td align="center">
  <p style="font-size:12px;color:#777;margin:0;line-height:1.6;">${copy.fallback}</p>
  <p dir="ltr" style="font-size:12px;color:#4285F4;word-break:break-all;margin:6px 0 0 0;">${safeLink}</p>
  <p style="font-size:12px;color:#999;margin-top:18px;line-height:1.6;">${copy.note}</p>
</td></tr>
</table>
</td></tr></table>
</body></html>`;

  await sendMail({ to: args.to, subject: copy.subject, html, text: copy.text, _label: 'WALLET_MAGIC_LINK' });
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
