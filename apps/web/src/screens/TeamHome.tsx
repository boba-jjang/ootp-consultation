import type { TeamRow, Upload } from '@ootp/core';
import { useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router';

import type { ClubhouseState } from '../clubhouse/Clubhouse.tsx';
import { useAddExports, useSnapshots, useTeams } from '../data.ts';
import { DropZone } from '../setup/pieces.tsx';
import setupStyles from '../setup/Setup.module.css';
import { modulePath } from '../shell/modules.ts';
import { AppHeader } from '../ui/AppHeader.tsx';
import { MissingScreen, StatusScreen } from './Message.tsx';

/** /t/:team goes to the team's latest snapshot, or takes the first upload when it has none. */
export function TeamHome() {
  const { team: teamId = '' } = useParams();
  const teams = useTeams();
  const snapshots = useSnapshots(teamId);
  // While the first upload runs, the snapshot it creates arrives in the list before the upload
  // returns. The upload opens it, with its results, so this screen waits instead of redirecting.
  const [uploading, setUploading] = useState(false);
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
  const latest = snapshots.data.at(-1);
  if (latest && !uploading) {
    return <Navigate to={modulePath(team.id, latest.id, 'clubhouse')} replace />;
  }
  return <FirstUpload team={team} busy={uploading} onBusy={setUploading} />;
}

/** A team created without files: its first exports make its first snapshot. */
function FirstUpload({
  team,
  busy,
  onBusy,
}: {
  team: TeamRow;
  busy: boolean;
  onBusy: (busy: boolean) => void;
}) {
  const navigate = useNavigate();
  const add = useAddExports();
  const [error, setError] = useState<string | null>(null);

  const onFiles = (files: Promise<Upload[]>) => {
    onBusy(true);
    setError(null);
    const fail = (message: string) => {
      setError(message);
      onBusy(false);
    };
    files
      .then(async (uploads) => {
        if (uploads.length === 0) {
          fail('No CSV file was among those. OOTP exports are .csv files.');
          return;
        }
        const result = await add.mutateAsync({
          teamId: team.id,
          uploads,
          scale: team.rating_scale,
        });
        if (!result.ok) {
          fail(result.message);
          return;
        }
        const state: ClubhouseState = { results: { result, from: null } };
        // In place of this page, which stays busy until it's gone: clearing busy here would
        // let its own redirect to the new snapshot run first, without the results.
        void navigate(modulePath(team.id, result.snapshot.id, 'clubhouse'), {
          replace: true,
          state,
        });
      })
      .catch((failure: unknown) => {
        fail(failure instanceof Error ? failure.message : String(failure));
      });
  };

  return (
    <>
      <AppHeader>
        <Link to={`/t/${team.id}/settings`}>Team settings</Link>
      </AppHeader>
      <main id="main" className={setupStyles.main}>
        <div className={setupStyles.intro}>
          <h1 className={setupStyles.title}>No snapshot yet</h1>
          <p className={setupStyles.lead}>
            The {team.name} have no exports on file. Add them here: a hitter stats view
            (batting_stats_1 or batting_stats_2) dates the first snapshot.
          </p>
        </div>
        <DropZone
          size="large"
          busy={busy}
          onFiles={onFiles}
          title="Drop this team's OOTP exports here"
        />
        {error ? (
          <p className={setupStyles.error} role="alert">
            {error}
          </p>
        ) : null}
        <p className={setupStyles.muted}>
          <Link to="/teams">Go to your teams</Link>
        </p>
      </main>
    </>
  );
}
