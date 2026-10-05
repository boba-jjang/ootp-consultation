import { useRef } from 'react';

import { Button, LeagueTag, Panel } from '../ui/primitives.tsx';
import styles from './Settings.module.css';

/** Export team: the backup, as a zip download. */
export function ExportPanel({
  busy,
  status,
  error,
  onExport,
}: {
  busy: boolean;
  status: string | null;
  error: string | null;
  onExport: () => void;
}) {
  return (
    <Panel title="Export team" className={styles.panel}>
      <p className={styles.text}>
        Downloads a zip of every raw file on file plus these settings. It's the backup: restoring it
        into a team re-imports the files, and restoring twice changes nothing.
      </p>
      <div className={styles.actions}>
        <Button variant="accent" disabled={busy} onClick={onExport}>
          {busy ? 'Preparing…' : 'Export team'}
        </Button>
        {status ? (
          <span className={styles.status} role="status">
            {status}
          </span>
        ) : null}
      </div>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </Panel>
  );
}

export interface RestorePreview {
  fileName: string;
  team: { name: string; league: string };
  snapshots: number;
  files: number;
}

/** Restore from a zip: choose it, see what it holds, then restore. */
export function RestorePanel({
  preview,
  readError,
  busy,
  status,
  error,
  onChoose,
  onRestore,
  onClear,
}: {
  preview: RestorePreview | null;
  readError: string | null;
  busy: boolean;
  status: string | null;
  error: string | null;
  onChoose: (file: File) => void;
  onRestore: () => void;
  onClear: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <Panel title="Restore from a zip" className={styles.panel}>
      <p className={styles.text}>
        An Export team zip, from this team or another. Its files are re-imported into this team's
        snapshots through the importer; its settings are shown but not applied.
      </p>
      {preview ? (
        <div className={styles.preview}>
          <p className={styles.previewTitle}>
            {preview.team.name} <LeagueTag>{preview.team.league}</LeagueTag>
          </p>
          <p className={styles.text}>
            {preview.snapshots} {preview.snapshots === 1 ? 'snapshot' : 'snapshots'},{' '}
            {preview.files} {preview.files === 1 ? 'file' : 'files'}, from{' '}
            <span className={styles.fileName}>{preview.fileName}</span>.
          </p>
          <div className={styles.actions}>
            <Button variant="primary" disabled={busy || preview.files === 0} onClick={onRestore}>
              {busy
                ? 'Restoring…'
                : `Restore ${preview.files} ${preview.files === 1 ? 'file' : 'files'}`}
            </Button>
            <Button variant="ghost" disabled={busy} onClick={onClear}>
              Choose another zip
            </Button>
          </div>
        </div>
      ) : (
        <div className={styles.actions}>
          <Button variant="outline" disabled={busy} onClick={() => input.current?.click()}>
            Choose a zip
          </Button>
        </div>
      )}
      <input
        ref={input}
        type="file"
        accept=".zip,application/zip"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            onChoose(file);
          }
          event.target.value = '';
        }}
      />
      {readError ? (
        <p className={styles.error} role="alert">
          {readError}
        </p>
      ) : null}
      {status ? (
        <p className={styles.status} role="status">
          {status}
        </p>
      ) : null}
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </Panel>
  );
}
