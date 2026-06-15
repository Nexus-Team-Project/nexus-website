/**
 * Shows an invitation notice on the login and signup screens when the visitor
 * arrived from a tenant invite email. It tells them which organization invited
 * them and that they must authenticate to accept, reusing the existing notice
 * box styling so no new design language is introduced.
 */
import type { InvitePreview } from '../hooks/useInvitePreview';

/** Which auth screen renders the banner; only changes the pending call-to-action. */
type InviteBannerMode = 'login' | 'signup';

interface InviteBannerProps {
  loading: boolean;
  preview: InvitePreview | null;
  isHe: boolean;
  mode: InviteBannerMode;
}

/** Per-status colour classes; keeps the look aligned with the existing notice box. */
const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-indigo-50 border-indigo-200 text-indigo-900',
  accepted: 'bg-green-50 border-green-200 text-green-800',
  expired: 'bg-amber-50 border-amber-200 text-amber-800',
  revoked: 'bg-red-50 border-red-200 text-red-800',
};

/**
 * Builds the message template for a given status and mode.
 * Input: invite status, auth-screen mode, and the Hebrew flag.
 * Output: a string with a `{org}` placeholder marking where the bold org name goes.
 */
function getMessageTemplate(status: string, mode: InviteBannerMode, isHe: boolean): string {
  if (status === 'expired') {
    return isHe
      ? 'ההזמנה להצטרף אל {org} פגה. בקשו מהארגון הזמנה חדשה.'
      : 'Your invitation to join {org} has expired. Ask the organization for a new one.';
  }
  if (status === 'revoked') {
    return isHe ? 'הזמנה זו אינה בתוקף עוד.' : 'This invitation is no longer valid.';
  }
  if (status === 'accepted') {
    return isHe
      ? 'כבר אישרתם את ההזמנה אל {org}. התחברו כדי להמשיך.'
      : 'You have already accepted the invitation to {org}. Sign in to continue.';
  }
  // pending
  if (mode === 'signup') {
    return isHe
      ? 'הוזמנתם להצטרף אל {org}. צרו חשבון כדי לאשר את ההזמנה.'
      : 'You have been invited to join {org}. Create your account to accept the invitation.';
  }
  return isHe
    ? 'הוזמנתם להצטרף אל {org}. התחברו כדי לאשר את ההזמנה.'
    : 'You have been invited to join {org}. Log in to accept the invitation.';
}

/**
 * Renders the message with the organization name in bold.
 * Input: the `{org}`-templated message and the organization name.
 * Output: React nodes with the org name wrapped in a <strong> element.
 */
function renderMessage(template: string, orgName: string) {
  const parts = template.split('{org}');
  if (parts.length === 1) return template;
  return (
    <>
      {parts[0]}
      <strong className="font-semibold">{orgName}</strong>
      {parts[1]}
    </>
  );
}

/**
 * Invitation banner for the auth screens.
 * Input: loading flag, invite preview (or null), Hebrew flag, and screen mode.
 * Output: a skeleton while loading, the status notice when a preview exists,
 * or nothing when there is no invite to show.
 */
export default function InviteBanner({ loading, preview, isHe, mode }: InviteBannerProps) {
  if (loading) {
    return (
      <div
        className="mb-4 h-12 rounded-lg bg-slate-100 animate-pulse"
        aria-hidden="true"
      />
    );
  }

  if (!preview) return null;

  const styles = STATUS_STYLES[preview.status] ?? STATUS_STYLES.pending;
  const template = getMessageTemplate(preview.status, mode, isHe);

  return (
    <div
      role="status"
      className={`mb-4 flex items-start gap-2 p-3 border rounded-lg text-sm ${styles}`}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="mt-0.5 shrink-0"
        aria-hidden="true"
      >
        <rect x="2" y="4" width="20" height="16" rx="2" />
        <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
      </svg>
      <span className="leading-relaxed">{renderMessage(template, preview.tenantName)}</span>
    </div>
  );
}
