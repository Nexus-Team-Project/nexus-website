/**
 * Reads a pending tenant-member invitation preview from a `dashboardRedirect`
 * value so the login and signup screens can tell the visitor they were invited
 * to a specific organization before they authenticate.
 *
 * The preview endpoint (`GET /api/v1/member-invitations/:token`) is public and
 * rate-limited; it returns only display-safe fields (no token hash).
 */
import { useEffect, useState } from 'react';
import { api } from '../lib/api';

/** Path prefix the invite email always uses inside `dashboardRedirect`. */
const INVITE_REDIRECT_PREFIX = '/member-invite/accept';

/**
 * Display-safe invitation preview returned by the public lookup endpoint.
 * Mirrors the backend `TenantMemberInvitationPreview` shape (display fields only).
 */
export interface InvitePreview {
  tenantName: string;
  invitedEmail: string;
  status: 'pending' | 'accepted' | 'expired' | 'revoked' | string;
  expiresAt: string;
}

/** Result of the hook: loading flag plus the preview (null when none/failed). */
export interface UseInvitePreviewResult {
  loading: boolean;
  preview: InvitePreview | null;
}

/**
 * Extracts the raw invite token from a `dashboardRedirect` query value.
 * Input: the `dashboardRedirect` string (or null) read from the page URL.
 * Output: the token when the redirect targets the invite-accept path, else null.
 */
function extractInviteToken(dashboardRedirect: string | null): string | null {
  if (!dashboardRedirect || !dashboardRedirect.startsWith(INVITE_REDIRECT_PREFIX)) {
    return null;
  }
  const queryStart = dashboardRedirect.indexOf('?');
  if (queryStart === -1) return null;
  const token = new URLSearchParams(dashboardRedirect.slice(queryStart + 1)).get('token');
  return token && token.trim() !== '' ? token : null;
}

/**
 * Fetches the invitation preview for an invite-carrying `dashboardRedirect`.
 * Input: the `dashboardRedirect` string (or null) from the auth page URL.
 * Output: `{ loading, preview }`. No token, or any fetch failure, yields a null
 * preview so the auth page renders exactly as it would without an invite.
 */
export function useInvitePreview(dashboardRedirect: string | null): UseInvitePreviewResult {
  const token = extractInviteToken(dashboardRedirect);
  // Start in the loading state only when there is a token to resolve. State is
  // set exclusively from the async callbacks below, never synchronously in the
  // effect body, so no cascading render is triggered.
  const [state, setState] = useState<UseInvitePreviewResult>(() => ({
    loading: token !== null,
    preview: null,
  }));

  useEffect(() => {
    if (!token) return;

    let active = true;

    api
      .get<InvitePreview>(`/api/v1/member-invitations/${encodeURIComponent(token)}`)
      .then((result) => {
        if (active) setState({ loading: false, preview: result });
      })
      .catch(() => {
        // Invalid/expired-lookup or network error: stay silent, link still works.
        if (active) setState({ loading: false, preview: null });
      });

    return () => {
      active = false;
    };
  }, [token]);

  return state;
}
