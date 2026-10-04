import { useEffect, useState } from 'react';
import { Navigate } from 'react-router';

import { CheckingSignIn } from '../auth.tsx';
import { forgetReturnTo, readReturnTo } from '../returnTo.ts';
import { useSessionState } from '../session.ts';

/**
 * Where the app starts, and where GitHub sends the browser back after sign-in. Supabase Auth
 * reads the sign-in code from this URL once it holds its lock, so nothing here may rewrite the
 * URL before the session is known. The destination is decided once, the first time it is: the
 * sign-in events that follow must not send the visitor somewhere else.
 */
export function Home() {
  const { session } = useSessionState();
  const [target, setTarget] = useState<string | null>(null);
  if (target === null && session !== undefined) {
    setTarget(session ? (readReturnTo() ?? '/teams') : '/sign-in');
  }
  useEffect(() => {
    if (target !== null) {
      forgetReturnTo();
    }
  }, [target]);
  return target === null ? <CheckingSignIn /> : <Navigate to={target} replace />;
}
