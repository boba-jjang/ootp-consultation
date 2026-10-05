import { useParams } from 'react-router';

import { Clubhouse } from '../clubhouse/Clubhouse.tsx';
import { Gate } from '../shell/Gate.tsx';
import { useShell } from '../shell/context.ts';
import { moduleById, modulePath } from '../shell/modules.ts';
import styles from '../shell/Shell.module.css';
import { NotBuiltText } from './ComingSoon.tsx';
import { NotFound } from './NotFound.tsx';

/** One module's tab: its screen when it can run, the locked state when it can't. */
export function ModuleScreen() {
  const { tab = '' } = useParams();
  const { team, snapshotId, snapshot } = useShell();
  const module = moduleById(tab);
  if (!module) {
    return <NotFound />;
  }
  if (module.id === 'clubhouse') {
    return <Clubhouse />;
  }
  return (
    <main id="main" className={styles.main}>
      <h1 className={styles.heading}>{module.label}</h1>
      <Gate
        module={module}
        coverage={snapshot.coverage}
        clubhouse={modulePath(team.id, snapshotId, 'clubhouse')}
      >
        <NotBuiltText item="The Clubhouse" />
      </Gate>
    </main>
  );
}
