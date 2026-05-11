/**
 * Builds and sends tenant member notification emails:
 * - Removed from tenant workspace.
 * - Invite revoked (admin changed the invited email address).
 * Visual style matches the invite email: logo banner, white card, centered layout.
 */
import { buildAuthEmailBannerHtml, sendMail } from './email.service';

export interface TenantMemberRemovedEmailInput {
  to: string;
  displayName?: string;
  tenantName: string;
  language: 'he' | 'en';
}

/**
 * Escapes untrusted text before placing it inside email HTML.
 * Input: raw string from a user or tenant record.
 * Output: HTML-safe string.
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
 * Sends the removal notification email through the shared email provider.
 * Input: recipient address, optional display name, tenant name, language.
 * Output: provider message id, or null when email is disabled.
 */
export async function sendTenantMemberRemovedEmail(
  input: TenantMemberRemovedEmailInput,
): Promise<string | null> {
  const isHebrew = input.language === 'he';
  const dir = isHebrew ? 'rtl' : 'ltr';
  const tenantName = escapeHtml(input.tenantName);
  const bannerHtml = buildAuthEmailBannerHtml();

  const subject = isHebrew
    ? `הוסרת מ-${tenantName}`
    : `You have been removed from ${tenantName}`;

  const copy = isHebrew
    ? {
        title: `הוסרת מ-${tenantName}`,
        body: `אנחנו מודיעים לך שהגישה שלך לסביבת העבודה <strong>${tenantName}</strong> הוסרה.`,
        note: 'אם אתה סבור שמדובר בטעות, פנה למנהל הסביבה שלך.',
      }
    : {
        title: `You have been removed from ${tenantName}`,
        body: `We are letting you know that your access to the <strong>${tenantName}</strong> workspace has been removed.`,
        note: 'If you believe this was a mistake, please contact your workspace admin.',
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
  <p style="margin:18px 0 8px 0;color:#555;font-size:15px;line-height:1.6;">${copy.body}</p>
  <p style="font-size:13px;color:#999;margin-top:20px;line-height:1.6;">${copy.note}</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  const text = `${copy.title}\n\n${input.tenantName}\n\n${copy.note}`;

  return await sendMail({
    to: input.to,
    toName: input.displayName,
    subject,
    html,
    text,
    _label: 'TENANT-MEMBER-REMOVED',
  });
}

export interface TenantInviteRevokedEmailInput {
  to: string;
  displayName?: string;
  tenantName: string;
  language: 'he' | 'en';
}

/**
 * Sends a notice to the old email address when an admin changes the invite email.
 * Input: old recipient address, optional display name, tenant name, language.
 * Output: provider message id, or null when email is disabled.
 */
export async function sendTenantInviteRevokedEmail(
  input: TenantInviteRevokedEmailInput,
): Promise<string | null> {
  const isHebrew = input.language === 'he';
  const dir = isHebrew ? 'rtl' : 'ltr';
  const tenantName = escapeHtml(input.tenantName);
  const bannerHtml = buildAuthEmailBannerHtml();

  const subject = isHebrew
    ? `ההזמנה שלך ל-${tenantName} בוטלה`
    : `Your invitation to ${tenantName} was cancelled`;

  const copy = isHebrew
    ? {
        title: `ההזמנה שלך ל-${tenantName} בוטלה`,
        body: `ההזמנה שנשלחה לכתובת זו להצטרף לסביבת העבודה <strong>${tenantName}</strong> בוטלה.`,
        note: 'אם אתה סבור שמדובר בטעות, פנה למנהל הסביבה שלך.',
      }
    : {
        title: `Your invitation to ${tenantName} was cancelled`,
        body: `The invitation sent to this address to join the <strong>${tenantName}</strong> workspace has been cancelled.`,
        note: 'If you believe this was a mistake, please contact your workspace admin.',
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
  <p style="margin:18px 0 8px 0;color:#555;font-size:15px;line-height:1.6;">${copy.body}</p>
  <p style="font-size:13px;color:#999;margin-top:20px;line-height:1.6;">${copy.note}</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  const text = `${copy.title}\n\n${copy.note}`;

  return await sendMail({
    to: input.to,
    toName: input.displayName,
    subject,
    html,
    text,
    _label: 'TENANT-INVITE-REVOKED',
  });
}
