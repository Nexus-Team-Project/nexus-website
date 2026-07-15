/**
 * Branded service-outreach email: a tenant invites one of its contacts to
 * join the Nexus Wallet for an active service. Follows the transactional
 * template pattern (logo banner, white card, CTA button) used by
 * domain-member-invite-email.service.ts. The CTA target is the tenant's
 * short link - this is marketing/notification traffic, so the OTP
 * no-shortener rule does not apply.
 */
import { buildAuthEmailBannerHtml, sendMail } from '../email.service';

export interface ServiceOutreachEmailInput {
  to: string;
  displayName?: string;
  tenantName: string;
  /** Absolute short link (getOrCreateShortLink output). */
  ctaUrl: string;
  language: 'he' | 'en';
}

/**
 * Escapes untrusted text before placing it inside email HTML.
 * Input: text from a tenant record. Output: HTML-safe text.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Sends one service-outreach email through the shared email provider.
 * Input: recipient, tenant display name, short-link CTA URL, and language.
 * Output: provider message id, or null when email is disabled.
 */
export async function sendServiceOutreachEmail(
  input: ServiceOutreachEmailInput,
): Promise<string | null> {
  const isHebrew = input.language === 'he';
  const dir = isHebrew ? 'rtl' : 'ltr';
  const tenantName = escapeHtml(input.tenantName);
  const escapedUrl = escapeHtml(input.ctaUrl);
  const bannerHtml = buildAuthEmailBannerHtml();

  const subject = isHebrew
    ? `${input.tenantName} מזמין אותך ל-Nexus Wallet`
    : `${input.tenantName} invites you to Nexus Wallet`;

  const copy = isHebrew
    ? {
        title: `${tenantName} מזמין אותך להצטרף`,
        intro: 'הצטרפו ל-Nexus Wallet כדי ליהנות מההטבות והשירותים של הארגון.',
        action: 'הצטרפות עכשיו',
        fallback: 'אם הכפתור לא עובד, ניתן להיכנס דרך הקישור:',
      }
    : {
        title: `${tenantName} invites you to join`,
        intro: "Join Nexus Wallet to enjoy the organization's benefits and services.",
        action: 'Join now',
        fallback: "If the button doesn't work, use this link:",
      };

  const html = `<!doctype html>
<html lang="${input.language}" dir="${dir}">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f7fb;font-family:Arial,Helvetica,sans-serif;direction:${dir};">
<table width="100%" cellpadding="0" cellspacing="0">
<tr><td align="center" style="padding:40px 20px;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:white;border-radius:14px;padding:40px;box-shadow:0 10px 30px rgba(0,0,0,0.06);">
<tr><td align="center">
  ${bannerHtml}
  <h1 style="margin:0;color:#111;font-size:26px;">${copy.title}</h1>
  <p style="margin:18px 0 8px 0;color:#555;font-size:15px;line-height:1.6;">${copy.intro}</p>
</td></tr>
<tr><td align="center" style="padding:24px 0 8px 0;">
  <a href="${escapedUrl}" style="background:#111;color:white;padding:15px 36px;border-radius:10px;font-size:16px;font-weight:bold;text-decoration:none;display:inline-block;">
    ${copy.action}
  </a>
</td></tr>
</table>
<p style="font-size:13px;color:#888;margin-top:25px;text-align:center;">${copy.fallback}</p>
<p style="font-size:13px;color:#444;word-break:break-all;text-align:center;">${escapedUrl}</p>
</td></tr>
</table>
</body>
</html>`;

  const text = `${copy.title}\n\n${copy.intro}\n\n${input.ctaUrl}`;

  return await sendMail({
    to: input.to,
    toName: input.displayName,
    subject,
    html,
    text,
    _label: 'SERVICE-OUTREACH',
  });
}
