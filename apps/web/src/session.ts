import type { Session } from '@supabase/supabase-js';
import { createContext, use } from 'react';

import type { SnapshotStore } from '@ootp/core';

import { rememberReturnTo } from './returnTo.ts';
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

/**
 * Sign-in and sign-out, each returning a message when it fails. Sign-in leaves for GitHub and
 * comes back to the app's root, which then goes to returnTo, or to the teams.
 */
export function useAuthActions(client: Client | null) {
  const unconfigured = 'This build has no Supabase settings.';
  return {
    signIn: async (returnTo: string | null): Promise<string | null> => {
      if (!client) {
        return unconfigured;
      }
      rememberReturnTo(returnTo);
      const { error } = await client.auth.signInWithOAuth({
        provider: 'github',
        options: { redirectTo: window.location.origin },
      });
      return error ? `Sign-in failed: ${error.message}` : null;
    },
    signOut: async (): Promise<string | null> => {
      if (!client) {
        return unconfigured;
      }
      const { error } = await client.auth.signOut();
      return error ? `Sign-out failed: ${error.message}` : null;
    },
  };
}
