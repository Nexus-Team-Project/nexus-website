/**
 * Bilingual emails for the wallet join-request flow.
 *
 * sendJoinRequestAdminNotification: tells tenant admins a new request
 *   landed in their /users page. Sent to every admin/owner of the
 *   tenant; best-effort - never blocks the request creation.
 *
 * sendJoinRequestDecision: tells the requester whether their request
 *   was approved or denied. Sent from the dashboard PATCH handler.
 *
 * Visual style matches the reset-password + tenant-member-invite
 * emails: shared logo banner, centered white card on a soft grey
 * background, dark CTA button. We avoid divergent inline-only emails
 * so every transactional message feels like the same brand.
 *
 * Spec: docs/superpowers/specs/2026-05-25-nexus-wallet-auth-design.md sections 9, 10.4
 */
import { buildAuthEmailBannerHtml, sendMail } from '../email.service';

interface AdminNotificationInput {
  to: string;
  tenantName: string;
  requesterEmail: string;
  requesterDisplayName?: string;
  dashboardUrl: string;
  lang?: 'he' | 'en';
}

/**
 * Renders the shared card frame: header banner, white card, padding,
 * box-shadow. Same dimensions / radii as the invite email so they
 * sit beside each other consistently in an inbox preview.
 *
 * Inputs: language and the inner HTML (title + body + CTA).
 * Output: full <!doctype html> document ready for sendMail.
 */
function renderCardHtml(language: 'he' | 'en', inner: string): string {
  const dir = language === 'he' ? 'rtl' : 'ltr';
  const bannerHtml = buildAuthEmailBannerHtml();
  return `<!doctype html>
<html lang="${language}" dir="${dir}">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f7fb;font-family:Arial,Helvetica,sans-serif;direction:${dir};">
<table width="100%" cellpadding="0" cellspacing="0">
<tr><td align="center" style="padding:40px 20px;">
<table width="560" cellpadding="0" cellspacing="0" style="background:white;border-radius:14px;padding:40px;box-shadow:0 10px 30px rgba(0,0,0,0.06);">
<tr><td align="center">
  ${bannerHtml}
  ${inner}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

/**
 * Escapes user-supplied strings before inlining into email HTML.
 * Input: raw text. Output: HTML-safe text.
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
 * Standard dark CTA button used across Nexus transactional emails.
 * Input: target URL and visible label.
 * Output: anchor HTML safe to drop inside the card.
 */
function ctaButton(url: string, label: string): string {
  return `<a href="${escapeHtml(url)}" style="background:#111;color:white;padding:15px 36px;border-radius:10px;font-size:16px;font-weight:bold;text-decoration:none;display:inline-block;">${label}</a>`;
}

/**
 * Sends the "new join request" notification to a tenant admin.
 * Input: recipient email, tenant + requester display info, dashboard
 * URL, optional language (default Hebrew - matches Nexus default UI).
 * Output: resolves once the send attempt completes (never throws).
 */
export async function sendJoinRequestAdminNotification(
  input: AdminNotificationInput,
): Promise<void> {
  const isHe = (input.lang ?? 'he') === 'he';
  const requester = escapeHtml(input.requesterDisplayName ?? input.requesterEmail);
  const requesterEmail = escapeHtml(input.requesterEmail);
  const tenant = escapeHtml(input.tenantName);
  const ctaUrl = `${input.dashboardUrl.replace(/\/+$/, '')}/users`;

  const subject = isHe
    ? `בקשת הצטרפות חדשה ל-${input.tenantName}`
    : `New join request for ${input.tenantName}`;

  const copy = isHe
    ? {
        title: `בקשת הצטרפות חדשה`,
        intro: `<b>${requester}</b> ביקש להצטרף לארגון <b>${tenant}</b>.`,
        emailRow: `כתובת מייל: <span style="color:#111;font-weight:600;">${requesterEmail}</span>`,
        body: 'ניתן לאשר או לדחות את הבקשה מתוך עמוד החברים בלוח הבקרה.',
        action: 'פתח את עמוד החברים',
        fallback: 'אם הכפתור לא עובד, ניתן לפתוח את הקישור:',
      }
    : {
        title: `New join request`,
        intro: `<b>${requester}</b> requested to join <b>${tenant}</b>.`,
        emailRow: `Email: <span style="color:#111;font-weight:600;">${requesterEmail}</span>`,
        body: 'Approve or deny the request from the Members page.',
        action: 'Open Members page',
        fallback: "If the button doesn't work, use this link:",
      };

  const inner = `
  <h1 style="margin:0;color:#111;font-size:26px;">${copy.title}</h1>
  <p style="margin:18px 0 4px 0;color:#555;font-size:15px;line-height:1.6;">${copy.intro}</p>
  <p style="margin:4px 0 18px 0;color:#555;font-size:14px;line-height:1.6;">${copy.emailRow}</p>
  <p style="margin:0 0 24px 0;color:#555;font-size:14px;line-height:1.6;">${copy.body}</p>
  <div style="padding:8px 0;">${ctaButton(ctaUrl, copy.action)}</div>
  <p style="font-size:13px;color:#888;margin-top:25px;">${copy.fallback}</p>
  <p style="font-size:13px;color:#444;word-break:break-all;">${escapeHtml(ctaUrl)}</p>`;

  const text = `${input.requesterDisplayName ?? input.requesterEmail} requested to join ${input.tenantName}.\n${input.requesterEmail}\n\n${ctaUrl}`;

  await sendMail({
    to: input.to,
    subject,
    html: renderCardHtml(isHe ? 'he' : 'en', inner),
    text,
    _label: 'JOIN_REQ_ADMIN',
  });
}

interface DecisionInput {
  to: string;
  tenantName: string;
  decision: 'approved' | 'denied';
  reason?: string;
  walletUrl: string;
  lang?: 'he' | 'en';
}

/**
 * Sends the approve/deny decision back to the requester.
 * Input: recipient, tenant name, decision verdict, optional deny
 * reason, wallet URL (for the CTA on approval), optional language.
 * Output: resolves once the send attempt completes (never throws).
 */
export async function sendJoinRequestDecision(input: DecisionInput): Promise<void> {
  const isHe = (input.lang ?? 'he') === 'he';
  const tenant = escapeHtml(input.tenantName);
  const reason = input.reason ? escapeHtml(input.reason) : '';
  const walletUrl = input.walletUrl.replace(/\/+$/, '');

  if (input.decision === 'approved') {
    const subject = isHe
      ? `אושרת ל-${input.tenantName}`
      : `Approved to join ${input.tenantName}`;

    const copy = isHe
      ? {
          title: 'הבקשה אושרה',
          intro: `בקשת ההצטרפות שלך ל-<b>${tenant}</b> אושרה. כעת אפשר להיכנס לארנק ולצפות בקטלוג ההטבות של הארגון.`,
          action: 'פתח את הארנק',
          fallback: 'אם הכפתור לא עובד, ניתן לפתוח את הקישור:',
        }
      : {
          title: 'Request approved',
          intro: `Your request to join <b>${tenant}</b> was approved. You can now open the wallet and browse the tenant's benefits catalog.`,
          action: 'Open Wallet',
          fallback: "If the button doesn't work, use this link:",
        };

    const inner = `
  <h1 style="margin:0;color:#111;font-size:26px;">${copy.title}</h1>
  <p style="margin:18px 0 24px 0;color:#555;font-size:15px;line-height:1.6;">${copy.intro}</p>
  <div style="padding:8px 0;">${ctaButton(walletUrl, copy.action)}</div>
  <p style="font-size:13px;color:#888;margin-top:25px;">${copy.fallback}</p>
  <p style="font-size:13px;color:#444;word-break:break-all;">${escapeHtml(walletUrl)}</p>`;

    const text = isHe
      ? `הבקשה שלך ל-${input.tenantName} אושרה.\n\n${walletUrl}`
      : `Your request to join ${input.tenantName} was approved.\n\n${walletUrl}`;

    await sendMail({
      to: input.to,
      subject,
      html: renderCardHtml(isHe ? 'he' : 'en', inner),
      text,
      _label: 'JOIN_REQ_APPROVED',
    });
    return;
  }

  // Denied
  const subject = isHe
    ? `הבקשה ל-${input.tenantName} נדחתה`
    : `Request to join ${input.tenantName} denied`;

  const copy = isHe
    ? {
        title: 'הבקשה נדחתה',
        intro: `הבקשה שלך להצטרף ל-<b>${tenant}</b> נדחתה.`,
        reasonLabel: 'סיבה:',
        followUp: 'אפשר לשלוח בקשה חדשה בכל עת.',
      }
    : {
        title: 'Request denied',
        intro: `Your request to join <b>${tenant}</b> was denied.`,
        reasonLabel: 'Reason:',
        followUp: 'You can submit a new request at any time.',
      };

  const reasonBlock = reason
    ? `<p style="margin:0 0 18px 0;color:#555;font-size:14px;line-height:1.6;"><b>${copy.reasonLabel}</b> ${reason}</p>`
    : '';

  const inner = `
  <h1 style="margin:0;color:#111;font-size:26px;">${copy.title}</h1>
  <p style="margin:18px 0 12px 0;color:#555;font-size:15px;line-height:1.6;">${copy.intro}</p>
  ${reasonBlock}
  <p style="margin:0;color:#555;font-size:14px;line-height:1.6;">${copy.followUp}</p>`;

  const textParts = [
    isHe
      ? `הבקשה שלך ל-${input.tenantName} נדחתה.`
      : `Your request to join ${input.tenantName} was denied.`,
  ];
  if (input.reason) textParts.push(`${copy.reasonLabel} ${input.reason}`);
  textParts.push(copy.followUp);

  await sendMail({
    to: input.to,
    subject,
    html: renderCardHtml(isHe ? 'he' : 'en', inner),
    text: textParts.join('\n\n'),
    _label: 'JOIN_REQ_DENIED',
  });
}
