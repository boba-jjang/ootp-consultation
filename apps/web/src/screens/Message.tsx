import { Link } from 'react-router';

import styles from './Message.module.css';

/** A screen that is one status line, while something loads. */
export function StatusScreen({ children }: { children: string }) {
  return (
    <main id="main" className={styles.main}>
      <p role="status" className={styles.text}>
        {children}
      </p>
    </main>
  );
}

/** A screen for an address that holds nothing of the visitor's. */
export function MissingScreen({ title, to, link }: { title: string; to: string; link: string }) {
  return (
    <main id="main" className={styles.main}>
      <h1 className={styles.title}>{title}</h1>
      <p className={styles.text}>
        Nothing of yours is at this address. It may have been deleted, or the link may be wrong.
      </p>
      <p className={styles.actions}>
        <Link to={to}>{link}</Link>
      </p>
    </main>
  );
}
