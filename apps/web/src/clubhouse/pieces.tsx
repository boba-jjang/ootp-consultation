import {
  DATA_SETS,
  DATA_SET_INFO,
  LAYERS,
  VIEW_MANIFESTS,
  columnNotesFor,
  dataSetName,
  type Coverage,
  type ImportedFile,
  type Layer,
  type SideCoverage,
  type StoredSnapshot,
  type Upload,
  type UploadedFile,
  type ViewId,
} from '@ootp/core';
import { useEffect, useRef, useState } from 'react';

import { upperFirst } from '../setup/exports.ts';
import { FileButton } from '../setup/pieces.tsx';
import { CheckIcon, InfoIcon } from '../ui/icons.tsx';
import { Button, Chip, MatrixCell, Panel, Timeline } from '../ui/primitives.tsx';
import styles from './Clubhouse.module.css';
import { outcomeOf } from './results.ts';

/**
 * The Clubhouse's pieces that read nothing themselves, so the sheet can show them: the
 * timeline, what to upload next, the coverage matrices, the import log and the column notes.
 */

const LAYER_LABELS: Record<Layer, string> = {
  stats: 'Stats',
  superstats: 'Superstats',
  ratings: 'Ratings',
};

/** Each upload day on the season, labelled with its game and its views. */
export function SnapshotTimeline({
  games,
  snapshots,
  counts,
}: {
  games: number;
  snapshots: readonly StoredSnapshot[];
  /** Team views on file per snapshot id, where known. */
  counts: ReadonlyMap<string, number>;
}) {
  return (
    <div className={styles.timeline}>
      <div className={styles.panelHead}>
        <h3 className={styles.subtitle}>Season snapshots</h3>
        <p className={styles.muted}>
          Each upload day becomes a point you can return to from the snapshot menu.
        </p>
      </div>
      <Timeline
        games={games}
        snapshots={snapshots.map((snapshot) => {
          const count = counts.get(snapshot.id);
          return {
            game: snapshot.gameNumber,
            label:
              count === undefined
                ? snapshot.label
                : `${snapshot.label}, ${count} ${count === 1 ? 'view' : 'views'}`,
          };
        })}
      />
    </div>
  );
}

/** The layers, the badge's sentence, and a card per data set still missing. */
export function UploadNext({
  coverage,
  busy,
  onFiles,
}: {
  coverage: Coverage;
  busy: boolean;
  onFiles: (files: Promise<Upload[]>) => void;
}) {
  return (
    <Panel title="What to upload next" className={styles.next}>
      <div className={styles.layerBars}>
        {LAYERS.map((layer) => (
          <div key={layer} className={styles.layerBar} data-lit={coverage.layers[layer]}>
            <span aria-hidden="true" />
            <span>
              {LAYER_LABELS[layer]}
              <span className="sr-only">{coverage.layers[layer] ? ', on file' : ', missing'}</span>
            </span>
          </div>
        ))}
      </div>
      <p className={styles.muted}>{coverage.summary}</p>
      {coverage.next.slice(0, 3).map(({ side, set }) => {
        const name = dataSetName(side, set);
        const views = DATA_SET_INFO[set].views[side];
        return (
          <article key={`${side}-${set}`} className={styles.card}>
            <h3 className={styles.cardTitle}>{upperFirst(name)}</h3>
            <div className={styles.chips}>
              {views.map((view) => (
                <Chip key={view}>{view}</Chip>
              ))}
            </div>
            <p className={styles.muted}>
              {coverage[side].sets[set] === 'partial'
                ? 'Part of it is on file.'
                : 'Not on file yet.'}{' '}
              {views.length === 1 ? 'This view carries it' : 'These views carry it'}, or a custom
              view with its columns.
            </p>
            <FileButton
              variant="outline"
              className={styles.cardAction}
              label={`Upload files: ${name}`}
              multiple
              busy={busy}
              onFiles={onFiles}
            >
              Upload files
            </FileButton>
          </article>
        );
      })}
      {coverage.next.length === 0 ? (
        <p className={styles.muted}>
          Every data set is on file for both sides. New exports refresh them.
        </p>
      ) : null}
    </Panel>
  );
}

/** One side's coverage matrix: players against the five data sets. */
export function CoverageMatrix({ side }: { side: SideCoverage }) {
  const title = side.side === 'hitters' ? 'Hitters on file' : 'Pitchers on file';
  const players = side.players.length;
  return (
    <Panel
      title={title}
      meta={`${players} ${players === 1 ? 'player' : 'players'}, ${side.onFile} of ${DATA_SETS.length} data sets`}
      className={styles.matrix}
    >
      {players === 0 ? (
        <p className={styles.muted}>
          No {side.side === 'hitters' ? 'hitter' : 'pitcher'} view yet.
        </p>
      ) : (
        <div
          className={styles.tableWrap}
          role="region"
          aria-label={`${title}, by data set`}
          tabIndex={0}
        >
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Player</th>
                <th scope="col">Pos</th>
                {DATA_SETS.map((set) => (
                  <th key={set} scope="col">
                    {DATA_SET_INFO[set].label[side.side]}
                    <span className={styles.thViews}>
                      {DATA_SET_INFO[set].carriedBy[side.side]}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {side.players.map((player) => (
                <tr key={player.name}>
                  <th scope="row">{player.name}</th>
                  <td className={styles.mono}>{player.position}</td>
                  {DATA_SETS.map((set) => (
                    <td key={set}>
                      <MatrixCell
                        label={DATA_SET_INFO[set].label[side.side]}
                        state={player.sets[set]}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className={styles.legend}>
        <MatrixCell label="Legend" state="on" /> On file
        <MatrixCell label="Legend" state="partial" /> Some of its columns
        <MatrixCell label="Legend" state="empty" /> Empty, fills when a file carries it
      </p>
    </Panel>
  );
}

const routeOf = (file: ImportedFile) => {
  if (file.routing === 'rejected') {
    return `Not used: ${file.events.find((event) => event.level === 'error')?.message ?? 'the file could not be read'}`;
  }
  if (file.routing === 'supplemental') {
    return 'Supplemental: DEF Pot for the hitters, from the pitching ratings view';
  }
  if (file.scope === 'league') {
    return `League file: ${file.view ?? 'unknown view'}`;
  }
  return `Routed to ${file.view ?? 'unknown view'}, ${file.side ?? 'either side'}`;
};

/** Every file of the snapshot, where it went and how many players it matched. */
/** What a stored file's row can do, when the screen can change the snapshot. */
export interface LogActions {
  busy: boolean;
  /** A message on one row, such as why a replacement was refused. */
  notice: { id: string; message: string } | null;
  onReplace: (file: ImportedFile, files: Promise<Upload[]>) => void;
  onRemove: (file: ImportedFile) => void;
}

/** Every file of the snapshot, where it went and how many players it matched. */
export function ImportLog({
  files,
  label,
  actions,
}: {
  files: readonly ImportedFile[];
  label: string;
  actions?: LogActions;
}) {
  return (
    <Panel title="Import log" meta={`${label} snapshot`} className={styles.log}>
      {files.length === 0 ? <p className={styles.muted}>No file yet.</p> : null}
      <ul className={styles.logList}>
        {files.map((file, index) => (
          // Two rejected copies of one name can sit in the log: the position tells them apart.
          <LogRow key={file.id ?? `${String(index)}:${file.name}`} file={file} actions={actions} />
        ))}
      </ul>
      <p className={styles.muted}>
        Cleaned on the way in: innings read in thirds (52.2 IP is 52⅔ innings), percent signs,
        fractional rates and salaries like $600 000.
      </p>
    </Panel>
  );
}

/** One file of the log. Replace swaps it for another export of its view; Remove asks first. */
function LogRow({ file, actions }: { file: ImportedFile; actions: LogActions | undefined }) {
  const [confirming, setConfirming] = useState(false);
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    // The Remove button is gone once the question shows, so the focus moves to the safe answer.
    if (confirming) {
      cancel.current?.focus();
    }
  }, [confirming]);
  const warnings = file.events.filter((event) => event.level === 'warning');
  const notice = actions?.notice && actions.notice.id === file.id ? actions.notice.message : null;
  return (
    <li className={styles.logRow}>
      <span className={styles.logIcon} data-routing={file.routing} aria-hidden="true">
        {file.routing === 'rejected' ? <InfoIcon /> : <CheckIcon />}
      </span>
      <div className={styles.logText}>
        <span>{routeOf(file)}</span>
        <span className={styles.logFile}>{file.name}</span>
        {warnings.map((event) => (
          <span key={event.code} className={styles.logWarning}>
            {event.message}
          </span>
        ))}
        {actions && file.id !== undefined ? (
          <div className={styles.logActions}>
            {confirming ? (
              <>
                <span className={styles.confirmText}>Remove this file from the snapshot?</span>
                <Button
                  variant="outline"
                  aria-label={`Yes, remove ${file.name}`}
                  disabled={actions.busy}
                  onClick={() => {
                    setConfirming(false);
                    actions.onRemove(file);
                  }}
                >
                  Yes, remove
                </Button>
                <Button
                  ref={cancel}
                  variant="ghost"
                  onClick={() => {
                    setConfirming(false);
                  }}
                >
                  Cancel
                </Button>
              </>
            ) : (
              <>
                {file.routing === 'rejected' ? null : (
                  <FileButton
                    variant="ghost"
                    label={`Replace ${file.name}`}
                    multiple={false}
                    busy={actions.busy}
                    onFiles={(files) => {
                      actions.onReplace(file, files);
                    }}
                  >
                    Replace
                  </FileButton>
                )}
                <Button
                  variant="ghost"
                  aria-label={`Remove ${file.name}`}
                  disabled={actions.busy}
                  onClick={() => {
                    setConfirming(true);
                  }}
                >
                  Remove
                </Button>
              </>
            )}
          </div>
        ) : null}
        {notice ? (
          <p className={styles.rowNotice} role="alert">
            {notice}
          </p>
        ) : null}
      </div>
      <span className={styles.logCount}>
        {file.routing === 'rejected'
          ? '—'
          : `${String(file.players)} ${file.scope === 'league' ? 'rows' : 'players'}`}
      </span>
    </li>
  );
}

/** What an upload did, file by file. */
export function UploadResults({
  heading,
  files,
  onDismiss,
}: {
  heading: string;
  files: readonly UploadedFile[];
  onDismiss: () => void;
}) {
  return (
    <div className={styles.results}>
      <p className={styles.resultsHeading} role="status">
        {heading}
      </p>
      <ul className={styles.resultList}>
        {files.map((file, index) => (
          <li
            key={`${String(index)}:${file.name}`}
            className={styles.result}
            data-outcome={file.routing === 'rejected' ? 'rejected' : file.outcome}
          >
            <span className={styles.logFile}>{file.name}</span>
            <span>{outcomeOf(file)}</span>
          </li>
        ))}
      </ul>
      <Button variant="ghost" className={styles.dismiss} onClick={onDismiss}>
        Dismiss
      </Button>
    </div>
  );
}

/** How a view's ambiguous or cleaned headers were read, one view at a time. */
export function ColumnNotes({
  views,
  files,
}: {
  /** The team views on file, in manifest order. */
  views: readonly ViewId[];
  files: readonly ImportedFile[];
}) {
  const [chosen, setChosen] = useState<ViewId | null>(null);
  const first = views.includes('pitching_stats_2') ? 'pitching_stats_2' : views[0];
  const view = chosen && views.includes(chosen) ? chosen : first;
  if (!view) {
    return (
      <Panel title="How columns were read" className={styles.notes}>
        <p className={styles.muted}>Nothing to show until a team view is on file.</p>
      </Panel>
    );
  }
  const header = VIEW_MANIFESTS[view].versions.at(-1) ?? [];
  const file = files.find(
    (candidate) => candidate.view === view && candidate.routing === 'primary',
  );
  const notes = columnNotesFor(view);
  return (
    <Panel
      title="How columns were read"
      meta={<span className={styles.logFile}>{file?.name ?? view}</span>}
      className={styles.notes}
    >
      <label className={styles.select}>
        View
        <select
          value={view}
          onChange={(event) => {
            setChosen(event.target.value as ViewId);
          }}
        >
          {views.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
      {notes.length === 0 ? (
        <p className={styles.muted}>Every column of this view is read as it comes.</p>
      ) : (
        <dl className={styles.noteList}>
          {notes.map((note) => (
            <div key={note.columns.join('/')} className={styles.note}>
              <dt className={styles.noteColumn}>{note.columns.join(' / ')}</dt>
              <dd className={styles.noteText}>{note.note}</dd>
            </div>
          ))}
        </dl>
      )}
      <details className={styles.allColumns}>
        <summary>All {header.length} columns</summary>
        <div className={styles.chips}>
          {header.map((column) => (
            <Chip key={column}>{column}</Chip>
          ))}
        </div>
      </details>
    </Panel>
  );
}
