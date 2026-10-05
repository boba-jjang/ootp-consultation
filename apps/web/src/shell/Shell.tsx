import { useState } from 'react';
import { Outlet, useMatch, useParams } from 'react-router';

import type { StoredSnapshot, TeamRow } from '@ootp/core';

import { useSnapshot, useSnapshots, useTeams } from '../data.ts';
import { MissingScreen, StatusScreen } from '../screens/Message.tsx';
import { useAuthActions, useSessionState } from '../session.ts';
import { ShellContext } from './context.ts';
import { lockedModules, moduleById, type ModuleId } from './modules.ts';
import styles from './Shell.module.css';
import { Tabs } from './Tabs.tsx';
import { TopBar } from './TopBar.tsx';

/**
 * The app shell at /t/:team/s/:snapshot: the top bar, the module tabs and, once the snapshot
 * is read, the module screen. A screen's own error boundary keeps the shell up around it.
 */
export function Shell() {
  const { team: teamId = '', snapshot: snapshotId = '' } = useParams();
  const teams = useTeams();
  const snapshots = useSnapshots(teamId);
  if (teams.isError) {
    throw teams.error;
  }
  if (snapshots.isError) {
    throw snapshots.error;
  }
  if (teams.isPending || snapshots.isPending) {
    return <StatusScreen>Loading the team…</StatusScreen>;
  }
  const team = teams.data.find((candidate) => candidate.id === teamId);
  if (!team) {
    return <MissingScreen title="Team not found" to="/teams" link="Go to your teams" />;
  }
  if (!snapshots.data.some((snapshot) => snapshot.id === snapshotId)) {
    return (
      <MissingScreen title="Snapshot not found" to={`/t/${team.id}`} link="Go to the latest" />
    );
  }
  return (
    <SnapshotShell
      team={team}
      teams={teams.data}
      snapshots={snapshots.data}
      snapshotId={snapshotId}
    />
  );
}

function SnapshotShell({
  team,
  teams,
  snapshots,
  snapshotId,
}: {
  team: TeamRow;
  teams: TeamRow[];
  snapshots: StoredSnapshot[];
  snapshotId: string;
}) {
  const { client } = useSessionState();
  const { signOut } = useAuthActions(client);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const snapshot = useSnapshot(snapshotId, team.rating_scale);
  const match = useMatch('/t/:team/s/:snapshot/:tab');
  const tab: ModuleId =
    match?.params.tab && moduleById(match.params.tab)
      ? (match.params.tab as ModuleId)
      : 'clubhouse';
  if (snapshot.isError) {
    throw snapshot.error;
  }
  const coverage = snapshot.data?.coverage ?? null;
  return (
    <>
      <TopBar
        team={team}
        teams={teams}
        dh={team.dh_enabled}
        snapshots={snapshots}
        current={snapshotId}
        tab={tab}
        coverage={coverage?.level ?? null}
        advisor="offline"
        onSignOut={() => {
          void signOut().then(setSignOutError);
        }}
      />
      <Tabs
        teamId={team.id}
        snapshotId={snapshotId}
        locks={coverage ? lockedModules(coverage) : {}}
      />
      {signOutError ? (
        <p className={styles.alert} role="alert">
          {signOutError}
        </p>
      ) : null}
      {snapshot.data ? (
        <ShellContext value={{ team, snapshots, snapshotId, snapshot: snapshot.data }}>
          <Outlet />
        </ShellContext>
      ) : (
        <StatusScreen>Reading the snapshot…</StatusScreen>
      )}
    </>
  );
}
