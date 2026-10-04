import { NavLink } from 'react-router';

import { classes } from '../ui/classes.ts';
import { LockIcon } from '../ui/icons.tsx';
import { MODULES, modulePath, type ModuleId } from './modules.ts';
import styles from './Shell.module.css';

/** The module tabs. A locked tab stays in reach: its screen shows what unlocks it. */
export function Tabs({
  teamId,
  snapshotId,
  locks,
}: {
  teamId: string;
  snapshotId: string;
  locks: Partial<Record<ModuleId, boolean>>;
}) {
  return (
    <nav aria-label="Modules" className={styles.tabs}>
      <ul className={styles.tabList}>
        {MODULES.map((module) => (
          <li key={module.id}>
            <NavLink
              to={modulePath(teamId, snapshotId, module.id)}
              className={({ isActive }) =>
                classes(
                  styles.tab,
                  isActive && styles.tabActive,
                  locks[module.id] && styles.tabLocked,
                )
              }
            >
              {module.label}
              {locks[module.id] ? (
                <>
                  <LockIcon className={styles.tabLock} />
                  <span className="sr-only"> (locked)</span>
                </>
              ) : null}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
