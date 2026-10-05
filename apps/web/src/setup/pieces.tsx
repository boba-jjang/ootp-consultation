import {
  DATA_SET_INFO,
  LAYERS,
  VIEW_DESCRIPTIONS,
  VIEW_MANIFESTS,
  type Coverage,
  type CoverageLevel,
  type ExportSummary,
  type Layer,
  type RoutedExport,
  type ViewId,
} from '@ootp/core';
import { useRef, useState, type DragEvent, type ReactNode } from 'react';

import { classes } from '../ui/classes.ts';
import { UploadIcon } from '../ui/icons.tsx';
import {
  Badge,
  Button,
  Chip,
  CoverageBadge,
  CoverageLayers,
  LeagueTag,
  Panel,
} from '../ui/primitives.tsx';
import { scoutingAccuracyLabel } from './exports.ts';
import { readDrop, readFiles } from './files.ts';
import styles from './Setup.module.css';

/**
 * The pieces of the Create a Team flow that read nothing themselves, so the sheet can show
 * them: the drop zone, the best-first-upload card, what the files say and the views read.
 */

/** Drop or choose files, folders included. */
export function DropZone({
  size,
  onFiles,
  busy,
  id,
  title,
  text,
}: {
  size: 'large' | 'small';
  onFiles: (files: Promise<import('@ootp/core').Upload[]>) => void;
  busy: boolean;
  id?: string;
  /** The setup's words unless a screen has its own. */
  title?: string;
  text?: string;
}) {
  const [over, setOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setOver(false);
    onFiles(readDrop(event.dataTransfer));
  };
  return (
    <div
      id={id}
      className={classes(styles.dropZone, size === 'small' && styles.dropZoneSmall)}
      data-over={over}
      onDragOver={(event) => {
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => {
        setOver(false);
      }}
      onDrop={onDrop}
    >
      <UploadIcon className={styles.dropIcon} />
      <p className={styles.dropTitle}>
        {title ?? (size === 'large' ? 'Drop your OOTP exports here' : 'Drop more files here')}
      </p>
      {size === 'large' || text ? (
        <p className={styles.dropText}>
          {text ??
            "Any mix of views, one file or a whole folder. Each file is recognized by its columns, so names don't matter."}
        </p>
      ) : null}
      <div className={styles.dropActions}>
        <Button
          variant={size === 'large' ? 'primary' : 'outline'}
          disabled={busy}
          onClick={() => fileInput.current?.click()}
        >
          {busy ? 'Reading…' : size === 'large' ? 'Choose files' : 'Add more files'}
        </Button>
        <Button variant="ghost" disabled={busy} onClick={() => folderInput.current?.click()}>
          Choose a folder
        </Button>
      </div>
      <input
        ref={fileInput}
        type="file"
        multiple
        accept=".csv,text/csv"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          onFiles(readFiles(event.target.files ?? []));
          event.target.value = '';
        }}
      />
      <input
        ref={folderInput}
        type="file"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        // @ts-expect-error -- webkitdirectory has no React typing yet
        webkitdirectory=""
        onChange={(event) => {
          onFiles(readFiles(event.target.files ?? []));
          event.target.value = '';
        }}
      />
    </div>
  );
}

const LAYER_COPY: Record<Layer, { title: string; level: CoverageLevel; text: string }> = {
  stats: { title: 'Stats', level: 'low', text: 'Results, rates and run creation.' },
  superstats: {
    title: 'Superstats',
    level: 'moderate',
    text: 'Contact quality and swing decisions.',
  },
  ratings: {
    title: 'Ratings and potentials',
    level: 'high',
    text: 'Defense, tactical settings and the Dev Lab.',
  },
};

const layerViews = (layer: Layer): ViewId[] =>
  (Object.keys(VIEW_MANIFESTS) as ViewId[]).filter((view) => {
    const set = DATA_SET_INFO[VIEW_DESCRIPTIONS[view].dataSet];
    return set.layer === layer || (layer === 'stats' && set.layer === null);
  });

/** The three layers, as the setup board lists them: any export works, each layer adds. */
export function BestFirstUpload() {
  return (
    <Panel title="Best first upload" className={styles.best}>
      <p className={styles.muted}>
        Any export works. Each layer you add raises the data coverage of the analysis.
      </p>
      {LAYERS.map((layer) => (
        <div key={layer} className={styles.layer}>
          <div className={styles.layerHead}>
            <h3 className={styles.layerTitle}>{LAYER_COPY[layer].title}</h3>
            <CoverageBadge level={LAYER_COPY[layer].level} prefix="" />
          </div>
          <p className={styles.muted}>{LAYER_COPY[layer].text}</p>
          <div className={styles.chips}>
            {layerViews(layer).map((view) => (
              <Chip key={view}>{view}</Chip>
            ))}
          </div>
        </div>
      ))}
    </Panel>
  );
}

const Count = ({ children }: { children: ReactNode }) => (
  <span className={styles.count}>{children}</span>
);

/** "Found in your files": the team the exports describe. */
export function FoundInFiles({ summary }: { summary: ExportSummary }) {
  return (
    <section className={styles.found} aria-labelledby="found-title">
      <p className={styles.muted}>Found in your files</p>
      <div className={styles.foundName}>
        <h2 id="found-title" className={styles.foundTitle}>
          {summary.teamName ?? 'Your team'}
        </h2>
        {summary.leagueColumn ? <LeagueTag>{summary.leagueColumn}</LeagueTag> : null}
      </div>
      <p className={styles.foundRoster}>
        <Count>{summary.hitters}</Count> hitters and <Count>{summary.pitchers}</Count> pitchers
        {summary.gameNumber === null ? '' : ', through game '}
        {summary.gameNumber === null ? '' : <Count>{summary.gameNumber}</Count>}.
      </p>
      <div className={styles.chips}>
        {summary.teamColumn ? <Badge label="Team column:" value={summary.teamColumn} /> : null}
        {summary.leagueColumn ? (
          <Badge label="League column:" value={summary.leagueColumn} />
        ) : null}
        {summary.filePrefix ? <Badge label="File names:" value={summary.filePrefix} /> : null}
        {summary.gameNumber === null ? (
          <Badge label="No hitter stats view yet, so no game number" />
        ) : (
          <Badge label={`Game ${summary.gameNumber}: most games played by any hitter`} />
        )}
        {summary.scoutingAccuracy ? (
          <Badge label={`Scouting accuracy: ${scoutingAccuracyLabel(summary.scoutingAccuracy)}`} />
        ) : null}
      </div>
    </section>
  );
}

/** The views recognized, per side, with the league files, the capture and the rejects. */
export function ViewsRead({ named, coverage }: { named: RoutedExport[]; coverage: Coverage }) {
  const used = named.filter((upload) => upload.routing !== 'rejected').length;
  const capture = named.some((upload) => upload.routing === 'supplemental');
  const rejected = named.filter((upload) => upload.routing === 'rejected');
  const side = (which: 'hitters' | 'pitchers') =>
    coverage.views.onFile.filter((view) => VIEW_MANIFESTS[view].side === which);
  return (
    <Panel
      title={`${coverage.views.onFile.length} ${coverage.views.onFile.length === 1 ? 'view' : 'views'} recognized`}
      meta={`${used} of ${named.length} files`}
      className={styles.views}
    >
      {(['hitters', 'pitchers'] as const).map((which) => (
        <div key={which} className={styles.viewGroup}>
          <h3 className={styles.viewGroupTitle}>{which === 'hitters' ? 'Hitters' : 'Pitchers'}</h3>
          {side(which).length === 0 ? (
            <p className={styles.muted}>
              No {which === 'hitters' ? 'hitter' : 'pitcher'} view yet.
            </p>
          ) : (
            <ul className={styles.viewList}>
              {side(which).map((view) => (
                <li key={view} className={styles.view}>
                  <span className={styles.viewName}>{view}</span>
                  <span className={styles.muted}>{VIEW_DESCRIPTIONS[view].carries}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
      {coverage.league.onFile.length > 0 || capture ? (
        <div className={styles.viewGroup}>
          <h3 className={styles.viewGroupTitle}>Also read</h3>
          <ul className={styles.viewList}>
            {coverage.league.onFile.map((view) => (
              <li key={view} className={styles.view}>
                <span className={styles.viewName}>League {view}</span>
                <span className={styles.muted}>League-wide, for percentiles later</span>
              </li>
            ))}
            {capture ? (
              <li className={styles.view}>
                <span className={styles.viewName}>cus_pitch_pot on the hitters</span>
                <span className={styles.muted}>Only DEF Pot is used, as the hitters' ceiling</span>
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}
      {rejected.length > 0 ? (
        <div className={styles.viewGroup}>
          <h3 className={styles.viewGroupTitle}>Not used</h3>
          <ul className={styles.viewList}>
            {rejected.map((upload) => (
              <li key={upload.name} className={styles.view}>
                <span className={styles.viewName}>{upload.name}</span>
                <span className={styles.muted}>
                  {upload.events.find((event) => event.level === 'error')?.message ??
                    'The file could not be used.'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Panel>
  );
}

/** The coverage the first snapshot would have, and what raises it. */
export function CoverageSoFar({ coverage }: { coverage: Coverage }) {
  return (
    <Panel title="Data coverage" meta={<CoverageBadge level={coverage.level} prefix="" />}>
      <CoverageLayers
        stats={coverage.layers.stats}
        superstats={coverage.layers.superstats}
        ratings={coverage.layers.ratings}
      />
      <p className={styles.muted}>
        {coverage.summary}
        {coverage.next.length > 0 ? ' Add more now, or anytime from the Clubhouse.' : ''}
      </p>
    </Panel>
  );
}
