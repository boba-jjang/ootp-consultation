import { Link, Navigate, useParams } from 'react-router';

import { useSnapshots } from '../data.ts';
import { modulePath } from '../shell/modules.ts';
import { StatusScreen } from './Message.tsx';
import styles from './Message.module.css';

/** /t/:team goes to the team's latest snapshot. */
export function TeamHome() {
  const { team: teamId = '' } = useParams();
  const snapshots = useSnapshots(teamId);
  if (snapshots.isError) {
    throw snapshots.error;
  }
  if (snapshots.isPending) {
    return <StatusScreen>Loading the team…</StatusScreen>;
  }
  const latest = snapshots.data.at(-1);
  if (latest) {
    return <Navigate to={modulePath(teamId, latest.id, 'clubhouse')} replace />;
  }
  return (
    <main id="main" className={styles.main}>
      <h1 className={styles.title}>No snapshot yet</h1>
      <p className={styles.text}>
        This team has no exports on file, so there is nothing to show. Create a Team from your
        exports arrives with its plan item.
      </p>
      <p className={styles.actions}>
        <Link to="/teams">Go to your teams</Link>
      </p>
    </main>
  );
}
