/**
 * Bilingual purchase-confirmation email for a completed wallet voucher
 * purchase. Sent unconditionally once the SUMIT receipt attempt resolves
 * (sent/failed/skipped) - so delivery does not depend on SUMIT's own,
 * unverified SendByEmail flag. The official SUMIT PDF is attached only when
 * that attempt succeeded; otherwise the email still confirms the purchase
 * and points the buyer to the in-app receipt page for the PDF once ready.
 * Reuses the shared sendMail transport + the Nexus auth banner so it matches
 * the wallet's other transactional emails (magic-link, invites).
 */
import { sendMail, buildAuthEmailBannerHtml, type EmailAttachment } from '../email.service';

/** Copy set for one purchase-confirmation email. */
interface PurchaseConfirmationCopy {
  subject: string;
  title: string;
  intro: string;
  itemLabel: string;
  quantityLabel: string;
  totalLabel: string;
  paidAtLabel: string;
  cardLabel: string;
  receiptAttachedNote: string;
  receiptPendingNote: string;
  text: string;
}

/** Whole shekels render without decimals; anything else keeps 2 digits. */
function formatShekels(amount: number): string {
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
}

/**
 * Send the purchase-confirmation email.
 * @param args.receiptPdf the SUMIT PDF bytes, when the receipt was issued successfully
 */
export async function sendPurchaseConfirmationMessage(args: {
  to: string;
  buyerName: string;
  offerTitle: string;
  variantTitle: string;
  quantity: number;
  totalShekels: number;
  cardLast4: string;
  paidAt: Date;
  lang: 'he' | 'en';
  receiptPdf?: Buffer;
}): Promise<void> {
  const isHe = args.lang === 'he';
  const banner = buildAuthEmailBannerHtml();
  const total = `₪${formatShekels(args.totalShekels)}`;
  const paidAtText = args.paidAt.toLocaleDateString(isHe ? 'he-IL' : 'en-IL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const quantitySuffix = args.quantity > 1 ? ` x${args.quantity}` : '';

  const copy: PurchaseConfirmationCopy = isHe
    ? {
        subject: `אישור רכישה - ${args.offerTitle}`,
        title: 'הרכישה שלכם אושרה',
        intro: `תודה על הרכישה! הנה הפרטים:`,
        itemLabel: 'פריט',
        quantityLabel: 'כמות',
        totalLabel: 'סה"כ שולם',
        paidAtLabel: 'תאריך',
        cardLabel: 'אמצעי תשלום',
        receiptAttachedNote: 'הקבלה הרשמית מצורפת למייל זה כקובץ PDF.',
        receiptPendingNote: 'הקבלה הרשמית תישלח בנפרד, וניתן לצפות בה גם באפליקציה תחת פרטי הרכישה.',
        text: `הרכישה שלכם אושרה: ${args.offerTitle}${quantitySuffix} - ${total} (${paidAtText})`,
      }
    : {
        subject: `Purchase confirmed - ${args.offerTitle}`,
        title: 'Your purchase is confirmed',
        intro: 'Thanks for your purchase! Here are the details:',
        itemLabel: 'Item',
        quantityLabel: 'Quantity',
        totalLabel: 'Total paid',
        paidAtLabel: 'Date',
        cardLabel: 'Payment method',
        receiptAttachedNote: 'The official receipt is attached to this email as a PDF.',
        receiptPendingNote: 'The official receipt will follow separately, and is also available in-app on the purchase details page.',
        text: `Your purchase is confirmed: ${args.offerTitle}${quantitySuffix} - ${total} (${paidAtText})`,
      };

  const rows: Array<[string, string]> = [
    [copy.itemLabel, `${args.offerTitle} - ${args.variantTitle}`],
    ...(args.quantity > 1 ? ([[copy.quantityLabel, String(args.quantity)]] as Array<[string, string]>) : []),
    [copy.totalLabel, total],
    [copy.paidAtLabel, paidAtText],
    [copy.cardLabel, `•••• ${args.cardLast4}`],
  ];
  const rowsHtml = rows
    .map(
      ([label, value]) => `<tr>
<td style="padding:8px 0;color:#777;font-size:14px;">${label}</td>
<td style="padding:8px 0;color:#111;font-size:14px;font-weight:600;text-align:${isHe ? 'left' : 'right'};">${value}</td>
</tr>`,
    )
    .join('');

  const receiptNote = args.receiptPdf ? copy.receiptAttachedNote : copy.receiptPendingNote;

  const html = `<!doctype html>
<html lang="${isHe ? 'he' : 'en'}" dir="${isHe ? 'rtl' : 'ltr'}">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f7fb;font-family:Arial,Helvetica,sans-serif;${isHe ? 'direction:rtl;' : ''}">
<table width="100%" cellpadding="0" cellspacing="0">
<tr><td align="center" style="padding:40px 20px;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:white;border-radius:14px;padding:40px;box-shadow:0 10px 30px rgba(0,0,0,0.06);">
<tr><td align="center">
  ${banner}
  <h1 style="margin:0;color:#111;font-size:24px;">${copy.title}</h1>
  <p style="margin:14px 0 0 0;color:#555;font-size:15px;line-height:1.6;">${copy.intro}</p>
</td></tr>
<tr><td style="padding:24px 0 8px 0;">
  <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #eee;">
    ${rowsHtml}
  </table>
</td></tr>
<tr><td align="center">
  <p style="font-size:13px;color:#777;margin:18px 0 0 0;line-height:1.6;">${receiptNote}</p>
</td></tr>
</table>
</td></tr></table>
</body></html>`;

  const attachments: EmailAttachment[] | undefined = args.receiptPdf
    ? [{ filename: 'receipt.pdf', content: args.receiptPdf, contentType: 'application/pdf' }]
    : undefined;

  await sendMail({
    to: args.to,
    toName: args.buyerName,
    subject: copy.subject,
    html,
    text: copy.text,
    ...(attachments && { attachments }),
    _label: 'WALLET_PURCHASE_CONFIRMATION',
  });
}
