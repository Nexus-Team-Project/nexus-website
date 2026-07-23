/**
 * Reactive read of the One Tap silent-session flag: re-renders the consumer
 * the moment the flag is set (credential received) or cleared (explicit auth
 * entry / logout), so the Navbar and Hero update INSTANTLY - before the
 * silent login's network round-trips finish.
 */
import { useSyncExternalStore } from 'react';
import { subscribeOneTapSilent, isOneTapSilentSession } from '../lib/oneTapSilent';

/** True while the One Tap silent flag is set. */
export function useOneTapSilentFlag(): boolean {
  return useSyncExternalStore(subscribeOneTapSilent, isOneTapSilentSession);
}
