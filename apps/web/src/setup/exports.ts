import {
  collectUploads,
  describeExports,
  measureCoverage,
  type Coverage,
  type ExportSummary,
  type RoutedExport,
  type TeamSettings,
  type Upload,
} from '@ootp/core';

/** A file Create team would store, routed in the browser. */
export interface PendingFile {
  /** Stable while the file stays in the set: for list keys and Remove. */
  key: string;
  upload: Upload;
  routed: RoutedExport;
  /** The earlier file of the same view this one replaced, by name. */
  replaced: string | null;
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
 * counts once, and a later export of a view replaces the earlier one, which leaves the set.
 */
export function addExports(current: ReadExports, added: readonly Upload[]): ReadExports {
  const keys = new Map(current.files.map((file) => [file.upload, file.key]));
  const notes = new Map(current.files.map((file) => [file.upload, file.replaced]));
  let next = current.next;
  const { kept, replaced } = collectUploads([...current.uploads, ...added]);
  for (const entry of replaced) {
    notes.set(entry.by, entry.upload.name);
  }
  const files = kept.map(({ upload, routed }) => {
    let key = keys.get(upload);
    if (key === undefined) {
      key = `file-${String(next)}`;
      next += 1;
    }
    return { key, upload, routed, replaced: notes.get(upload) ?? null };
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
