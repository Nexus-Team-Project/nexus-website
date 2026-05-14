/**
 * Builds and sends tenant member invitation emails.
 * Visual style matches the reset-password email: logo banner, centered card, table layout.
 * The email sends users to the website login first, then into dashboard accept.
 */
import { env } from '../config/env';
import { buildAuthEmailBannerHtml, sendMail } from './email.service';
import type { TenantUserRoleName } from '../models/domain';

export interface TenantMemberInviteEmailInput {
  to: string;
  displayName?: string;
  tenantName: string;
  roles: TenantUserRoleName[];
  /** Service keys granted to this member (e.g. benefits_catalog). */
  services?: string[];
  inviteUrl: string;
  expiresAt: Date;
  language: 'he' | 'en';
}

/** Human-readable labels for known service keys in both supported languages. */
const SERVICE_LABELS: Record<string, { he: string; en: string }> = {
  benefits_catalog: { he: 'קטלוג הטבות', en: 'Benefits Catalog' },
};

const ROLE_LABELS: Record<TenantUserRoleName, { he: string; en: string }> = {
  // Tenant roles
  owner:                { he: 'בעלים',          en: 'Owner' },
  admin:                { he: 'מנהל',            en: 'Admin' },
  back_office_manager:  { he: 'ניהול תפעולי',   en: 'Back-office manager' },
  hr_manager:           { he: 'משאבי אנוש',      en: 'HR manager' },
  finance:              { he: 'כספים',           en: 'Finance' },
  billing_manager:      { he: 'ניהול חיוב',      en: 'Billing manager' },
  payments_manager:     { he: 'ניהול תשלומים',   en: 'Payments manager' },
  support_agent:        { he: 'נציג תמיכה',      en: 'Support agent' },
  developer:            { he: 'מפתח',            en: 'Developer' },
  supply_manager:       { he: 'ניהול ספקים',     en: 'Supply manager' },
  member:               { he: 'חבר',             en: 'Member' },
  // Deprecated tenant roles
  operator:             { he: 'תפעול',           en: 'Operator' },
  analyst:              { he: 'אנליסט',          en: 'Analyst' },
  // Platform roles
  platform_admin:       { he: 'מנהל פלטפורמה',  en: 'Platform admin' },
  platform_operator:    { he: 'תפעול פלטפורמה', en: 'Platform operator' },
  platform_back_office: { he: 'בק-אופיס פלטפורמה', en: 'Platform back-office' },
  platform_marketing:   { he: 'שיווק פלטפורמה', en: 'Platform marketing' },
  platform_commerce:    { he: 'מסחר פלטפורמה',  en: 'Platform commerce' },
  platform_support:     { he: 'תמיכה',           en: 'Platform support' },
  platform_finance:     { he: 'כספי פלטפורמה',  en: 'Platform finance' },
};

/**
 * Escapes untrusted text before placing it inside email HTML.
 * Input: text from a user or tenant record.
 * Output: HTML-safe text.
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
 * Formats the invitation expiry date for the email language.
 * Input: expiry date and supported language.
 * Output: localized date string.
 */
function formatExpiryDate(expiresAt: Date, language: 'he' | 'en'): string {
  return new Intl.DateTimeFormat(language === 'he' ? 'he-IL' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(expiresAt);
}

/**
 * Builds a comma-separated localized role list for email body text.
 * Input: role names and target language.
 * Output: comma-separated localized role labels, HTML-escaped.
 */
function formatRoleList(roles: TenantUserRoleName[], language: 'he' | 'en'): string {
  return roles
    .map((role) => escapeHtml(ROLE_LABELS[role]?.[language] ?? role))
    .join(language === 'he' ? '، ' : ', ');
}

/**
 * Builds role badges HTML for the email card.
 * Input: role names and language.
 * Output: inline-block pill spans for each role.
 */
function buildRoleBadgesHtml(roles: TenantUserRoleName[], language: 'he' | 'en'): string {
  const badges = roles
    .map((role) => {
      const label = escapeHtml(ROLE_LABELS[role]?.[language] ?? role);
      return `<span style="display:inline-block;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:20px;padding:4px 14px;font-size:13px;font-weight:600;color:#1e293b;margin:3px 4px;">${label}</span>`;
    })
    .join('');
  return `<div style="margin:16px 0;text-align:center;">${badges}</div>`;
}

/**
 * Builds service access badge HTML for the email card.
 * Only renders when the services array is non-empty.
 * Input: service key strings and language.
 * Output: section HTML, or empty string when no services are present.
 */
function buildServicesBadgesHtml(services: string[] | undefined, language: 'he' | 'en'): string {
  if (!services || services.length === 0) return '';
  const sectionLabel = language === 'he' ? 'גישה לשירותים:' : 'Service access:';
  const badges = services
    .map((key) => {
      const label = escapeHtml(SERVICE_LABELS[key]?.[language] ?? key);
      return `<span style="display:inline-block;background:#eef2ff;border:1px solid #c7d2fe;border-radius:20px;padding:4px 14px;font-size:13px;font-weight:600;color:#3730a3;margin:3px 4px;">${label}</span>`;
    })
    .join('');
  return `
<tr><td align="center" style="padding-top:8px;">
  <p style="margin:0 0 8px 0;color:#666;font-size:13px;">${sectionLabel}</p>
  <div style="margin:0;">${badges}</div>
</td></tr>`;
}

/**
 * Creates the website URL that starts auth before dashboard invite acceptance.
 * Input: raw invite token and target email language.
 * Output: absolute login URL with a safe dashboard redirect query.
 */
export function buildMemberInviteLoginUrl(token: string, language: 'he' | 'en'): string {
  const loginPath = language === 'he' ? '/he/login' : '/login';
  const dashboardRedirect = `/member-invite/accept?token=${encodeURIComponent(token)}`;
  const url = new URL(loginPath, env.FRONTEND_URL);
  url.searchParams.set('dashboardRedirect', dashboardRedirect);
  return url.toString();
}

/**
 * Sends one tenant member invite email through the shared email provider.
 * Matches the reset-password email visual style: logo banner, white card, centered layout.
 * Input: invite recipient, tenant name, roles, URL, expiry, and language.
 * Output: provider message id, or null when email is disabled.
 */
export async function sendTenantMemberInviteEmail(
  input: TenantMemberInviteEmailInput,
): Promise<string | null> {
  const isHebrew = input.language === 'he';
  const dir = isHebrew ? 'rtl' : 'ltr';
  const tenantName = escapeHtml(input.tenantName);
  const roleList = formatRoleList(input.roles, input.language);
  const roleBadges = buildRoleBadgesHtml(input.roles, input.language);
  const servicesBadges = buildServicesBadgesHtml(input.services, input.language);
  const expiry = escapeHtml(formatExpiryDate(input.expiresAt, input.language));
  const escapedUrl = escapeHtml(input.inviteUrl);
  const bannerHtml = buildAuthEmailBannerHtml();

  const subject = isHebrew
    ? `הוזמנת להצטרף ל-${tenantName} ב-Nexus`
    : `You were invited to join ${tenantName} on Nexus`;

  const copy = isHebrew
    ? {
        title: `הוזמנת להצטרף ל-${tenantName}`,
        roleLabel: input.roles.length === 1 ? 'התפקיד שלך:' : 'התפקידים שלך:',
        intro: input.roles.length === 1
          ? `התפקיד שלך בסביבת העבודה הוא ${roleList}.`
          : `התפקידים שלך בסביבת העבודה: ${roleList}.`,
        action: 'כניסה ואישור הזמנה',
        note: `הקישור בתוקף עד ${expiry}.`,
        fallback: 'אם הכפתור לא עובד, ניתן להיכנס דרך הקישור:',
      }
    : {
        title: `You were invited to join ${tenantName}`,
        roleLabel: input.roles.length === 1 ? 'Your role:' : 'Your roles:',
        intro: input.roles.length === 1
          ? `Your workspace role is ${roleList}.`
          : `Your workspace roles are: ${roleList}.`,
        action: 'Sign in and accept invite',
        note: `This link expires on ${expiry}.`,
        fallback: "If the button doesn't work, use this link:",
      };

  const html = `<!doctype html>
<html lang="${input.language}" dir="${dir}">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f7fb;font-family:Arial,Helvetica,sans-serif;direction:${dir};">
<table width="100%" cellpadding="0" cellspacing="0">
<tr><td align="center" style="padding:40px 20px;">
<table width="560" cellpadding="0" cellspacing="0" style="background:white;border-radius:14px;padding:40px;box-shadow:0 10px 30px rgba(0,0,0,0.06);">
<tr><td align="center">
  ${bannerHtml}
  <h1 style="margin:0;color:#111;font-size:26px;">${copy.title}</h1>
  <p style="margin:18px 0 8px 0;color:#555;font-size:15px;line-height:1.6;">${copy.intro}</p>
  ${roleBadges}
</td></tr>
${servicesBadges}
<tr><td align="center" style="padding:24px 0 8px 0;">
  <a href="${escapedUrl}" style="background:#111;color:white;padding:15px 36px;border-radius:10px;font-size:16px;font-weight:bold;text-decoration:none;display:inline-block;">
    ${copy.action}
  </a>
</td></tr>
<tr><td align="center">
  <p style="font-size:12px;color:#999;margin-top:20px;line-height:1.6;">
    ${copy.note}
  </p>
</td></tr>
</table>
<p style="font-size:13px;color:#888;margin-top:25px;text-align:center;">${copy.fallback}</p>
<p style="font-size:13px;color:#444;word-break:break-all;text-align:center;">${escapedUrl}</p>
</td></tr>
</table>
</body>
</html>`;

  const text = `${copy.title}\n\n${copy.intro}\n\n${input.inviteUrl}\n\n${copy.note}`;

  return await sendMail({
    to: input.to,
    toName: input.displayName,
    subject,
    html,
    text,
    _label: 'TENANT-MEMBER-INVITE',
  });
}
