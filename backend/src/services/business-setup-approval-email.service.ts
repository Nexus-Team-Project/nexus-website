/**
 * Business-Setup Approval emails (Phase 2 M8).
 *
 * Three transactional emails:
 *   1. sendBusinessSetupSubmittedToAdmins - notify every NEXUS admin that a tenant
 *      submitted business setup and is awaiting approval (dev requests are tagged).
 *   2. sendBusinessSetupApproved - tell the tenant owner their setup was approved.
 *   3. sendBusinessSetupDenied   - tell the tenant owner it was denied, with the reason.
 *
 * Bilingual (Hebrew primary + English), reusing the shared Nexus banner + card,
 * matching the voucher/org approval email style. Errors are logged, never thrown.
 * The denial reason is rendered as plain text (escaped) - never HTML.
 */
import { env } from '../config/env';
import { buildAuthEmailBannerHtml, sendMail } from './email.service';

/** Escapes untrusted text before embedding it in email HTML. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Parses NEXUS_ADMIN_EMAILS into a trimmed, non-empty list. */
function adminEmails(): string[] {
  return (env.NEXUS_ADMIN_EMAILS ?? '').split(',').map((e) => e.trim()).filter((e) => e.length > 0);
}

/** Wraps body HTML in the shared card shell + Nexus banner. */
function shell(bodyHtml: string): string {
  return `<!doctype html>
<html lang="he" dir="rtl">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f7fb;font-family:Arial,Helvetica,sans-serif;direction:rtl;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 20px;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:white;border-radius:14px;padding:40px;box-shadow:0 10px 30px rgba(0,0,0,0.06);">
<tr><td align="center">${buildAuthEmailBannerHtml()}${bodyHtml}</td></tr>
</table></td></tr></table>
</body></html>`;
}

const DASHBOARD_URL = (): string => env.DASHBOARD_URL ?? 'https://dashboard.nexus-payment.com';

/**
 * Notify every NEXUS admin that a tenant submitted business setup for review.
 * Input: org name; devMode (true when sent via the dev-only shortcut - tagged).
 */
export async function sendBusinessSetupSubmittedToAdmins(orgName: string, devMode: boolean): Promise<void> {
  const admins = adminEmails();
  if (admins.length === 0) return;
  const dash = DASHBOARD_URL();
  const org = escapeHtml(orgName);
  const tag = devMode ? ' (Dev mode)' : '';
  const html = shell(`
    <h1 style="margin:0;color:#111;font-size:22px;">בקשת אישור הגדרת עסק${tag}</h1>
    <p style="color:#888;font-size:13px;margin-top:4px;">Business setup awaiting your approval${tag}</p>
    <p style="margin:18px 0 8px 0;color:#555;font-size:15px;line-height:1.6;">הארגון <strong>${org}</strong> השלים הגדרת עסק וממתין לאישורכם.</p>
    <p style="color:#888;font-size:13px;">Organization <strong>${org}</strong> submitted business setup and is awaiting approval.</p>
    <p style="padding-top:20px;margin:0;"><a href="${escapeHtml(dash)}/admin/business-setup-approvals" style="background:#111;color:#fff;padding:14px 32px;border-radius:10px;font-weight:bold;text-decoration:none;display:inline-block;">אישור בקשות / Review</a></p>`);
  const text = `Business setup submitted by ${orgName}${tag}. Review: ${dash}/admin/business-setup-approvals`;
  for (const to of admins) {
    try {
      await sendMail({ to, subject: `בקשת אישור הגדרת עסק - ${orgName}`, html, text, _label: 'BIZ-SETUP-SUBMITTED' });
    } catch (e) {
      console.error(`[BIZ-SETUP] submit email to ${to} failed:`, e);
    }
  }
}

/**
 * Tell the tenant owner their business setup was approved.
 * Input: owner email + org name.
 */
export async function sendBusinessSetupApproved(to: string, orgName: string): Promise<void> {
  const dash = DASHBOARD_URL();
  const org = escapeHtml(orgName);
  const html = shell(`
    <h1 style="margin:0;color:#16a34a;font-size:24px;">הגדרת העסק אושרה!</h1>
    <p style="color:#888;font-size:13px;margin-top:4px;">Your business setup was approved</p>
    <p style="margin:18px 0 8px 0;color:#555;font-size:15px;line-height:1.6;">שלום <strong>${org}</strong>, הגדרת העסק שלך אושרה. כעת ניתן לפרסם הצעות גלובליות ולעלות לאוויר.</p>
    <p style="color:#888;font-size:13px;">Hi <strong>${org}</strong>, your business setup was approved. You can now publish global offers and Go Live.</p>
    <p style="padding-top:20px;margin:0;"><a href="${escapeHtml(dash)}" style="background:#16a34a;color:#fff;padding:14px 32px;border-radius:10px;font-weight:bold;text-decoration:none;display:inline-block;">לדשבורד / Dashboard</a></p>`);
  const text = `Your business setup was approved. ${dash}`;
  try {
    await sendMail({ to, subject: 'הגדרת העסק אושרה', html, text, _label: 'BIZ-SETUP-APPROVED' });
  } catch (e) {
    console.error(`[BIZ-SETUP] approved email to ${to} failed:`, e);
  }
}

/**
 * Tell the tenant owner their business setup was denied, with the reason.
 * Input: owner email + org name + free-text reason (rendered as escaped text).
 */
export async function sendBusinessSetupDenied(to: string, orgName: string, reason: string): Promise<void> {
  const dash = DASHBOARD_URL();
  const org = escapeHtml(orgName);
  const html = shell(`
    <h1 style="margin:0;color:#dc2626;font-size:24px;">הגדרת העסק לא אושרה</h1>
    <p style="color:#888;font-size:13px;margin-top:4px;">Your business setup was not approved</p>
    <p style="margin:18px 0 8px 0;color:#555;font-size:15px;line-height:1.6;">שלום <strong>${org}</strong>, הגדרת העסק שלך נבדקה ולא אושרה בשלב זה.</p>
    <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:16px;margin-top:12px;text-align:right;">
      <p style="margin:0 0 6px 0;font-weight:700;color:#991b1b;font-size:14px;">סיבה / Reason:</p>
      <p style="margin:0;color:#7f1d1d;font-size:14px;line-height:1.6;">${escapeHtml(reason)}</p>
    </div>
    <p style="padding-top:20px;margin:0;"><a href="${escapeHtml(dash)}" style="background:#111;color:#fff;padding:14px 32px;border-radius:10px;font-weight:bold;text-decoration:none;display:inline-block;">עדכון הפרטים / Update details</a></p>`);
  const text = `Your business setup was not approved. Reason: ${reason}. ${dash}`;
  try {
    await sendMail({ to, subject: 'הגדרת העסק לא אושרה', html, text, _label: 'BIZ-SETUP-DENIED' });
  } catch (e) {
    console.error(`[BIZ-SETUP] denied email to ${to} failed:`, e);
  }
}
