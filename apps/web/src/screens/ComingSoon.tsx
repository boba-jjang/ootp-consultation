import { Link } from 'react-router';

import styles from './Message.module.css';

/** A route that exists before its screen does: it says which plan item brings the screen. */
export function ComingSoon({ screen, item }: { screen: string; item: string }) {
  return (
    <main id="main" className={styles.main}>
      <h1 className={styles.title}>{screen}</h1>
      <NotBuiltText item={item} />
      <p className={styles.actions}>
        <Link to="/teams">Go to your teams</Link>
      </p>
    </main>
  );
}

/** The sentence a screen shows before it's built. */
export function NotBuiltText({ item }: { item: string }) {
  return (
    <p className={styles.text}>
      This screen isn't built yet. It arrives with the plan item “{item}” in Phase 3.
    </p>
  );
}
