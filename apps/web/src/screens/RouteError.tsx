import { useEffect } from 'react';
import { isRouteErrorResponse, Link, useRouteError } from 'react-router';

import { Button } from '../ui/primitives.tsx';
import styles from './Message.module.css';

/** One screen's error boundary: the rest of the app, and the saved data, are untouched. */
export function RouteError() {
  const error: unknown = useRouteError();
  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : String(error);
  useEffect(() => {
    // Vercel's runtime logs don't see the browser, so the console is where details go for now.
    console.error('Screen error', error);
  }, [error]);
  return (
    <main id="main" className={styles.main}>
      <div role="alert" className={styles.notice}>
        <h1 className={styles.title}>This screen hit an error</h1>
        <p className={styles.text}>
          The rest of the app still works, and your saved data is safe. The error was:{' '}
          <code translate="no">{message}</code>
        </p>
      </div>
      <p className={styles.actions}>
        <Button
          variant="primary"
          onClick={() => {
            window.location.reload();
          }}
        >
          Reload the page
        </Button>
        <Link to="/teams">Go to your teams</Link>
      </p>
    </main>
  );
}
