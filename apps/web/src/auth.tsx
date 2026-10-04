import type { Session } from '@supabase/supabase-js';
import { useEffect, useEffectEvent, useMemo, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';

import styles from './screens/Message.module.css';
import { SessionContext, useSessionState, type SessionState } from './session.ts';
import { supabaseStore } from './store.ts';
import type { Client } from './supabase.ts';

/**
 * Keeps the session current from Supabase Auth and hands it, with the store, to every screen.
 * onSignOut runs when the session ends, however it ends: the caller drops what it cached for
 * the signed-out user there.
 */
export function SessionProvider({
  client,
  onSignOut,
  children,
}: {
  client: Client | null;
  onSignOut: () => void;
  children: ReactNode;
}) {
  const [session, setSession] = useState<Session | null | undefined>(client ? undefined : null);
  const signedOut = useEffectEvent(onSignOut);

  useEffect(() => {
    if (!client) {
      return;
    }
    void client.auth.getSession().then(({ data }) => {
      setSession(data.session);
    });
    const { data } = client.auth.onAuthStateChange((event, next) => {
      setSession(next);
      if (event === 'SIGNED_OUT') {
        signedOut();
      }
    });
    return () => {
      data.subscription.unsubscribe();
    };
  }, [client]);

  const value = useMemo<SessionState>(
    () => ({ client, store: client ? supabaseStore(client) : null, session }),
    [client, session],
  );
  return <SessionContext value={value}>{children}</SessionContext>;
}

/** Sends a visitor to the sign-in screen, remembering where they were headed. */
export function RequireSession({ children }: { children: ReactNode }) {
  const { client, session } = useSessionState();
  const location = useLocation();
  if (!client) {
    return <Navigate to="/sign-in" replace />;
  }
  if (session === undefined) {
    return <CheckingSignIn />;
  }
  if (session === null) {
    return <Navigate to="/sign-in" replace state={{ from: location.pathname + location.search }} />;
  }
  return children;
}

/** Shown while the stored session is being read. */
export function CheckingSignIn() {
  return (
    <main id="main" className={styles.main}>
      <p role="status" className={styles.text}>
        Checking sign-in…
      </p>
    </main>
  );
}
