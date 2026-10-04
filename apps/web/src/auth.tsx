import type { Session } from '@supabase/supabase-js';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';

import { SessionContext, useSessionState, type SessionState } from './session.ts';
import { supabaseStore } from './store.ts';
import type { Client } from './supabase.ts';

/** Keeps the session current from Supabase Auth and hands it, with the store, to every screen. */
export function SessionProvider({
  client,
  children,
}: {
  client: Client | null;
  children: ReactNode;
}) {
  const [session, setSession] = useState<Session | null | undefined>(client ? undefined : null);

  useEffect(() => {
    if (!client) {
      return;
    }
    void client.auth.getSession().then(({ data }) => {
      setSession(data.session);
    });
    const { data } = client.auth.onAuthStateChange((_event, next) => {
      setSession(next);
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

/** Sends a visitor to the sign-in screen and brings them back afterwards. */
export function RequireSession({ children }: { children: ReactNode }) {
  const { client, session } = useSessionState();
  const location = useLocation();
  if (!client) {
    return <Navigate to="/sign-in" replace />;
  }
  if (session === undefined) {
    return (
      <p role="status" style={{ padding: 'var(--gutter)' }}>
        Checking sign-in…
      </p>
    );
  }
  if (session === null) {
    return <Navigate to="/sign-in" replace state={{ from: location.pathname }} />;
  }
  return children;
}
