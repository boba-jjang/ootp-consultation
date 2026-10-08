import {
  LAYERS,
  type Coverage,
  type CoverageLevel,
  type ExportSummary,
  type Layer,
  type Upload,
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
  type ButtonVariant,
} from '../ui/primitives.tsx';
import {
  fileGroups,
  fileLine,
  layerSets,
  scoutingAccuracyLabel,
  type PendingFile,
} from './exports.ts';
import { readDrop, readFiles } from './files.ts';
import styles from './Setup.module.css';

/**
 * The pieces of the Create a Team flow that read nothing themselves, so the sheet can show
 * them: the drop zone, the best-first-upload card, what the files say and the files read.
 */

/** A button that opens the file picker for CSV exports. */
export function FileButton({
  children,
  label,
  variant,
  multiple,
  busy,
  className,
  onFiles,
}: {
  children: ReactNode;
  /** The accessible name, when the visible text alone is ambiguous; it starts with that text. */
  label?: string;
  variant: ButtonVariant;
  multiple: boolean;
  busy: boolean;
  className?: string;
  onFiles: (files: Promise<Upload[]>) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <Button
        variant={variant}
        className={className}
        disabled={busy}
        aria-label={label}
        onClick={() => input.current?.click()}
      >
        {children}
      </Button>
      <input
        ref={input}
        type="file"
        multiple={multiple}
        accept=".csv,text/csv"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          onFiles(readFiles(event.target.files ?? []));
          event.target.value = '';
        }}
      />
    </>
  );
}

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
  onFiles: (files: Promise<Upload[]>) => void;
  busy: boolean;
  id?: string;
  /** The setup's words unless a screen has its own. */
  title?: string;
  text?: string;
}) {
  const [over, setOver] = useState(false);
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
        <FileButton
          variant={size === 'large' ? 'primary' : 'outline'}
          multiple
          busy={busy}
          onFiles={onFiles}
        >
          {busy ? 'Reading…' : size === 'large' ? 'Choose files' : 'Add more files'}
        </FileButton>
        <Button variant="ghost" disabled={busy} onClick={() => folderInput.current?.click()}>
          Choose a folder
        </Button>
      </div>
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

/** One data set's line: the views that carry it, as chips, or a custom view. */
function SetViews({ label, views }: { label: string; views: readonly string[] }) {
  return (
    <div className={styles.chips}>
      <span className={styles.muted}>{label}:</span>
      {views.map((view) => (
        <Chip key={view}>{view}</Chip>
      ))}
      <span className={styles.muted}>or a custom view</span>
    </div>
  );
}

/**
 * The three layers, as the setup board lists them: any export works, each layer adds. Each
 * lists its data sets with the views that carry them; the bio set, which counts toward no
 * layer, comes last.
 */
export function BestFirstUpload() {
  const [bio] = layerSets(null);
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
          {layerSets(layer).map((set) => (
            <SetViews key={set.set} label={set.label} views={set.views} />
          ))}
        </div>
      ))}
      {bio ? (
        <p className={styles.muted}>
          Also read, though it counts toward no layer: the bio view ({bio.views.join(', ')}, or a
          custom view), for ages and contracts.
        </p>
      ) : null}
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

/**
 * The files read, per side, with a team file on both sides, the league files, the capture
 * and the rejects apart. Each can be removed before anything is saved.
 */
export function FilesRead({
  files,
  coverage,
  onRemove,
}: {
  files: readonly PendingFile[];
  coverage: Coverage;
  onRemove: (key: string) => void;
}) {
  const used = files.filter((file) => file.routed.routing !== 'rejected').length;
  return (
    <Panel
      title={`${coverage.dataSets.found} of ${coverage.dataSets.total} data sets found`}
      meta={`${used} of ${files.length} files`}
      className={styles.views}
    >
      {fileGroups(files).map((group) =>
        group.rows.length === 0 && group.empty === undefined ? null : (
          <div key={group.title} className={styles.viewGroup}>
            <h3 className={styles.viewGroupTitle}>{group.title}</h3>
            {group.rows.length === 0 ? (
              <p className={styles.muted}>{group.empty}</p>
            ) : (
              <ul className={styles.viewList}>
                {group.rows.map((file) => {
                  const line = fileLine(file.routed);
                  return (
                    <li key={file.key} className={styles.fileRow}>
                      <span className={styles.view}>
                        <span className={styles.viewName}>{line.title}</span>
                        <span className={styles.muted}>{line.detail}</span>
                        {line.title === file.routed.name ? null : (
                          <span className={styles.fileName}>{file.routed.name}</span>
                        )}
                      </span>
                      <Button
                        variant="ghost"
                        aria-label={`Remove ${file.routed.name}`}
                        onClick={() => {
                          onRemove(file.key);
                        }}
                      >
                        Remove
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ),
      )}
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
