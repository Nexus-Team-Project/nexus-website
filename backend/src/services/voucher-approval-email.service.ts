/**
 * Voucher Approval Email Service - sends transactional emails for the voucher ecosystem approval flow.
 *
 * Three email types:
 *   1. Approval request - sent to all NEXUS platform admins when a supplier submits or resubmits.
 *   2. Approved         - sent to the supplier when a platform admin approves the offer.
 *   3. Denied           - sent to the supplier with the denial reason so they can correct and resubmit.
 *
 * All emails are bilingual (Hebrew primary, English secondary) and follow the same
 * visual style as domain-member-invite-email.service.ts.
 *
 * Security: nexus_cost is shown in the admin approval-request email (admins need it to evaluate pricing)
 * but is never included in supplier-facing emails.
 */

import { env } from '../config/env';
import { buildAuthEmailBannerHtml, sendMail } from './email.service';
import type { NexusOffer } from '../models/domain/supply.models';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Escapes untrusted text before embedding it inside email HTML.
 * Input: raw string from DB or user input.
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
 * Formats a currency amount as an Israeli Shekel string.
 * Input: numeric amount (e.g. 80).
 * Output: formatted string (e.g. "₪80.00").
 */
function formatShekel(amount: number): string {
  return new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS' }).format(amount);
}

/**
 * Parses NEXUS_ADMIN_EMAILS env var into a trimmed, non-empty list of addresses.
 * Input: none.
 * Output: string[] of admin email addresses.
 */
function getAdminEmails(): string[] {
  if (!env.NEXUS_ADMIN_EMAILS) return [];
  return env.NEXUS_ADMIN_EMAILS
    .split(',')
    .map((e) => e.trim())
    .filter((e) => e.length > 0);
}

/**
 * Builds a pricing table row for display in admin emails.
 * Input: label and formatted value.
 * Output: HTML table row string.
 */
function buildPriceRow(label: string, value: string): string {
  return `
<tr>
  <td style="padding:6px 12px;color:#555;font-size:14px;border-bottom:1px solid #f1f5f9;">${escapeHtml(label)}</td>
  <td style="padding:6px 12px;font-weight:600;font-size:14px;color:#111;border-bottom:1px solid #f1f5f9;text-align:right;">${escapeHtml(value)}</td>
</tr>`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Sends a voucher approval-request email to every NEXUS platform admin.
 * Called when a supplier creates a new ecosystem voucher offer, resubmits after denial,
 * or updates an offer that is already waiting for approval.
 *
 * The email includes nexus_cost so admins can evaluate supplier pricing before approving.
 * It is intentionally NOT sent to the supplier.
 *
 * Input:
 *   adminEmails        - list of platform admin email addresses (from NEXUS_ADMIN_EMAILS).
 *   offer              - the NexusOffer awaiting approval.
 *   supplierTenantName - display name of the supplier's workspace.
 *   isUpdate           - true when the offer was edited while already pending (changes subject + heading).
 * Output: Promise<void>. Errors are logged but do not throw so offer creation is not blocked.
 */
export async function sendVoucherApprovalRequestEmail(
  adminEmails: string[],
  offer: NexusOffer,
  supplierTenantName: string,
  isUpdate = false,
): Promise<void> {
  if (adminEmails.length === 0) {
    console.warn('[VOUCHER-APPROVAL] No admin emails configured - skipping approval request email');
    return;
  }

  const bannerHtml = buildAuthEmailBannerHtml();
  const offerTitle = escapeHtml(offer.title);
  const tenantName = escapeHtml(supplierTenantName);

  const headingHe = isUpdate
    ? 'הצעת שובר עודכנה – ממתינה לאישורך'
    : 'הצעת שובר חדשה ממתינה לאישור';
  const headingEn = isUpdate
    ? 'Voucher offer updated — awaiting re-approval'
    : 'New voucher offer awaiting approval';
  const bodyHe = isUpdate
    ? `הספק <strong>${tenantName}</strong> עדכן הצעת שובר שעדיין ממתינה לאישורך. הפרטים המעודכנים מוצגים למטה.`
    : `הספק <strong>${tenantName}</strong> שלח הצעת שובר חדשה שדורשת את אישורך לפני פרסום בפלטפורמה.`;
  const bodyEn = isUpdate
    ? `Supplier <strong>${tenantName}</strong> updated a voucher offer that is still pending your approval. Updated details are shown below.`
    : `Supplier <strong>${tenantName}</strong> submitted a new voucher offer for your review.`;
  const subjectPrefix = isUpdate
    ? 'הצעת שובר עודכנה'
    : 'הצעת שובר חדשה ממתינה לאישור';

  const pricingRows = [
    offer.face_value !== undefined ? buildPriceRow('ערך נקוב / Face value', formatShekel(offer.face_value)) : '',
    offer.nexus_cost !== undefined ? buildPriceRow('עלות Nexus / Nexus cost', formatShekel(offer.nexus_cost)) : '',
    offer.member_price !== undefined ? buildPriceRow('מחיר לחבר / Member price', formatShekel(offer.member_price)) : '',
  ].join('');

  const dashboardUrl = env.DASHBOARD_URL ?? 'https://dashboard.nexus-payment.com';

  const html = `<!doctype html>
<html lang="he" dir="rtl">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f7fb;font-family:Arial,Helvetica,sans-serif;direction:rtl;">
<table width="100%" cellpadding="0" cellspacing="0">
<tr><td align="center" style="padding:40px 20px;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:white;border-radius:14px;padding:40px;box-shadow:0 10px 30px rgba(0,0,0,0.06);">
<tr><td align="center">
  ${bannerHtml}
  <h1 style="margin:0;color:#111;font-size:24px;">${headingHe}</h1>
  <p style="color:#888;font-size:13px;margin-top:4px;">${headingEn}</p>
  <p style="margin:18px 0 8px 0;color:#555;font-size:15px;line-height:1.6;">${bodyHe}</p>
  <p style="color:#888;font-size:13px;">${bodyEn}</p>
</td></tr>
<tr><td style="padding:16px 0;">
  <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:20px;">
    <p style="margin:0 0 12px 0;font-weight:700;font-size:15px;color:#111;">${offerTitle}</p>
    <table width="100%" cellpadding="0" cellspacing="0">
      ${pricingRows}
    </table>
  </div>
</td></tr>
<tr><td align="center" style="padding:24px 0 8px 0;">
  <a href="${escapeHtml(dashboardUrl)}" style="background:#111;color:white;padding:15px 36px;border-radius:10px;font-size:16px;font-weight:bold;text-decoration:none;display:inline-block;">
    לאישור / Review in Dashboard
  </a>
</td></tr>
<tr><td align="center">
  <p style="font-size:12px;color:#999;margin-top:20px;line-height:1.6;">
    מספר הצעה: ${escapeHtml(offer.offerId)}
  </p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  const text = `הצעת שובר חדשה מ-${supplierTenantName}: ${offer.title}\nOfferId: ${offer.offerId}\n\nבקר בדשבורד לאישור / Visit dashboard to review: ${dashboardUrl}`;

  // Send to each admin separately so one bad address doesn't block the rest.
  for (const adminEmail of adminEmails) {
    try {
      await sendMail({
        to: adminEmail,
        subject: `${subjectPrefix} - ${offer.title}`,
        html,
        text,
        _label: 'VOUCHER-APPROVAL-REQUEST',
      });
    } catch (err) {
      // Log but do not throw - email failure must not block offer creation.
      console.error(`[VOUCHER-APPROVAL] Failed to send approval-request email to ${adminEmail}:`, err);
    }
  }
}

/**
 * Sends a congratulatory approval email to the offer's supplier.
 * Called after a platform admin approves a voucher offer.
 *
 * Input:
 *   to         - supplier's email address.
 *   offer      - the approved NexusOffer (nexus_cost is NOT included in this email).
 *   tenantName - supplier's workspace display name.
 * Output: Promise<void>. Errors are logged but do not throw.
 */
export async function sendVoucherApprovedEmail(
  to: string,
  offer: NexusOffer,
  tenantName: string,
): Promise<void> {
  const bannerHtml = buildAuthEmailBannerHtml();
  const offerTitle = escapeHtml(offer.title);
  const escapedTenantName = escapeHtml(tenantName);
  const dashboardUrl = env.DASHBOARD_URL ?? 'https://dashboard.nexus-payment.com';

  const html = `<!doctype html>
<html lang="he" dir="rtl">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f7fb;font-family:Arial,Helvetica,sans-serif;direction:rtl;">
<table width="100%" cellpadding="0" cellspacing="0">
<tr><td align="center" style="padding:40px 20px;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:white;border-radius:14px;padding:40px;box-shadow:0 10px 30px rgba(0,0,0,0.06);">
<tr><td align="center">
  ${bannerHtml}
  <h1 style="margin:0;color:#16a34a;font-size:24px;">הצעת השובר שלך אושרה!</h1>
  <p style="color:#888;font-size:13px;margin-top:4px;">Your voucher offer has been approved</p>
  <p style="margin:18px 0 8px 0;color:#555;font-size:15px;line-height:1.6;">
    שלום <strong>${escapedTenantName}</strong>,<br>
    הצעת השובר שלך <strong>"${offerTitle}"</strong> אושרה על ידי צוות Nexus ועכשיו היא פעילה בפלטפורמה!
  </p>
  <p style="color:#888;font-size:13px;line-height:1.6;">
    Hi <strong>${escapedTenantName}</strong>, your voucher offer <strong>"${offerTitle}"</strong>
    has been approved and is now live on the NEXUS platform. All adopting tenants can now add it to their catalogs.
  </p>
</td></tr>
<tr><td align="center" style="padding:24px 0 8px 0;">
  <a href="${escapeHtml(dashboardUrl)}" style="background:#16a34a;color:white;padding:15px 36px;border-radius:10px;font-size:16px;font-weight:bold;text-decoration:none;display:inline-block;">
    צפייה בהצעה / View Offer
  </a>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  const text = `הצעת השובר שלך אושרה!\nYour voucher offer "${offer.title}" has been approved and is now live on NEXUS.\n${dashboardUrl}`;

  try {
    await sendMail({
      to,
      subject: `הצעת השובר שלך אושרה - ${offer.title}`,
      html,
      text,
      _label: 'VOUCHER-APPROVED',
    });
  } catch (err) {
    console.error(`[VOUCHER-APPROVAL] Failed to send approved email to ${to}:`, err);
  }
}

/**
 * Sends a denial notification email to the offer's supplier.
 * Called after a platform admin denies a voucher offer.
 * The denial reason is clearly shown so the supplier can correct and resubmit.
 *
 * Input:
 *   to         - supplier's email address.
 *   offer      - the denied NexusOffer.
 *   reason     - human-readable explanation from the platform admin.
 *   tenantName - supplier's workspace display name.
 * Output: Promise<void>. Errors are logged but do not throw.
 */
export async function sendVoucherDeniedEmail(
  to: string,
  offer: NexusOffer,
  reason: string,
  tenantName: string,
): Promise<void> {
  const bannerHtml = buildAuthEmailBannerHtml();
  const offerTitle = escapeHtml(offer.title);
  const escapedTenantName = escapeHtml(tenantName);
  const escapedReason = escapeHtml(reason);
  const dashboardUrl = env.DASHBOARD_URL ?? 'https://dashboard.nexus-payment.com';

  const html = `<!doctype html>
<html lang="he" dir="rtl">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f7fb;font-family:Arial,Helvetica,sans-serif;direction:rtl;">
<table width="100%" cellpadding="0" cellspacing="0">
<tr><td align="center" style="padding:40px 20px;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:white;border-radius:14px;padding:40px;box-shadow:0 10px 30px rgba(0,0,0,0.06);">
<tr><td align="center">
  ${bannerHtml}
  <h1 style="margin:0;color:#dc2626;font-size:24px;">הצעת השובר שלך נדחתה</h1>
  <p style="color:#888;font-size:13px;margin-top:4px;">Your voucher offer was not approved</p>
  <p style="margin:18px 0 8px 0;color:#555;font-size:15px;line-height:1.6;">
    שלום <strong>${escapedTenantName}</strong>,<br>
    הצעת השובר <strong>"${offerTitle}"</strong> נסקרה על ידי צוות Nexus ולא אושרה לפרסום בשלב זה.
  </p>
  <p style="color:#888;font-size:13px;line-height:1.6;">
    Hi <strong>${escapedTenantName}</strong>, your voucher offer <strong>"${offerTitle}"</strong>
    was reviewed by the NEXUS team and was not approved at this time.
  </p>
</td></tr>
<tr><td style="padding:16px 0;">
  <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:20px;">
    <p style="margin:0 0 8px 0;font-weight:700;font-size:14px;color:#991b1b;">סיבת הדחייה / Denial reason:</p>
    <p style="margin:0;font-size:14px;color:#7f1d1d;line-height:1.6;">${escapedReason}</p>
  </div>
</td></tr>
<tr><td align="center" style="padding:8px 0;">
  <p style="color:#555;font-size:14px;line-height:1.6;">
    תוכל לערוך את ההצעה ולהגישה מחדש מהדשבורד לאחר תיקון הבעיות שצוינו.<br>
    <span style="color:#888;font-size:13px;">You can edit the offer and resubmit it from the dashboard after addressing the issues above.</span>
  </p>
</td></tr>
<tr><td align="center" style="padding:16px 0 8px 0;">
  <a href="${escapeHtml(dashboardUrl)}" style="background:#111;color:white;padding:15px 36px;border-radius:10px;font-size:16px;font-weight:bold;text-decoration:none;display:inline-block;">
    עריכה והגשה מחדש / Edit and Resubmit
  </a>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  const text = `הצעת השובר שלך נדחתה\nYour voucher offer "${offer.title}" was not approved.\n\nסיבה / Reason: ${reason}\n\nEdit and resubmit from: ${dashboardUrl}`;

  try {
    await sendMail({
      to,
      subject: `הצעת השובר שלך נדחתה - ${offer.title}`,
      html,
      text,
      _label: 'VOUCHER-DENIED',
    });
  } catch (err) {
    console.error(`[VOUCHER-APPROVAL] Failed to send denied email to ${to}:`, err);
  }
}

/**
 * Sends a withdrawal notification to every NEXUS platform admin.
 * Called when a supplier deletes an offer that was still in pending_approval status.
 * Lets admins know they no longer need to review it.
 *
 * Input:
 *   adminEmails        - list of platform admin email addresses (from NEXUS_ADMIN_EMAILS).
 *   offer              - the deleted NexusOffer (captured before soft-delete).
 *   supplierTenantName - display name of the supplier's workspace.
 * Output: Promise<void>. Errors are logged but do not throw.
 */
export async function sendVoucherWithdrawnEmail(
  adminEmails: string[],
  offer: NexusOffer,
  supplierTenantName: string,
): Promise<void> {
  if (adminEmails.length === 0) return;

  const bannerHtml = buildAuthEmailBannerHtml();
  const offerTitle = escapeHtml(offer.title);
  const tenantName = escapeHtml(supplierTenantName);

  const html = `<!doctype html>
<html lang="he" dir="rtl">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f7fb;font-family:Arial,Helvetica,sans-serif;direction:rtl;">
<table width="100%" cellpadding="0" cellspacing="0">
<tr><td align="center" style="padding:40px 20px;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:white;border-radius:14px;padding:40px;box-shadow:0 10px 30px rgba(0,0,0,0.06);">
<tr><td align="center">
  ${bannerHtml}
  <h1 style="margin:0;color:#64748b;font-size:22px;">הצעת שובר בוטלה לפני אישור</h1>
  <p style="color:#888;font-size:13px;margin-top:4px;">Voucher offer withdrawn before review</p>
  <p style="margin:18px 0 8px 0;color:#555;font-size:15px;line-height:1.6;">
    הספק <strong>${tenantName}</strong> מחק את הצעת השובר <strong>"${offerTitle}"</strong>
    לפני שנסקרה. אין צורך בפעולה מצדך.
  </p>
  <p style="color:#888;font-size:13px;line-height:1.6;">
    Supplier <strong>${tenantName}</strong> deleted the voucher offer <strong>"${offerTitle}"</strong>
    before it was reviewed. No action is required on your part.
  </p>
  <p style="color:#bbb;font-size:12px;margin-top:20px;">מספר הצעה: ${escapeHtml(offer.offerId)}</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  const text = `הצעת שובר בוטלה לפני אישור\nVoucher offer withdrawn: "${offer.title}" (by ${supplierTenantName})\nOffer ID: ${offer.offerId}\nNo action required.`;

  for (const adminEmail of adminEmails) {
    try {
      await sendMail({
        to: adminEmail,
        subject: `הצעת שובר בוטלה - ${offer.title}`,
        html,
        text,
        _label: 'VOUCHER-WITHDRAWN',
      });
    } catch (err) {
      console.error(`[VOUCHER-APPROVAL] Failed to send withdrawn email to ${adminEmail}:`, err);
    }
  }
}

/**
 * Sends a "not approved" notification to the offer's SUPPLIER when a NEXUS
 * platform admin deletes their pending offer (admin-delete of a pending offer
 * acts as a soft denial). Supplier-facing, so it does NOT expose the offer id.
 *
 * Input:
 *   to    - supplier's email address (offer creator's identity email).
 *   offer - the deleted NexusOffer (captured before soft-delete).
 * Output: Promise<void>. Errors are logged but do not throw.
 */
export async function sendOfferRemovedByAdminEmail(
  to: string,
  offer: NexusOffer,
): Promise<void> {
  const bannerHtml = buildAuthEmailBannerHtml();
  const offerTitle = escapeHtml(offer.title);
  const dashboardUrl = env.DASHBOARD_URL ?? 'https://dashboard.nexus-payment.com';

  const html = `<!doctype html>
<html lang="he" dir="rtl">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f7fb;font-family:Arial,Helvetica,sans-serif;direction:rtl;">
<table width="100%" cellpadding="0" cellspacing="0">
<tr><td align="center" style="padding:40px 20px;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:white;border-radius:14px;padding:40px;box-shadow:0 10px 30px rgba(0,0,0,0.06);">
<tr><td align="center">
  ${bannerHtml}
  <h1 style="margin:0;color:#dc2626;font-size:24px;">הצעת השובר בוטלה</h1>
  <p style="color:#888;font-size:13px;margin-top:4px;">Your voucher offer was removed</p>
  <p style="margin:18px 0 8px 0;color:#555;font-size:15px;line-height:1.6;">
    אדמין נקסוס לא אישר את ההצעה שלך <strong>"${offerTitle}"</strong>.
  </p>
  <p style="color:#888;font-size:13px;line-height:1.6;">
    A NEXUS admin did not approve your offer <strong>"${offerTitle}"</strong>.
  </p>
</td></tr>
<tr><td align="center" style="padding:24px 0 8px 0;">
  <a href="${escapeHtml(dashboardUrl)}" style="background:#111;color:white;padding:15px 36px;border-radius:10px;font-size:16px;font-weight:bold;text-decoration:none;display:inline-block;">
    לדשבורד / Open Dashboard
  </a>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  const text = `הצעת השובר בוטלה\nאדמין נקסוס לא אישר את ההצעה שלך "${offer.title}".\nA NEXUS admin did not approve your offer.\n${dashboardUrl}`;

  try {
    await sendMail({ to, subject: 'הצעת השובר בוטלה', html, text, _label: 'OFFER-REMOVED-BY-ADMIN' });
  } catch (err) {
    console.error(`[VOUCHER-APPROVAL] Failed to send offer-removed email to ${to}:`, err);
  }
}

/**
 * Convenience helper: reads NEXUS_ADMIN_EMAILS from env and returns the list.
 * Used by offer routes so they don't need to import env directly.
 *
 * Output: string[] of trimmed, non-empty admin email addresses.
 */
export function getConfiguredAdminEmails(): string[] {
  return getAdminEmails();
}
