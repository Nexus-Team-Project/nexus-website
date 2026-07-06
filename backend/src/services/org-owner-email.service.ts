/**
 * Org Owner Assignment Email Service.
 *
 * Sent when a NEXUS platform admin assigns an external email as the owner
 * (admin) of an admin-created organization. The assignment is immediate (no
 * acceptance token): the recipient becomes the tenant's owner the moment they
 * sign in with this email, so the email is a notification with a login CTA.
 *
 * Rendered in ONE language chosen by the sending admin's dashboard language
 * (Hebrew or English), matching the org-approval email. The login CTA points
 * at the WEBSITE login (env.FRONTEND_URL) because the recipient may have never
 * signed up. Reuses the shared Nexus banner + card design and is
 * mobile-responsive (fluid max-width card, viewport meta, table layout).
 */
import { env } from '../config/env';
import { buildAuthEmailBannerHtml, sendMail } from './email.service';

/** Supported email languages. Mirrors the dashboard language toggle. */
export type EmailLanguage = 'he' | 'en';

/**
 * Escapes untrusted text before embedding it inside email HTML.
 * Input: raw string (e.g. an org name). Output: HTML-safe string.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Per-language copy for the owner-assignment email. */
const COPY: Record<EmailLanguage, {
  lang: string; dir: 'rtl' | 'ltr'; subject: string; heading: string;
  body: (org: string) => string; cta: string;
}> = {
  he: {
    lang: 'he', dir: 'rtl',
    subject: 'מונית כאדמין של ארגון בנקסוס',
    heading: 'מונית לאדמין הארגון!',
    body: (org) => `שלום,<br>מנהל Nexus מינה אותך לאדמין של הארגון <strong>${org}</strong>. היכנס לאתר עם כתובת האימייל הזו - הארגון כבר ממתין לך, ללא תהליך הרשמה נוסף.`,
    cta: 'כניסה לנקסוס',
  },
  en: {
    lang: 'en', dir: 'ltr',
    subject: 'You are now an organization admin on Nexus',
    heading: 'You are now an organization admin!',
    body: (org) => `Hi,<br>A NEXUS admin has made you the admin of <strong>${org}</strong>. Sign in with this email address - the organization is already waiting for you, no extra onboarding needed.`,
    cta: 'Sign in to Nexus',
  },
};

/**
 * Sends the "you are now the org admin" email in a single language.
 *
 * Input:
 *   to       - assigned owner's email address.
 *   orgName  - organization display name (shown in the body).
 *   language - 'he' or 'en'; picks the email language. Defaults to 'he'.
 * Output: Promise<void>. Errors are logged but never thrown (email failure must
 *   not roll back the assignment).
 */
export async function sendOrgOwnerAssignedEmail(
  to: string,
  orgName: string,
  language: EmailLanguage = 'he',
): Promise<void> {
  const c = COPY[language] ?? COPY.he;
  const org = escapeHtml(orgName);
  const bannerHtml = buildAuthEmailBannerHtml();
  const loginUrl = env.FRONTEND_URL;

  const html = `<!doctype html>
<html lang="${c.lang}" dir="${c.dir}">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f7fb;font-family:Arial,Helvetica,sans-serif;direction:${c.dir};">
<table width="100%" cellpadding="0" cellspacing="0">
<tr><td align="center" style="padding:40px 20px;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:white;border-radius:14px;padding:40px;box-shadow:0 10px 30px rgba(0,0,0,0.06);">
<tr><td align="center">
  ${bannerHtml}
  <h1 style="margin:0;color:#1e293b;font-size:24px;">${c.heading}</h1>
  <p style="margin:18px 0 8px 0;color:#555;font-size:15px;line-height:1.6;">${c.body(org)}</p>
</td></tr>
<tr><td align="center" style="padding:24px 0 8px 0;">
  <a href="${escapeHtml(loginUrl)}" style="background:#635bff;color:white;padding:15px 36px;border-radius:10px;font-size:16px;font-weight:bold;text-decoration:none;display:inline-block;">
    ${c.cta}
  </a>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  const text = language === 'he'
    ? `מנהל Nexus מינה אותך לאדמין של הארגון "${orgName}". היכנס לאתר עם כתובת האימייל הזו - ללא תהליך הרשמה נוסף.\n${loginUrl}`
    : `A NEXUS admin has made you the admin of "${orgName}". Sign in with this email address - no extra onboarding needed.\n${loginUrl}`;

  try {
    await sendMail({ to, subject: c.subject, html, text, _label: 'ORG-OWNER-ASSIGNED' });
  } catch (err) {
    console.error(`[ORG-OWNER] Failed to send assignment email to ${to}:`, err);
  }
}
