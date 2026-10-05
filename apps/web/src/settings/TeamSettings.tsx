import {
  parseTeamSettings,
  readTeamExport,
  settingsOf,
  type TeamExport,
  type TeamRow,
} from '@ootp/core';
import { useRef, useState, type SubmitEvent } from 'react';
import { Link, useParams } from 'react-router';

import { useExportTeam, useRestoreTeam, useTeams, useUpdateTeam } from '../data.ts';
import { MissingScreen, StatusScreen } from '../screens/Message.tsx';
import { focusFirstError, fromForm, toForm, type FieldErrors } from '../setup/form.ts';
import setupStyles from '../setup/Setup.module.css';
import { TeamSettingsForm } from '../setup/TeamSettingsForm.tsx';
import { AppHeader } from '../ui/AppHeader.tsx';
import { Button } from '../ui/primitives.tsx';
import { ExportPanel, RestorePanel, type RestorePreview } from './pieces.tsx';
import styles from './Settings.module.css';
import { describeRestore, exportFileName, exportPreview, restoreSummary } from './summary.ts';

/** /t/:team/settings: the team's settings, its backup and the restore. */
export function TeamSettingsScreen() {
  const { team: teamId = '' } = useParams();
  const teams = useTeams();
  if (teams.isError) {
    throw teams.error;
  }
  if (teams.isPending) {
    return <StatusScreen>Loading the team…</StatusScreen>;
  }
  const team = teams.data.find((candidate) => candidate.id === teamId);
  if (!team) {
    return <MissingScreen title="Team not found" to="/teams" link="Go to your teams" />;
  }
  return <TeamSettings key={team.id} team={team} />;
}

function TeamSettings({ team }: { team: TeamRow }) {
  const update = useUpdateTeam();
  const exporter = useExportTeam();
  const restore = useRestoreTeam();
  const [form, setForm] = useState(() => toForm(team));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saved, setSaved] = useState(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [zip, setZip] = useState<{ preview: RestorePreview; value: TeamExport } | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [restoreStatus, setRestoreStatus] = useState<string | null>(null);
  // Only the last chosen zip counts: a slow read of an earlier one must not land after it.
  const reading = useRef(0);

  const save = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaved(false);
    const parsed = parseTeamSettings(fromForm(form));
    if (!parsed.ok) {
      setErrors(parsed.errors);
      focusFirstError(event.currentTarget, parsed.errors);
      return;
    }
    setErrors({});
    update.mutate(
      { id: team.id, settings: parsed.value },
      {
        onSuccess: (row) => {
          setForm(toForm(row));
          setSaved(true);
        },
      },
    );
  };

  const exportZip = () => {
    setExportStatus(null);
    exporter.mutate(
      { teamId: team.id, settings: settingsOf(team) },
      {
        onSuccess: (bytes) => {
          const name = exportFileName(team.name, new Date());
          download(bytes, name);
          setExportStatus(`Your download started: ${name}.`);
        },
      },
    );
  };

  const chooseZip = (file: File) => {
    setRestoreStatus(null);
    setReadError(null);
    const attempt = (reading.current += 1);
    file
      .arrayBuffer()
      .then((buffer) => {
        if (attempt !== reading.current) {
          return;
        }
        const result = readTeamExport(new Uint8Array(buffer));
        if (!result.ok) {
          setZip(null);
          setReadError(result.message);
          return;
        }
        const counts = exportPreview(result.value);
        setZip({
          value: result.value,
          preview: {
            fileName: file.name,
            team: { name: result.value.team.name, league: result.value.team.league },
            ...counts,
          },
        });
      })
      .catch((failure: unknown) => {
        if (attempt === reading.current) {
          setZip(null);
          setReadError(failure instanceof Error ? failure.message : String(failure));
        }
      });
  };

  const restoreZip = () => {
    if (!zip) {
      return;
    }
    setRestoreStatus(null);
    restore.mutate(
      { teamId: team.id, exported: zip.value },
      {
        onSuccess: (results) => {
          setRestoreStatus(describeRestore(restoreSummary(results)));
          setZip(null);
        },
      },
    );
  };

  return (
    <>
      <AppHeader>
        <Link to={`/t/${team.id}`}>Back to the team</Link>
      </AppHeader>
      <main id="main" className={setupStyles.main}>
        <div className={setupStyles.intro}>
          <h1 className={setupStyles.title}>Team settings</h1>
          <p className={setupStyles.lead}>
            {team.name}: how ratings are read, the league's rules, the backup and the restore.
          </p>
        </div>
        <TeamSettingsForm form={form} errors={errors} onChange={setForm} onSubmit={save}>
          <Button type="submit" variant="primary" disabled={update.isPending}>
            {update.isPending ? 'Saving…' : 'Save settings'}
          </Button>
          {saved ? (
            <span className={styles.saved} role="status">
              Saved.
            </span>
          ) : null}
          {update.isError ? (
            <span className={styles.error} role="alert">
              {update.error.message}
            </span>
          ) : null}
        </TeamSettingsForm>
        <ExportPanel
          busy={exporter.isPending}
          status={exportStatus}
          error={exporter.isError ? exporter.error.message : null}
          onExport={exportZip}
        />
        <RestorePanel
          preview={zip?.preview ?? null}
          readError={readError}
          busy={restore.isPending}
          status={restoreStatus}
          error={restore.isError ? restore.error.message : null}
          onChoose={chooseZip}
          onRestore={restoreZip}
          onClear={() => {
            setZip(null);
            setReadError(null);
          }}
        />
      </main>
    </>
  );
}

/** Hands the browser a file to save. */
function download(bytes: Uint8Array, name: string) {
  const url = URL.createObjectURL(new Blob([bytes.slice()], { type: 'application/zip' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  // Safari reads the URL after the click returns; revoking it at once can empty the download.
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 60_000);
}
