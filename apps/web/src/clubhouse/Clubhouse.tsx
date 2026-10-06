import { replacementProblem, routeExport, type ImportedFile, type Upload } from '@ootp/core';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';

import { useAddExports, useRemoveFile, useViewCounts } from '../data.ts';
import { DropZone } from '../setup/pieces.tsx';
import { useShell } from '../shell/context.ts';
import { modulePath } from '../shell/modules.ts';
import { Button } from '../ui/primitives.tsx';
import styles from './Clubhouse.module.css';
import {
  ColumnNotes,
  CoverageMatrix,
  ImportLog,
  SnapshotTimeline,
  UploadNext,
  UploadResults,
} from './pieces.tsx';
import { resultsHeading, type Uploaded } from './results.ts';

const EMPTY_COUNTS: ReadonlyMap<string, number> = new Map();

/**
 * What a screen can hand the Clubhouse when it navigates here: the team menu asks for the
 * drop zone, and an upload that landed in this snapshot brings its results (with the snapshot
 * it started from, or null for a team that had none).
 */
export interface ClubhouseState {
  addData?: boolean;
  results?: { result: Uploaded; from: string | null };
}

const NO_CSV = 'No CSV file was among those. OOTP exports are .csv files.';

/**
 * The Clubhouse: everything on file for the team. Uploads go through the importer like the
 * first ones did: a re-export of a view replaces it, and an export with a new game number
 * opens that game's snapshot, which the screen follows. Each stored file can be replaced or
 * removed on its own.
 */
export function Clubhouse() {
  const { team, snapshots, snapshotId, snapshot } = useShell();
  const navigate = useNavigate();
  const location = useLocation();
  const add = useAddExports();
  const remove = useRemoveFile();
  const counts = useViewCounts(snapshots.map((candidate) => candidate.id));
  const [reading, setReading] = useState(false);
  const [results, setResults] = useState<ClubhouseState['results'] | null>(
    () => (location.state as ClubhouseState | null)?.results ?? null,
  );
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ id: string; message: string } | null>(null);
  const game = snapshots.find((candidate) => candidate.id === snapshotId)?.gameNumber ?? null;

  // Arriving from the team menu puts the drop zone in view. The state is read once, then
  // cleared, so a reload doesn't repeat it.
  useEffect(() => {
    const state = location.state as ClubhouseState | null;
    if (!state) {
      return;
    }
    if (state.addData) {
      focusDropZone();
    }
    void navigate(location.pathname, { replace: true, state: null });
  }, [location.state, location.pathname, navigate]);

  /** Stores files through the importer; check refuses them first, on the row it names. */
  const upload = (
    files: Promise<Upload[]>,
    check?: { row: string; problem: (uploads: Upload[]) => string | null },
  ) => {
    setReading(true);
    setError(null);
    setNotice(null);
    setResults(null);
    files
      .then(async (uploads) => {
        if (uploads.length === 0) {
          setError(NO_CSV);
          return;
        }
        const problem = check?.problem(uploads) ?? null;
        if (check && problem !== null) {
          setNotice({ id: check.row, message: problem });
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
        if (result.snapshot.id !== snapshotId) {
          const state: ClubhouseState = { results: { result, from: snapshotId } };
          void navigate(modulePath(team.id, result.snapshot.id, 'clubhouse'), { state });
          return;
        }
        setResults({ result, from: snapshotId });
      })
      .catch((failure: unknown) => {
        setError(failure instanceof Error ? failure.message : String(failure));
      })
      .finally(() => {
        setReading(false);
      });
  };

  const replace = (file: ImportedFile, files: Promise<Upload[]>) => {
    if (file.id === undefined) {
      return;
    }
    upload(files, {
      row: file.id,
      problem: (uploads) => {
        const [chosen] = uploads;
        if (uploads.length !== 1 || !chosen) {
          return 'Choose one file to replace this one.';
        }
        return game === null
          ? null
          : replacementProblem(file, game, routeExport(chosen.name, chosen.text));
      },
    });
  };

  const removeFile = (file: ImportedFile) => {
    if (file.id === undefined) {
      return;
    }
    setError(null);
    setNotice(null);
    setResults(null);
    remove.mutate(file.id, {
      onError: (failure) => {
        setError(failure.message);
      },
    });
  };

  const views = snapshot.coverage.views.onFile;
  const counted = new Map(counts.data ?? EMPTY_COUNTS);
  counted.set(snapshotId, views.length);
  const busy = reading || remove.isPending;

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
            busy={busy}
            onFiles={upload}
            title="Drop any OOTP export here"
            text="Hitters or pitchers, stats or ratings, one file or a whole folder. A re-export of a view replaces the earlier copy; exports from a later game start a new snapshot."
          />
          {results ? (
            <UploadResults
              heading={resultsHeading(results.result, results.from)}
              files={results.result.files}
              onDismiss={() => {
                setResults(null);
              }}
            />
          ) : null}
          {error ? (
            <p className={styles.error} role="alert">
              {error}
            </p>
          ) : null}
          <SnapshotTimeline games={team.games_per_season} snapshots={snapshots} counts={counted} />
        </section>
        <UploadNext coverage={snapshot.coverage} busy={busy} onFiles={upload} />
      </div>

      <div className={styles.columns}>
        <CoverageMatrix side={snapshot.coverage.hitters} />
        <CoverageMatrix side={snapshot.coverage.pitchers} />
      </div>

      <div className={styles.columns}>
        <ImportLog
          files={snapshot.files}
          label={snapshot.label ?? 'This'}
          actions={{ busy, notice, onReplace: replace, onRemove: removeFile }}
        />
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

/** Brings the Add data drop zone into view, with its first button focused. */
function focusDropZone() {
  const zone = document.getElementById('add-data');
  zone?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  zone?.querySelector('button')?.focus();
}
