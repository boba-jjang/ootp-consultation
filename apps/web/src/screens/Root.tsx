import { Outlet } from 'react-router';

import { IMPORTER_VERSION } from '@ootp/core';

import { projectRef } from '../supabase.ts';
import styles from './Root.module.css';

/** Everything every screen shares: the skip link, the screen itself and the build footer. */
export function Root() {
  return (
    <div className={styles.root}>
      <a className="skip-link" href="#main">
        Skip to main content
      </a>
      <Outlet />
      <footer className={styles.footer}>
        <small>
          Importer v{IMPORTER_VERSION}
          {projectRef ? ` · Database ${projectRef}` : ''}
        </small>
      </footer>
    </div>
  );
}
