/**
 * Contact-sales service.
 *
 * Receives a sanitised payload from the public /contact-sales endpoint and:
 *   1. Sends a Hebrew "ליד" (lead) notification to the sales inbox so a
 *      human can follow up. Subject and body are in Hebrew on purpose.
 *   2. Sends a localised confirmation email back to the visitor so they
 *      know the request landed.
 *
 * Both emails reuse the existing Nexus header banner from email.service.ts
 * and mirror the visual language of the reset-password / verify-email
 * templates (white card on light-blue background, 14-px border radius,
 * centred logo banner, soft drop shadow).
 *
 * The service never touches the database. It is intentionally narrow so it
 * stays merge-conflict-free with the wider domain model.
 */

import { env } from '../config/env';
import { sendMail, buildAuthEmailBannerHtml } from './email.service';
import { escapeHtml, messageToHtml } from '../utils/contact-sanitize.util';

/** Inbox that receives the lead notification. */
const SALES_INBOX = process.env.CONTACT_SALES_INBOX ?? '';

/** Sender shown on the confirmation email returned to the visitor. */
const FROM_NAME = 'Nexus';

/** Sanitised, validated payload passed in from the route. */
export interface ContactSalesPayload {
  /** Required email — used for confirmation and as Reply-To on the lead email. */
  email: string;
  /** Optional E.164 phone number. */
  phone?: string;
  /** Optional display name. */
  name?: string;
  /** Required free-text message body (already sanitised, max length enforced). */
  message: string;
  /** Two-letter UI language so we can localise the confirmation email. */
  language: 'en' | 'he';
  /** Page the visitor was on when they opened the form. */
  page?: string;
  /** Caller IP, used only inside the internal notification email. */
  ipAddress?: string;
  /** Caller User-Agent string, used only inside the internal notification email. */
  userAgent?: string;
}

/**
 * Build the Hebrew "ליד" notification sent to the sales inbox.
 *
 * Inputs: sanitised payload.
 * Output: a self-contained HTML email body matching the reset-password
 *         template (centred white card with the Nexus logo banner on top).
 */
function buildLeadEmailHtml(payload: ContactSalesPayload): string {
  const safeEmail = escapeHtml(payload.email);
  const safePhone = payload.phone ? escapeHtml(payload.phone) : '';
  const safeName = payload.name ? escapeHtml(payload.name) : '';
  const safeIp = payload.ipAddress ? escapeHtml(payload.ipAddress) : '';
  const messageHtml = messageToHtml(payload.message);
  const bannerHtml = buildAuthEmailBannerHtml();

  const metaRow = (label: string, value: string): string => `
    <tr>
      <td style="padding:6px 0;color:#6b7280;font-size:13px;width:110px;">${label}</td>
      <td style="padding:6px 0;color:#111;font-size:14px;word-break:break-word;">${value}</td>
    </tr>`;

  const rows: string[] = [];
  if (safeName) rows.push(metaRow('שם', safeName));
  rows.push(metaRow('אימייל', `<a href="mailto:${safeEmail}" style="color:#0EA5E9;text-decoration:none;">${safeEmail}</a>`));
  if (safePhone) rows.push(metaRow('טלפון', safePhone));
  if (safeIp) rows.push(metaRow('IP', safeIp));

  return `<!doctype html>
<html lang="he" dir="rtl">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>ליד חדש</title></head>
<body style="margin:0;padding:0;background:#f5f7fb;font-family:Arial,Helvetica,sans-serif;direction:rtl;">
<table width="100%" cellpadding="0" cellspacing="0">
<tr><td align="center" style="padding:40px 20px;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:white;border-radius:14px;padding:40px;box-shadow:0 10px 30px rgba(0,0,0,0.06);">
  <tr><td align="center">
    ${bannerHtml}
    <h1 style="margin:0;color:#111;font-size:26px;">ליד חדש</h1>
    <p style="margin:18px 0 0 0;color:#555;font-size:16px;line-height:1.6;">
      התקבלה פנייה חדשה מטופס "צור קשר עם המכירות" באתר.
    </p>
  </td></tr>
  <tr><td style="padding-top:24px;">
    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:16px 18px;">
      <table style="width:100%;">
        ${rows.join('')}
      </table>
    </div>
  </td></tr>
  <tr><td style="padding-top:18px;">
    <div style="font-size:13px;color:#6b7280;margin-bottom:8px;">תוכן ההודעה</div>
    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:14px 16px;font-size:15px;line-height:1.6;color:#111;white-space:pre-wrap;word-break:break-word;">
      ${messageHtml}
    </div>
  </td></tr>
  <tr><td align="center" style="padding-top:24px;">
    <p style="font-size:12px;color:#9ca3af;margin:0;line-height:1.6;">
      ניתן להשיב ישירות למייל הזה כדי לחזור ללקוח — התשובה תישלח לכתובת שהוזנה בטופס.
    </p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

/**
 * Build the localised confirmation email returned to the visitor.
 *
 * Inputs: sanitised payload.
 * Output: { subject, html, text } strings ready for sendMail. The HTML
 *         layout matches the reset-password / verify-email templates so
 *         the visitor sees a consistent Nexus design.
 */
function buildVisitorConfirmation(payload: ContactSalesPayload): { subject: string; html: string; text: string } {
  const isHe = payload.language === 'he';
  const greetName = payload.name ? escapeHtml(payload.name) : (isHe ? 'שלום' : 'Hi there');
  const messageHtml = messageToHtml(payload.message);
  const bannerHtml = buildAuthEmailBannerHtml();

  const subject = isHe
    ? 'קיבלנו את הפנייה שלך — Nexus'
    : 'We received your message — Nexus';

  const heading = isHe ? 'הפנייה התקבלה' : 'Message received';
  const introHtml = isHe
    ? `שלום ${greetName},<br>תודה שפנית אלינו. צוות המכירות יחזור אליך בהקדם.`
    : `Hi ${greetName},<br>Thanks for reaching out. A member of our sales team will be in touch shortly.`;

  const yourMessageLabel = isHe ? 'ההודעה שלך' : 'Your message';
  const footerNote = isHe
    ? 'אם לא שלחת את הפנייה הזו, אפשר להתעלם מהמייל.'
    : "If you didn't submit this message, you can safely ignore this email.";

  const dirAttr = isHe ? 'rtl' : 'ltr';
  const langAttr = isHe ? 'he' : 'en';

  const html = `<!doctype html>
<html lang="${langAttr}" dir="${dirAttr}">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${heading}</title></head>
<body style="margin:0;padding:0;background:#f5f7fb;font-family:Arial,Helvetica,sans-serif;direction:${dirAttr};">
<table width="100%" cellpadding="0" cellspacing="0">
<tr><td align="center" style="padding:40px 20px;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:white;border-radius:14px;padding:40px;box-shadow:0 10px 30px rgba(0,0,0,0.06);">
  <tr><td align="center">
    ${bannerHtml}
    <h1 style="margin:0;color:#111;font-size:26px;">${heading}</h1>
    <p style="margin:18px 0 0 0;color:#555;font-size:16px;line-height:1.6;">${introHtml}</p>
  </td></tr>
  <tr><td style="padding-top:24px;">
    <div style="font-size:13px;color:#6b7280;margin-bottom:8px;">${yourMessageLabel}</div>
    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:14px 16px;font-size:15px;line-height:1.6;color:#111;white-space:pre-wrap;word-break:break-word;">
      ${messageHtml}
    </div>
  </td></tr>
  <tr><td align="center" style="padding-top:30px;">
    <p style="font-size:12px;color:#9ca3af;margin:0;line-height:1.6;">${footerNote}</p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`;

  const text = isHe
    ? `שלום ${payload.name ?? ''},\n\nתודה שפנית אלינו. צוות המכירות יחזור אליך בהקדם.\n\nההודעה שלך:\n${payload.message}\n\nאם לא שלחת את הפנייה הזו, אפשר להתעלם מהמייל.`
    : `Hi ${payload.name ?? 'there'},\n\nThanks for reaching out. A member of our sales team will be in touch shortly.\n\nYour message:\n${payload.message}\n\nIf you didn't submit this message, you can safely ignore this email.`;

  return { subject, html, text };
}

/**
 * Dispatch the two emails for a contact-sales submission.
 *
 * Inputs: a sanitised payload.
 * Output: resolves once both emails have been attempted. The lead email is
 *         sent first; the visitor confirmation follows so the user is not
 *         left in the dark even when the internal send fails.
 */
export async function dispatchContactSales(payload: ContactSalesPayload): Promise<void> {
  const leadSubject = `ליד חדש — ${payload.email}`;
  const leadHtml = buildLeadEmailHtml(payload);
  const confirmation = buildVisitorConfirmation(payload);

  // Internal lead notification — owner inbox.
  await sendMail({
    to: SALES_INBOX,
    subject: leadSubject,
    html: leadHtml,
    fromName: FROM_NAME,
    replyTo: payload.email,
    _label: 'CONTACT-SALES',
  });

  // Visitor confirmation — sent from EMAIL_FROM (see email.service.ts).
  await sendMail({
    to: payload.email,
    toName: payload.name,
    subject: confirmation.subject,
    html: confirmation.html,
    text: confirmation.text,
    fromName: FROM_NAME,
    _label: 'CONTACT-SALES-ACK',
  });
}

/** Re-exported so the route doesn't have to read process.env directly. */
export function getSalesInbox(): string {
  return SALES_INBOX;
}

/** Marker used by the route so logs / tests can assert which sender was used. */
export const EMAIL_FROM_FALLBACK = env.EMAIL_FROM ?? 'hello@nexus-payment.com';
