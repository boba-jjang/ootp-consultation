import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router';

import { useAuthActions, useSessionState } from '../session.ts';
import { AppHeader } from '../ui/AppHeader.tsx';
import { Button } from '../ui/primitives.tsx';
import styles from './SignIn.module.css';

/** The one way in: GitHub, through Supabase Auth. Sign-ups are closed, so only the owner gets through. */
export function SignIn() {
  const { client, session } = useSessionState();
  const location = useLocation();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const from = (location.state as { from?: string } | null)?.from ?? null;

  // Back from GitHub can restore this page from the back-forward cache, button and all.
  useEffect(() => {
    const restore = (event: PageTransitionEvent) => {
      if (event.persisted) {
        setBusy(false);
      }
    };
    window.addEventListener('pageshow', restore);
    return () => {
      window.removeEventListener('pageshow', restore);
    };
  }, []);

  if (session) {
    return <Navigate to={from ?? '/teams'} replace />;
  }

  return (
    <>
      <AppHeader />
      <main id="main" className={styles.main}>
        <section className={styles.panel} aria-labelledby="sign-in-title">
          <h1 id="sign-in-title" className={styles.title}>
            Sign in
          </h1>
          {client ? (
            <>
              <p className={styles.text}>
                Your teams and their snapshots are yours alone. Sign in with GitHub to reach them.
              </p>
              <SignInButton
                client={client}
                returnTo={from}
                busy={busy}
                onStart={() => {
                  setBusy(true);
                  setError(null);
                }}
                onFail={(message) => {
                  setBusy(false);
                  setError(message);
                }}
              />
              {error ? (
                <p className={styles.error} role="alert">
                  {error}
                </p>
              ) : null}
            </>
          ) : (
            <p className={styles.error} role="alert">
              This build has no Supabase settings. Set VITE_SUPABASE_URL and
              VITE_SUPABASE_PUBLISHABLE_KEY, then rebuild.
            </p>
          )}
        </section>
      </main>
    </>
  );
}

function SignInButton({
  client,
  returnTo,
  busy,
  onStart,
  onFail,
}: {
  client: NonNullable<ReturnType<typeof useSessionState>['client']>;
  returnTo: string | null;
  busy: boolean;
  onStart: () => void;
  onFail: (message: string) => void;
}) {
  const { signIn } = useAuthActions(client);
  return (
    <Button
      variant="primary"
      disabled={busy}
      onClick={() => {
        onStart();
        void signIn(returnTo).then((message) => {
          if (message) {
            onFail(message);
          }
        });
      }}
    >
      {busy ? 'Opening GitHub…' : 'Sign in with GitHub'}
    </Button>
  );
}
