import { useContext } from 'react';
import { api } from '../lib/api';
import { getVisitorId } from '../lib/visitorId';
import { AuthContext } from '../contexts/AuthContext';
import type { EventChannel } from '../lib/analyticsEvents';

// ─── Context builder ──────────────────────────────────────

function buildContext() {
  const params = new URLSearchParams(window.location.search);
  const ua = navigator.userAgent;

  // Simple device/browser detection from UA string
  const isMobile = /Mobi|Android/i.test(ua);
  const isTablet = /Tablet|iPad/i.test(ua);
  const browser = /Firefox/i.test(ua)
    ? 'Firefox'
    : /Edg/i.test(ua)
      ? 'Edge'
      : /Chrome/i.test(ua)
        ? 'Chrome'
        : /Safari/i.test(ua)
          ? 'Safari'
          : 'Other';

  return {
    userAgent: ua,
    device: {
      type: isMobile ? 'mobile' : isTablet ? 'tablet' : 'desktop',
      browser,
      os: /Windows/i.test(ua)
        ? 'Windows'
        : /Mac/i.test(ua)
          ? 'macOS'
          : /Linux/i.test(ua)
            ? 'Linux'
            : /Android/i.test(ua)
              ? 'Android'
              : /iOS|iPhone|iPad/i.test(ua)
                ? 'iOS'
                : 'Other',
    },
    locale: navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    page: {
      path: window.location.pathname,
      title: document.title,
      url: window.location.href,
      referrer: document.referrer || undefined,
    },
    campaign: {
      utm_source:   params.get('utm_source')   ?? undefined,
      utm_medium:   params.get('utm_medium')   ?? undefined,
      utm_campaign: params.get('utm_campaign') ?? undefined,
      utm_content:  params.get('utm_content')  ?? undefined,
      utm_term:     params.get('utm_term')     ?? undefined,
    },
  };
}

// ─── Hook ─────────────────────────────────────────────────

export function useAnalytics() {
  // Read auth context without throwing — analytics works even outside AuthProvider
  const authCtx = useContext(AuthContext);
  const userId = authCtx?.user?.id;

  /**
   * Track any event.
   * Fire-and-forget — errors are silently swallowed.
   */
  const track = (
    eventName: string,
    channel: EventChannel,
    properties: Record<string, unknown> = {},
  ): void => {
    void api
      .post('/api/analytics/track', {
        anonymousId: getVisitorId(),
        userId,
        eventName,
        channel,
        properties,
        context: buildContext(),
        sentAt: new Date().toISOString(),
      })
      .catch(() => {});
  };

  /**
   * Shorthand for Page_Viewed events.
   * Defaults to the current pathname.
   */
  const page = (
    channel: EventChannel = 'MARKETING',
    overridePath?: string,
  ): void => {
    track('Page_Viewed', channel, {
      page_path: overridePath ?? window.location.pathname,
      page_title: document.title,
    });
  };

  /**
   * Merge anonymous ID into authenticated user — call immediately after login/signup.
   * Passes both anonymousId and userId so the backend can backfill EventLog rows.
   */
  const identify = (
    authenticatedUserId: string,
    mergeSource: 'signup' | 'login' | 'oauth',
  ): void => {
    void api
      .post('/api/analytics/track', {
        anonymousId: getVisitorId(),
        userId: authenticatedUserId,
        eventName: mergeSource === 'signup' ? 'User_Signed_Up' : 'User_Logged_In',
        channel: 'PRODUCT',
        properties: { method: mergeSource },
        context: buildContext(),
        sentAt: new Date().toISOString(),
        mergeSource,
      })
      .catch(() => {});
  };

  return { track, page, identify };
}
