import type { Session } from '@supabase/supabase-js';
import { createContext, use } from 'react';

import type { SnapshotStore } from '@ootp/core';

import type { Client } from './supabase.ts';

/**
 * The signed-in session, the Supabase client and the team store, for every screen. The
 * SessionProvider in auth.tsx is the one place that knows how the session is kept; screens
 * read it with useSessionState and never touch Supabase Auth themselves.
 */
export interface SessionState {
  /** Null when the build has no Supabase settings. */
  client: Client | null;
  store: SnapshotStore | null;
  /** Undefined while the stored session is still being read. */
  session: Session | null | undefined;
}

export const SessionContext = createContext<SessionState | null>(null);

export function useSessionState(): SessionState {
  const state = use(SessionContext);
  if (!state) {
    throw new Error('useSessionState needs a SessionProvider above it');
  }
  return state;
}

/** Sign-in and sign-out, each returning a message when it fails. */
export function useAuthActions(client: Client) {
  return {
    async signIn(): Promise<string | null> {
      const { error } = await client.auth.signInWithOAuth({
        provider: 'github',
        options: { redirectTo: window.location.origin },
      });
      return error ? `Sign-in failed: ${error.message}` : null;
    },
    async signOut(): Promise<string | null> {
      const { error } = await client.auth.signOut();
      return error ? `Sign-out failed: ${error.message}` : null;
    },
  };
}
