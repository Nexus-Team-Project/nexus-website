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
 * Spec: docs/superpowers/specs/2026-05-25-nexus-wallet-auth-design.md sections 9, 10.4
 */
import { sendMail } from '../email.service';

interface AdminNotificationInput {
  to: string;
  tenantName: string;
  requesterEmail: string;
  requesterDisplayName?: string;
  dashboardUrl: string;
  lang?: 'he' | 'en';
}

export async function sendJoinRequestAdminNotification(
  input: AdminNotificationInput,
): Promise<void> {
  const isHe = (input.lang ?? 'he') === 'he';
  const requester = escapeHtml(input.requesterDisplayName ?? input.requesterEmail);
  const tenant = escapeHtml(input.tenantName);
  const ctaUrl = `${input.dashboardUrl.replace(/\/+$/, '')}/users`;
  const subject = isHe ? `בקשת הצטרפות חדשה ל-${input.tenantName}` : `New join request for ${input.tenantName}`;
  const html = isHe
    ? `<div dir="rtl" style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1f2937">
         <p>שלום,</p>
         <p>המשתמש <b>${requester}</b> ביקש להצטרף לארגון <b>${tenant}</b>.</p>
         <p>ניתן לאשר או לדחות את הבקשה מתוך עמוד הצוות בלוח הבקרה.</p>
         <p><a href="${escapeAttr(ctaUrl)}" style="display:inline-block;padding:10px 20px;background:#7c3aed;color:#fff;border-radius:8px;text-decoration:none">פתח את העמוד</a></p>
       </div>`
    : `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1f2937">
         <p>Hi,</p>
         <p><b>${requester}</b> has requested to join <b>${tenant}</b>.</p>
         <p>You can approve or deny this request from the Members page.</p>
         <p><a href="${escapeAttr(ctaUrl)}" style="display:inline-block;padding:10px 20px;background:#7c3aed;color:#fff;border-radius:8px;text-decoration:none">Open Members</a></p>
       </div>`;
  await sendMail({ to: input.to, subject, html, _label: 'JOIN_REQ_ADMIN' });
}

interface DecisionInput {
  to: string;
  tenantName: string;
  decision: 'approved' | 'denied';
  reason?: string;
  walletUrl: string;
  lang?: 'he' | 'en';
}

export async function sendJoinRequestDecision(input: DecisionInput): Promise<void> {
  const isHe = (input.lang ?? 'he') === 'he';
  const tenant = escapeHtml(input.tenantName);
  const reason = input.reason ? escapeHtml(input.reason) : '';
  const walletUrl = input.walletUrl.replace(/\/+$/, '');
  if (input.decision === 'approved') {
    const subject = isHe ? `אושרת ל-${input.tenantName}` : `Approved to join ${input.tenantName}`;
    const html = isHe
      ? `<div dir="rtl" style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1f2937">
           <p>חדשות טובות!</p>
           <p>בקשת ההצטרפות שלך ל-<b>${tenant}</b> אושרה.</p>
           <p><a href="${escapeAttr(walletUrl)}" style="display:inline-block;padding:10px 20px;background:#7c3aed;color:#fff;border-radius:8px;text-decoration:none">פתח את הארנק</a></p>
         </div>`
      : `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1f2937">
           <p>Good news!</p>
           <p>Your request to join <b>${tenant}</b> was approved.</p>
           <p><a href="${escapeAttr(walletUrl)}" style="display:inline-block;padding:10px 20px;background:#7c3aed;color:#fff;border-radius:8px;text-decoration:none">Open Wallet</a></p>
         </div>`;
    await sendMail({ to: input.to, subject, html, _label: 'JOIN_REQ_APPROVED' });
    return;
  }
  const subject = isHe ? `הבקשה ל-${input.tenantName} נדחתה` : `Request to join ${input.tenantName} denied`;
  const html = isHe
    ? `<div dir="rtl" style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1f2937">
         <p>שלום,</p>
         <p>הבקשה שלך להצטרף ל-<b>${tenant}</b> נדחתה.</p>
         ${reason ? `<p>סיבה: ${reason}</p>` : ''}
         <p>אפשר לשלוח בקשה חדשה בכל עת.</p>
       </div>`
    : `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1f2937">
         <p>Hi,</p>
         <p>Your request to join <b>${tenant}</b> was denied.</p>
         ${reason ? `<p>Reason: ${reason}</p>` : ''}
         <p>You can submit a new request at any time.</p>
       </div>`;
  await sendMail({ to: input.to, subject, html, _label: 'JOIN_REQ_DENIED' });
}

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
function escapeAttr(s: string): string {
  return escapeHtml(s);
}
