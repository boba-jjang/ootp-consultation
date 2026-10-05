import {
  DATA_SETS,
  DATA_SET_INFO,
  LAYERS,
  VIEW_DESCRIPTIONS,
  VIEW_MANIFESTS,
  columnNotesFor,
  type Coverage,
  type ImportedFile,
  type Layer,
  type SideCoverage,
  type StoredSnapshot,
  type ViewId,
} from '@ootp/core';
import { useState } from 'react';

import { CheckIcon, InfoIcon } from '../ui/icons.tsx';
import { Button, Chip, MatrixCell, Panel, Timeline } from '../ui/primitives.tsx';
import styles from './Clubhouse.module.css';

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

/** The layers, the badge's sentence, and a card per view that would raise it. */
export function UploadNext({
  coverage,
  onUpload,
}: {
  coverage: Coverage;
  onUpload: (view: ViewId) => void;
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
      {coverage.next.slice(0, 3).map((view) => {
        const description = VIEW_DESCRIPTIONS[view];
        return (
          <article key={view} className={styles.card}>
            <h3 className={styles.cardTitle}>{description.title}</h3>
            <Chip>{view}</Chip>
            <p className={styles.muted}>
              {description.carries}.{description.unlocks ? ` Unlocks: ${description.unlocks}.` : ''}
            </p>
            <Button
              variant="outline"
              className={styles.cardAction}
              onClick={() => {
                onUpload(view);
              }}
            >
              Upload this view
            </Button>
          </article>
        );
      })}
      {coverage.next.length === 0 ? (
        <p className={styles.muted}>Every team view is on file. New exports refresh them.</p>
      ) : null}
    </Panel>
  );
}

/** "stats 1 + stats 2": the views of a data set, short. */
const shortViews = (views: readonly ViewId[]) =>
  views
    .map((view) =>
      view === 'default' || view.startsWith('cus')
        ? view
        : view.replace(/^(batting|pitching)_/, '').replaceAll('_', ' '),
    )
    .join(' + ');

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
                      {DATA_SET_INFO[set].views[side.side].length === 0
                        ? 'no view'
                        : shortViews(DATA_SET_INFO[set].views[side.side])}
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
        <MatrixCell label="Legend" state="partial" /> One of two views
        <MatrixCell label="Legend" state="empty" /> Empty, fills when its view is uploaded
        {side.side === 'pitchers' ? (
          <>
            <MatrixCell label="Legend" state="unavailable" /> No view carries it
          </>
        ) : null}
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
export function ImportLog({ files, label }: { files: readonly ImportedFile[]; label: string }) {
  return (
    <Panel title="Import log" meta={`${label} snapshot`} className={styles.log}>
      {files.length === 0 ? <p className={styles.muted}>No file yet.</p> : null}
      <ul className={styles.logList}>
        {files.map((file, index) => {
          const warnings = file.events.filter((event) => event.level === 'warning');
          // Two rejected copies of one name can sit in the log: the position tells them apart.
          return (
            <li key={`${index}:${file.name}`} className={styles.logRow}>
              <span className={styles.logIcon} data-routing={file.routing} aria-hidden="true">
                {file.routing === 'rejected' ? <InfoIcon /> : <CheckIcon />}
              </span>
              <span className={styles.logText}>
                <span>{routeOf(file)}</span>
                <span className={styles.logFile}>{file.name}</span>
                {warnings.map((event) => (
                  <span key={event.code} className={styles.logWarning}>
                    {event.message}
                  </span>
                ))}
              </span>
              <span className={styles.logCount}>
                {file.routing === 'rejected'
                  ? '—'
                  : `${file.players} ${file.scope === 'league' ? 'rows' : 'players'}`}
              </span>
            </li>
          );
        })}
      </ul>
      <p className={styles.muted}>
        Cleaned on the way in: innings read in thirds (52.2 IP is 52⅔ innings), percent signs,
        fractional rates and salaries like $600 000.
      </p>
    </Panel>
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
