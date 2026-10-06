import { describeFile, type UploadResult, type UploadedFile } from '@ootp/core';

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
