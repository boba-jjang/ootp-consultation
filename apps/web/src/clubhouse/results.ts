import {
  describeFile,
  describeSplit,
  type ImportedFile,
  type UploadResult,
  type UploadedFile,
} from '@ootp/core';

/** A successful upload's result. */
export type Uploaded = Extract<UploadResult, { ok: true }>;

/** What happened to one file, as the results list says it. */
export function outcomeOf(file: UploadedFile): string {
  if (file.routing === 'rejected') {
    const reason = file.events.find((event) => event.level === 'error')?.message;
    return reason ? `not used: ${reason}` : 'not used: the app can’t read it';
  }
  const what = describeFile(file);
  switch (file.outcome) {
    case 'added':
      return `added as ${what}`;
    case 'replaced':
      return `replaced the earlier copy of ${what}`;
    case 'unchanged':
      return 'already on file';
  }
}

/**
 * The results list's first line: how many files were read and, when they went to a snapshot
 * other than the one the upload started from (null for a team with no snapshot), which.
 */
export function resultsHeading(result: Uploaded, from: string | null): string {
  const count = `${String(result.files.length)} ${result.files.length === 1 ? 'file' : 'files'} read.`;
  if (result.created) {
    return `${count} Started the ${result.snapshot.label} snapshot.`;
  }
  return result.snapshot.id === from
    ? count
    : `${count} Added to the ${result.snapshot.label} snapshot.`;
}

/** Where the import sent a file of the snapshot, as the import log's line says it. */
export function routeOf(file: ImportedFile): string {
  if (file.routing === 'rejected') {
    return `Not used: ${file.events.find((event) => event.level === 'error')?.message ?? 'the file could not be read'}`;
  }
  if (file.routing === 'supplemental') {
    return 'Supplemental: DEF Pot for the hitters, from the pitching ratings view';
  }
  const split = describeSplit(file);
  const route =
    file.scope === 'league'
      ? `League file: ${file.view ?? 'unknown view'}`
      : `Routed to ${file.view ?? 'unknown view'}, ${file.side ?? 'either side'}`;
  return split ? `${route}, ${split}` : route;
}
