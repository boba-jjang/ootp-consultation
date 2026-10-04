import { Link } from 'react-router';

import styles from './Message.module.css';

/** A route that exists before its screen does: it says which plan item brings the screen. */
export function ComingSoon({ screen, item }: { screen: string; item: string }) {
  return (
    <main id="main" className={styles.main}>
      <h1 className={styles.title}>{screen}</h1>
      <p className={styles.text}>
        This screen isn't built yet. It arrives with the plan item “{item}” in Phase 3.
      </p>
      <p className={styles.actions}>
        <Link to="/teams">Go to your teams</Link>
      </p>
    </main>
  );
}
