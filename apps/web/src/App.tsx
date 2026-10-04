import type { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';

import { IMPORTER_VERSION } from '@ootp/core';

import { projectRef, supabase, type Client } from './supabase.ts';
import { Sheet } from './sheet/Sheet.tsx';
import { Teams } from './Teams.tsx';

export function App() {
  // The only pages so far are the start page and the component sheet; routes arrive next.
  const path = window.location.pathname;
  if (path === '/sheet') {
    return <Sheet />;
  }
  return (
    <main>
      <h1>OOTP Consultation</h1>
      {path !== '/' ? (
        <NotFound path={path} />
      ) : supabase ? (
        <AuthGate client={supabase} />
      ) : (
        <p role="alert">
          This build has no Supabase settings. Set VITE_SUPABASE_URL and
          VITE_SUPABASE_PUBLISHABLE_KEY.
        </p>
      )}
      <footer>
        <small>
          Importer v{IMPORTER_VERSION}
          {projectRef ? ` · Database ${projectRef}` : ''}
        </small>
      </footer>
    </main>
  );
}

function NotFound({ path }: { path: string }) {
  return (
    <section>
      <h2>Page not found</h2>
      <p>
        There's nothing at <code>{path}</code>.
      </p>
      <p>
        <a href="/">Go to the start page</a>
      </p>
    </section>
  );
}

function AuthGate({ client }: { client: Client }) {
  // undefined while the stored session is still being read.
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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

  async function signIn() {
    setError(null);
    const { error: signInError } = await client.auth.signInWithOAuth({
      provider: 'github',
      options: { redirectTo: window.location.origin },
    });
    if (signInError) {
      setError(`Sign-in failed: ${signInError.message}`);
    }
  }

  async function signOut() {
    const { error: signOutError } = await client.auth.signOut();
    if (signOutError) {
      setError(`Sign-out failed: ${signOutError.message}`);
    }
  }

  if (session === undefined) {
    return <p>Checking sign-in…</p>;
  }

  if (session === null) {
    return (
      <section>
        <button
          type="button"
          onClick={() => {
            void signIn();
          }}
        >
          Sign in with GitHub
        </button>
        {error && <p role="alert">{error}</p>}
      </section>
    );
  }

  return (
    <section>
      <p>
        Signed in as {session.user.email ?? session.user.id}.{' '}
        <button
          type="button"
          onClick={() => {
            void signOut();
          }}
        >
          Sign out
        </button>
      </p>
      {error && <p role="alert">{error}</p>}
      <Teams client={client} />
    </section>
  );
}
