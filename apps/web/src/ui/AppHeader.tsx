import type { ReactNode } from 'react';

import { DiamondMark } from './icons.tsx';
import styles from './AppHeader.module.css';

/** The header of the screens outside a team: the brand, and whatever a screen adds. */
export function AppHeader({ children }: { children?: ReactNode }) {
  return (
    <header className={styles.header}>
      <span className={styles.brand} translate="no">
        <DiamondMark className={styles.mark} />
        Front Office Command Center
      </span>
      {children}
    </header>
  );
}
