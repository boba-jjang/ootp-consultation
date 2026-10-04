import { Link, useLocation } from 'react-router';

import styles from './Message.module.css';

export function NotFound() {
  const { pathname } = useLocation();
  return (
    <main id="main" className={styles.main}>
      <h1 className={styles.title}>Page not found</h1>
      <p className={styles.text}>
        There's nothing at <code>{pathname}</code>.
      </p>
      <p className={styles.actions}>
        <Link to="/teams">Go to your teams</Link>
      </p>
    </main>
  );
}
