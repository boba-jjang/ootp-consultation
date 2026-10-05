import type { Upload } from '@ootp/core';
import { useState } from 'react';
import { useNavigate } from 'react-router';

import { useAddExports, useViewCounts } from '../data.ts';
import { DropZone } from '../setup/pieces.tsx';
import { useShell } from '../shell/context.ts';
import { modulePath } from '../shell/modules.ts';
import { Button } from '../ui/primitives.tsx';
import styles from './Clubhouse.module.css';
import { ColumnNotes, CoverageMatrix, ImportLog, SnapshotTimeline, UploadNext } from './pieces.tsx';

const EMPTY_COUNTS: ReadonlyMap<string, number> = new Map();

/**
 * The Clubhouse: everything on file for the team. Uploads go through the importer like the
 * first ones did; an export with a new game number opens a new snapshot and the screen
 * follows it.
 */
export function Clubhouse() {
  const { team, snapshots, snapshotId, snapshot } = useShell();
  const navigate = useNavigate();
  const add = useAddExports();
  const counts = useViewCounts(snapshots.map((candidate) => candidate.id));
  const [reading, setReading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onFiles = (files: Promise<Upload[]>) => {
    setReading(true);
    setError(null);
    setNotice(null);
    files
      .then(async (uploads) => {
        if (uploads.length === 0) {
          setError('No CSV file was among those. OOTP exports are .csv files.');
          return;
        }
        const result = await add.mutateAsync({
          teamId: team.id,
          snapshotId,
          uploads,
          scale: team.rating_scale,
        });
        if (!result.ok) {
          setError(result.message);
          return;
        }
        const count = (outcome: 'added' | 'replaced' | 'unchanged') =>
          result.files.filter((file) => file.outcome === outcome).length;
        const rejected = result.files.filter((file) => file.routing === 'rejected').length;
        setNotice(
          `${result.files.length} ${result.files.length === 1 ? 'file' : 'files'} read: ${count('added')} added, ${count('replaced')} replaced, ${count('unchanged')} already on file${rejected > 0 ? `, ${rejected} not usable` : ''}.`,
        );
        if (result.snapshot.id !== snapshotId) {
          void navigate(modulePath(team.id, result.snapshot.id, 'clubhouse'));
        }
      })
      .catch((failure: unknown) => {
        setError(failure instanceof Error ? failure.message : String(failure));
      })
      .finally(() => {
        setReading(false);
      });
  };

  const focusDropZone = () => {
    const zone = document.getElementById('add-data');
    zone?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    zone?.querySelector('button')?.focus();
  };

  const views = snapshot.coverage.views.onFile;
  const counted = new Map(counts.data ?? EMPTY_COUNTS);
  counted.set(snapshotId, views.length);

  return (
    <main id="main" className={styles.main}>
      <div className={styles.intro}>
        <h1 className={styles.title}>The Clubhouse</h1>
        <p className={styles.lead}>
          Everything on file for the {team.name}. Drop any OOTP export and it's matched to the right
          players and data.
        </p>
      </div>

      <div className={styles.columns}>
        <section className={styles.addData} aria-labelledby="add-data-title">
          <h2 id="add-data-title" className={styles.sectionTitle}>
            Add data
          </h2>
          <DropZone
            id="add-data"
            size="large"
            busy={reading}
            onFiles={onFiles}
            title="Drop any OOTP export here"
            text="Hitters or pitchers, stats or ratings, one file or a whole folder. Each file is recognized by its columns and added to the current snapshot."
          />
          {notice ? (
            <p className={styles.notice} role="status">
              {notice}
            </p>
          ) : null}
          {error ? (
            <p className={styles.error} role="alert">
              {error}
            </p>
          ) : null}
          <SnapshotTimeline games={team.games_per_season} snapshots={snapshots} counts={counted} />
        </section>
        <UploadNext coverage={snapshot.coverage} onUpload={focusDropZone} />
      </div>

      <div className={styles.columns}>
        <CoverageMatrix side={snapshot.coverage.hitters} />
        <CoverageMatrix side={snapshot.coverage.pitchers} />
      </div>

      <div className={styles.columns}>
        <ImportLog files={snapshot.files} label={snapshot.label ?? 'This'} />
        <ColumnNotes views={views} files={snapshot.files} />
      </div>

      <div className={styles.run}>
        <p className={styles.muted}>
          Runs on everything on file. Locked panels open as their data arrives. The analysis arrives
          in Phase 4 with the models.
        </p>
        <Button variant="primary" disabled aria-describedby="run-hint">
          Run analysis
        </Button>
        <span id="run-hint" className="sr-only">
          Not available until Phase 4
        </span>
      </div>
    </main>
  );
}
