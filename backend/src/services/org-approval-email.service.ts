/**
 * Organization Approval Email Service.
 *
 * Sends a single email to an organization's admin when a NEXUS platform admin
 * marks the organization as trusted (auto-approve). From then on the org can
 * publish global (ecosystem) offers to the whole platform without waiting for
 * per-offer approval.
 *
 * Unlike the voucher approval emails (which are bilingual in one message), this
 * email is rendered in ONE language chosen by the sender's dashboard language
 * (Hebrew or English), per product requirement. It reuses the shared Nexus
 * banner + card design from the auth/offer emails and is mobile-responsive
 * (fluid max-width card, viewport meta, table layout).
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

/** Per-language copy for the organization-approved email. */
const COPY: Record<EmailLanguage, {
  lang: string; dir: 'rtl' | 'ltr'; subject: string; heading: string;
  body: (org: string) => string; cta: string;
}> = {
  he: {
    lang: 'he', dir: 'rtl',
    subject: 'הארגון שלך אושר לפרסום הצעות גלובליות',
    heading: 'הארגון שלך אושר!',
    body: (org) => `שלום <strong>${org}</strong>,<br>מנהל Nexus אישר את הארגון שלך. מעכשיו תוכלו לפרסם הצעות גלובליות לכל הפלטפורמה ללא המתנה לאישור לכל הצעה.`,
    cta: 'כניסה לדשבורד',
  },
  en: {
    lang: 'en', dir: 'ltr',
    subject: 'Your organization is approved to post global offers',
    heading: 'Your organization is approved!',
    body: (org) => `Hi <strong>${org}</strong>,<br>A NEXUS admin has approved your organization. You can now publish global offers across the whole platform without waiting for per-offer approval.`,
    cta: 'Open Dashboard',
  },
};

/**
 * Sends the "your organization is now trusted" email in a single language.
 *
 * Input:
 *   to       - org admin's email address.
 *   orgName  - organization display name (shown in the greeting).
 *   language - 'he' or 'en'; picks the email language. Defaults to 'he'.
 * Output: Promise<void>. Errors are logged but never thrown (email failure must
 *   not roll back the approval).
 */
export async function sendOrgApprovedEmail(
  to: string,
  orgName: string,
  language: EmailLanguage = 'he',
): Promise<void> {
  const c = COPY[language] ?? COPY.he;
  const org = escapeHtml(orgName);
  const bannerHtml = buildAuthEmailBannerHtml();
  const dashboardUrl = env.DASHBOARD_URL ?? 'https://dashboard.nexus-payment.com';

  const html = `<!doctype html>
<html lang="${c.lang}" dir="${c.dir}">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f7fb;font-family:Arial,Helvetica,sans-serif;direction:${c.dir};">
<table width="100%" cellpadding="0" cellspacing="0">
<tr><td align="center" style="padding:40px 20px;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:white;border-radius:14px;padding:40px;box-shadow:0 10px 30px rgba(0,0,0,0.06);">
<tr><td align="center">
  ${bannerHtml}
  <h1 style="margin:0;color:#16a34a;font-size:24px;">${c.heading}</h1>
  <p style="margin:18px 0 8px 0;color:#555;font-size:15px;line-height:1.6;">${c.body(org)}</p>
</td></tr>
<tr><td align="center" style="padding:24px 0 8px 0;">
  <a href="${escapeHtml(dashboardUrl)}" style="background:#16a34a;color:white;padding:15px 36px;border-radius:10px;font-size:16px;font-weight:bold;text-decoration:none;display:inline-block;">
    ${c.cta}
  </a>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  const text = language === 'he'
    ? `הארגון שלך אושר! מעכשיו תוכלו לפרסם הצעות גלובליות ללא המתנה לאישור.\n${dashboardUrl}`
    : `Your organization is approved! You can now publish global offers without waiting for approval.\n${dashboardUrl}`;

  try {
    await sendMail({ to, subject: c.subject, html, text, _label: 'ORG-APPROVED' });
  } catch (err) {
    console.error(`[ORG-APPROVAL] Failed to send approved email to ${to}:`, err);
  }
}
