/**
 * Google One Tap for logged-out website visitors (2026-07-23 spec).
 * Injects the GIS script once, then shows the One Tap prompt when: auth
 * restore finished, no user, no silent session yet, and a client id is
 * configured. On credential: silent login via AuthContext.oneTapLogin -
 * no navigation, no UI change beyond what the silent flag drives.
 * All failures are silent (console-only): the visitor never asked for
 * anything, so nothing may break the page.
 */
import { useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { isOneTapSilentSession } from '../lib/oneTapSilent';

const GIS_SRC = 'https://accounts.google.com/gsi/client';
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '';

interface GoogleCredentialResponse {
  credential: string;
}

interface GoogleIdApi {
  initialize: (config: {
    client_id: string;
    callback: (response: GoogleCredentialResponse) => void;
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
  }) => void;
  prompt: () => void;
}

declare global {
  interface Window {
    google?: { accounts?: { id?: GoogleIdApi } };
  }
}

/** Loads the GIS script once and resolves with the id API (null on failure). */
function loadGisScript(): Promise<GoogleIdApi | null> {
  return new Promise((resolve) => {
    const existing = window.google?.accounts?.id;
    if (existing) return resolve(existing);
    const scriptId = 'google-gsi-client';
    const done = () => resolve(window.google?.accounts?.id ?? null);
    const current = document.getElementById(scriptId) as HTMLScriptElement | null;
    if (current) {
      current.addEventListener('load', done, { once: true });
      current.addEventListener('error', () => resolve(null), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.id = scriptId;
    script.src = GIS_SRC;
    script.async = true;
    script.onload = done;
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  });
}

/** Mount on a page to offer One Tap to logged-out visitors. */
export function useGoogleOneTap(): void {
  const { user, isLoading, oneTapLogin } = useAuth();
  const promptedRef = useRef(false);

  useEffect(() => {
    if (isLoading || user || promptedRef.current) return;
    if (!CLIENT_ID || isOneTapSilentSession()) return;
    promptedRef.current = true;

    // NOTE: no cleanup/cancellation here on purpose. React StrictMode (dev)
    // runs effects twice: a cancel flag killed run A's pending init while the
    // one-shot promptedRef blocked run B - so initialize() never executed.
    // The ref alone already guarantees a single prompt per mount, and a
    // late prompt after navigation is harmless (the hook is mounted on every
    // One Tap surface and the global guards re-checked on tap).
    void loadGisScript().then((idApi) => {
      if (!idApi) return;
      idApi.initialize({
        client_id: CLIENT_ID,
        callback: (response) => {
          void oneTapLogin(response.credential, window.location.pathname).catch((err) => {
            console.error('[Nexus one-tap] silent login failed', err);
          });
        },
        auto_select: false,
        cancel_on_tap_outside: true,
      });
      idApi.prompt();
    });
  }, [isLoading, user, oneTapLogin]);
}
