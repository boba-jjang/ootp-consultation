import { useState } from 'react';
import { Link } from 'react-router';

import { useLatestSnapshots, useTeams } from '../data.ts';
import { useAuthActions, useSessionState } from '../session.ts';
import styles from '../setup/Setup.module.css';
import { AppHeader } from '../ui/AppHeader.tsx';
import { buttonClass } from '../ui/classes.ts';
import { Button, LeagueTag } from '../ui/primitives.tsx';

/** The Team menu board as a screen: your teams, each with its latest snapshot, and the way to a new one. */
export function TeamsScreen() {
  const { client } = useSessionState();
  const { signOut } = useAuthActions(client);
  const teams = useTeams();
  const latest = useLatestSnapshots();
  const [signOutError, setSignOutError] = useState<string | null>(null);
  if (teams.isError) {
    throw teams.error;
  }
  return (
    <>
      <AppHeader>
        <Button
          variant="link"
          onClick={() => {
            void signOut().then(setSignOutError);
          }}
        >
          Sign out
        </Button>
      </AppHeader>
      <main id="main" className={styles.main}>
        <div className={styles.intro}>
          <h1 className={styles.title}>Your teams</h1>
          <p className={styles.lead}>
            Each team keeps its own snapshots. Open one, or create a team from your OOTP exports.
          </p>
        </div>
        {signOutError ? (
          <p className={styles.error} role="alert">
            {signOutError}
          </p>
        ) : null}
        {teams.isPending ? (
          <p role="status" className={styles.muted}>
            Loading teams…
          </p>
        ) : teams.data.length === 0 ? (
          <p className={styles.muted}>No teams yet.</p>
        ) : (
          <ul className={styles.teamList}>
            {teams.data.map((team) => {
              const snapshot = latest.data?.get(team.id);
              return (
                <li key={team.id} className={styles.team}>
                  <Link to={`/t/${team.id}`} className={styles.teamLink}>
                    <span className={styles.teamName}>{team.name}</span>
                    <LeagueTag>{team.league}</LeagueTag>
                  </Link>
                  <span className={styles.muted}>
                    {snapshot ? `Latest: ${snapshot.label}` : 'No snapshot yet'}
                  </span>
                  <Link to={`/t/${team.id}/settings`} className={styles.teamSettings}>
                    Team settings
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        <div className={styles.actions}>
          <Link to="/teams/new" className={buttonClass('primary')}>
            Create a team
          </Link>
        </div>
      </main>
    </>
  );
}
