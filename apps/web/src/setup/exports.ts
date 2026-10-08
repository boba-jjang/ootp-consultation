import {
  DATA_SETS,
  DATA_SET_INFO,
  VIEW_DESCRIPTIONS,
  VIEW_MANIFESTS,
  carriedSets,
  collectUploads,
  dataSetName,
  describeExports,
  describeFile,
  measureCoverage,
  type Coverage,
  type DataSet,
  type ExportSummary,
  type Layer,
  type RoutedExport,
  type Side,
  type TeamSettings,
  type Upload,
  type ViewId,
} from '@ootp/core';

import { listOf } from '../ui/text.ts';

/** A file Create team would store, routed in the browser. */
export interface PendingFile {
  /** Stable while the file stays in the set: for list keys and Remove. */
  key: string;
  upload: Upload;
  routed: RoutedExport;
}

/** The exports chosen so far, with what they say. */
export interface ReadExports {
  files: PendingFile[];
  uploads: Upload[];
  named: RoutedExport[];
  summary: ExportSummary;
  coverage: Coverage;
  /** The next key to hand out. */
  next: number;
}

function summarize(files: PendingFile[], next: number): ReadExports {
  const named = files.map((file) => file.routed);
  return {
    files,
    uploads: files.map((file) => file.upload),
    named,
    summary: describeExports(named),
    coverage: measureCoverage(named),
    next,
  };
}

export const NO_EXPORTS: ReadExports = summarize([], 0);

/**
 * Adds files to the set as the importer would store them (collectUploads): a file added twice
 * counts once, and every other file stays, a re-export of a view beside the earlier copy.
 */
export function addExports(current: ReadExports, added: readonly Upload[]): ReadExports {
  const keys = new Map(current.files.map((file) => [file.upload, file.key]));
  let next = current.next;
  const { kept } = collectUploads([...current.uploads, ...added]);
  const files = kept.map(({ upload, routed }) => {
    let key = keys.get(upload);
    if (key === undefined) {
      key = `file-${String(next)}`;
      next += 1;
    }
    return { key, upload, routed };
  });
  return summarize(files, next);
}

/** Takes one file out of the set; nothing has been saved yet. */
export function removeExport(current: ReadExports, key: string): ReadExports {
  return summarize(
    current.files.filter((file) => file.key !== key),
    current.next,
  );
}

/** "custom hitters view" → "Custom hitters view". */
export const upperFirst = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** A pending file's line in Files read: what it was read as, and what that brings. */
export function fileLine(file: RoutedExport): { title: string; detail: string } {
  if (file.routing === 'rejected') {
    return {
      title: file.name,
      detail:
        file.events.find((event) => event.level === 'error')?.message ??
        'The app can’t read this file.',
    };
  }
  if (file.routing === 'supplemental') {
    return {
      title: `${file.view ?? 'Custom pitchers view'} on the hitters`,
      detail: 'Only DEF Pot is used, as the hitters’ ceiling',
    };
  }
  if (file.scope === 'league') {
    return {
      title: `League ${file.view ?? `custom ${file.side ? `${file.side} ` : ''}view`}`,
      detail: 'League-wide, for percentiles later',
    };
  }
  if (file.view === null) {
    const sets = carriedSets(file);
    return {
      // describeFile's "a custom hitters view", as a title.
      title: upperFirst(describeFile(file).replace(/^a /, '')),
      detail:
        sets.length === 0
          ? 'Carries none of the columns coverage counts'
          : `Carries ${listOf(
              sets.map(({ side, set, cell }) =>
                cell === 'on' ? dataSetName(side, set) : `part of ${dataSetName(side, set)}`,
              ),
            )}`,
    };
  }
  return { title: file.view, detail: VIEW_DESCRIPTIONS[file.view].carries };
}

const MANIFEST_ORDER = Object.keys(VIEW_MANIFESTS) as ViewId[];
/** OOTP's own views in manifest order, then the custom files in the order they came. */
const byManifest = (a: PendingFile, b: PendingFile) => {
  const rank = (file: PendingFile) =>
    file.routed.view === null ? MANIFEST_ORDER.length : MANIFEST_ORDER.indexOf(file.routed.view);
  return rank(a) - rank(b);
};

export interface FileGroup {
  title: string;
  /** What an empty group says; a group without it is left out when empty. */
  empty?: string;
  rows: PendingFile[];
}

/**
 * The files read, per side: a team file with rows on both sides, such as a bio view, apart,
 * then the league files and the capture, then the files the app can't use.
 */
export function fileGroups(files: readonly PendingFile[]): FileGroup[] {
  const team = (side: Side | null) =>
    files
      .filter(
        (file) =>
          file.routed.scope === 'team' &&
          file.routed.routing === 'primary' &&
          file.routed.side === side,
      )
      .sort(byManifest);
  return [
    { title: 'Hitters', empty: 'No hitter view yet.', rows: team('hitters') },
    { title: 'Pitchers', empty: 'No pitcher view yet.', rows: team('pitchers') },
    { title: 'Hitters and pitchers', rows: team(null) },
    {
      title: 'Also read',
      rows: files
        .filter(
          (file) =>
            file.routed.routing === 'supplemental' ||
            (file.routed.scope === 'league' && file.routed.routing !== 'rejected'),
        )
        .sort(byManifest),
    },
    { title: 'Not used', rows: files.filter((file) => file.routed.routing === 'rejected') },
  ];
}

/**
 * Best first upload's sets of one layer, or bio for none: each with its heading and OOTP's
 * own views that carry it on either side.
 */
export function layerSets(layer: Layer | null): { set: DataSet; label: string; views: ViewId[] }[] {
  return DATA_SETS.filter((set) => DATA_SET_INFO[set].layer === layer).map((set) => {
    const { label, views } = DATA_SET_INFO[set];
    const labels = [...new Set([label.hitters, label.pitchers])];
    return {
      set,
      label: upperFirst(listOf(labels.map((text) => text.toLowerCase()))),
      views: [...new Set([...views.hitters, ...views.pitchers])],
    };
  });
}

/** The review's first snapshot: "25 players, 9 of 10 data sets". */
export const snapshotLine = ({ hitters, pitchers, dataSets }: ExportSummary) =>
  `${hitters + pitchers} players, ${dataSets.found} of ${dataSets.total} data sets`;

/** What the files filled in last time, so a field they filled can be filled again. */
export type Prefilled = Pick<TeamSettings, 'name' | 'league'>;

export const NOTHING_PREFILLED: Prefilled = { name: '', league: '' };

/**
 * Fills the team and league from the files. A field keeps what was typed in it; one that is
 * empty, or still holds what the files filled in before, follows the files, even to empty.
 */
export function prefill<T extends Prefilled>(
  settings: T,
  summary: ExportSummary,
  before: Prefilled = NOTHING_PREFILLED,
): { settings: T; prefilled: Prefilled } {
  const prefilled = { name: summary.teamName ?? '', league: summary.leagueColumn ?? '' };
  const follow = (field: keyof Prefilled) =>
    settings[field] === '' || settings[field] === before[field];
  return {
    settings: {
      ...settings,
      name: follow('name') ? prefilled.name : settings.name,
      league: follow('league') ? prefilled.league : settings.league,
    },
    prefilled,
  };
}

const SCOUTING: Record<string, string> = {
  'V.Low': 'very low',
  Low: 'low',
  Normal: 'normal',
  High: 'high',
  'V.High': 'very high',
};

/** "V.High" → "very high". */
export const scoutingAccuracyLabel = (value: string) => SCOUTING[value] ?? value.toLowerCase();
