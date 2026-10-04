import { VIEW_MANIFESTS, type Side, type ViewId } from './manifest.ts';

/** Where a header falls short of its closest view, for the import log. */
interface Mismatch {
  closest: { view: ViewId; version: number };
  missing: string[];
  unexpected: string[];
}

export type Detection =
  | {
      ok: true;
      view: ViewId;
      /** The side the view is meant to list; snapshot validation checks the rows. */
      side: Side;
      /** The header version, 1 for the oldest. */
      version: number;
      /** False for an older export, which imports with a version warning. */
      current: boolean;
    }
  | { ok: false; reason: 'empty' | 'unrecognized'; message: string }
  | { ok: false; reason: 'duplicate-columns'; message: string; duplicates: string[] }
  | ({ ok: false; reason: 'mismatched'; message: string } & Mismatch);

/**
 * A header that shares less than this fraction of columns with every view is
 * unrecognized rather than a near miss of one.
 */
const MISMATCH_SIMILARITY = 0.5;

/** Reads a CSV export's header row: the first line, split on commas and trimmed. */
export function readHeader(text: string): string[] {
  const firstLine = text.replace(/^\uFEFF/, '').split(/\r?\n/, 1)[0] ?? '';
  return firstLine === '' ? [] : firstLine.split(',').map((column) => column.trim());
}

/**
 * Names the view and header version of an export from its header row alone. Columns are
 * matched by name, never by position, so their order doesn't matter. A file whose header
 * matches no version exactly is rejected with the reason the import log shows.
 */
export function detectView(header: readonly string[]): Detection {
  const columns = header.map((column) => column.trim()).filter((column) => column !== '');
  if (columns.length === 0) {
    return { ok: false, reason: 'empty', message: 'The file has no header row.' };
  }

  const duplicates = [...new Set(columns.filter((column, i) => columns.indexOf(column) !== i))];
  if (duplicates.length > 0) {
    return {
      ok: false,
      reason: 'duplicate-columns',
      message: `The header repeats ${duplicates.join(', ')}.`,
      duplicates,
    };
  }

  const given = new Set(columns);
  let best: (Mismatch & { similarity: number }) | undefined;
  for (const view of Object.keys(VIEW_MANIFESTS) as ViewId[]) {
    const versions: readonly (readonly string[])[] = VIEW_MANIFESTS[view].versions;
    versions.forEach((expected, index) => {
      const missing = expected.filter((column) => !given.has(column));
      const unexpected = columns.filter((column) => !expected.includes(column));
      const shared = expected.length - missing.length;
      const similarity = shared / (expected.length + unexpected.length);
      if (best === undefined || similarity > best.similarity) {
        best = { closest: { view, version: index + 1 }, missing, unexpected, similarity };
      }
    });
  }

  if (best?.missing.length === 0 && best.unexpected.length === 0) {
    const { view, version } = best.closest;
    return {
      ok: true,
      view,
      side: VIEW_MANIFESTS[view].side,
      version,
      current: version === VIEW_MANIFESTS[view].versions.length,
    };
  }
  if (best === undefined || best.similarity < MISMATCH_SIMILARITY) {
    return { ok: false, reason: 'unrecognized', message: 'The header matches no known view.' };
  }

  const { closest, missing, unexpected } = best;
  const details = [
    missing.length > 0 ? `Missing: ${missing.join(', ')}.` : '',
    unexpected.length > 0 ? `Unexpected: ${unexpected.join(', ')}.` : '',
  ].filter((part) => part !== '');
  return {
    ok: false,
    reason: 'mismatched',
    message: [
      `The header matches no known view. Closest: ${closest.view} v${closest.version}.`,
      ...details,
    ].join(' '),
    closest,
    missing,
    unexpected,
  };
}
