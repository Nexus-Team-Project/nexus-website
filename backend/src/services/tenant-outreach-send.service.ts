/**
 * Delivery side of service outreach: sends one claimed job item over its
 * channels (InforU SMS and/or the branded outreach email), records the
 * per-channel outcome on the item, and stamps the contact's
 * serviceInvites.<serviceKey> map when at least one channel was delivered.
 * The short link is created/reused per (tenant, service) via
 * short-link.service (marketing traffic - the InforU OTP no-shortener rule
 * does not apply here).
 */
import { getMongoDb } from '../config/mongo';
import { getTenantDomainCollections } from '../models/domain';
import { getInviteJobCollections, type ServiceOutreachJobItem } from '../models/domain/invite-jobs.models';
import { buildMemberInviteWalletUrl } from './domain-member-invite-email.service';
import { sendServiceOutreachEmail } from './email/service-outreach-email.service';
import { inforuSendSms } from './sms/inforu.client';
import { getOrCreateShortLink } from './short-link.service';

/**
 * Builds the short bilingual outreach SMS text.
 * Input: tenant display name, absolute short URL, language.
 * Output: one-line SMS body.
 */
export function buildOutreachSmsText(
  tenantName: string,
  shortUrl: string,
  language: 'he' | 'en',
): string {
  return language === 'he'
    ? `${tenantName} מזמין אותך להצטרף ל-Nexus Wallet: ${shortUrl}`
    : `${tenantName} invites you to join Nexus Wallet: ${shortUrl}`;
}

/**
 * Delivers one service_outreach item end-to-end.
 * Input: the claimed job item (identifiers already filtered by channel at
 * enqueue time). Output: none.
 * Side effects: writes sentChannels/channelErrors on the item; stamps the
 * contact when >= 1 channel delivered.
 * Throws: the first channel error when EVERY attempted channel failed, so
 * the caller records the failure and the queue retries with backoff.
 */
export async function deliverOutreachItem(item: ServiceOutreachJobItem): Promise<void> {
  // ponytail: the short link target is built from the enqueue language; the
  // link is idempotent per (tenant, service) so the first run's language wins.
  // The wallet resolves display language client-side, so this is cosmetic.
  const targetUrl = buildMemberInviteWalletUrl(item.tenantId, item.language);
  const shortUrl = await getOrCreateShortLink(item.tenantId, item.serviceKey, targetUrl);

  const sentChannels: ('sms' | 'email')[] = [];
  const channelErrors: { sms?: string; email?: string } = {};

  if ((item.channel === 'sms' || item.channel === 'both') && item.phone) {
    try {
      await inforuSendSms({
        phone: item.phone,
        message: buildOutreachSmsText(item.tenantName, shortUrl, item.language),
      });
      sentChannels.push('sms');
    } catch (error) {
      channelErrors.sms = error instanceof Error ? error.message : 'sms_failed';
    }
  }

  if ((item.channel === 'email' || item.channel === 'both') && item.email) {
    try {
      await sendServiceOutreachEmail({
        to: item.email,
        tenantName: item.tenantName,
        ctaUrl: shortUrl,
        language: item.language,
      });
      sentChannels.push('email');
    } catch (error) {
      channelErrors.email = error instanceof Error ? error.message : 'email_failed';
    }
  }

  const db = await getMongoDb();
  const now = new Date();
  // Per-channel outcome lands on the item regardless of overall success so
  // partial failures ("both" with one dead channel) stay diagnosable.
  await getInviteJobCollections(db).memberInviteJobItems.updateOne(
    { jobItemId: item.jobItemId },
    { $set: { sentChannels, channelErrors, updatedAt: now } },
  );

  if (sentChannels.length === 0) {
    throw new Error(channelErrors.sms ?? channelErrors.email ?? 'outreach_send_failed');
  }

  // Stamp the contact only on success (>= 1 channel delivered) - this is what
  // excludes them from the next run and drives the dashboard "invited" badge.
  await getTenantDomainCollections(db).tenantContacts.updateOne(
    { tenantId: item.tenantId, tenantContactId: item.contactId },
    {
      $set: {
        [`serviceInvites.${item.serviceKey}`]: { lastSentAt: now, channels: sentChannels },
        updatedAt: now,
      },
    },
  );
}
