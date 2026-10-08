import { gameNumberOf } from '../importer/snapshot.ts';
import type { Side } from '../importer/manifest.ts';
import { routeExport, type RoutedExport } from '../importer/route.ts';
import type { Upload } from './store.ts';

/**
 * Updating a team's exports: Knowledge Base › Import contract › Joins and snapshots. A later
 * date adds a snapshot, and files from different dates are never merged into one snapshot.
 * Uploading never removes a file: a re-export's values replace earlier ones cell by cell
 * when the snapshot is assembled, and a blank never replaces a value. These helpers serve
 * the screens' file lists and the Clubhouse's explicit Replace.
 */

/** A file a set of uploads keeps, routed. */
export interface PendingUpload {
  upload: Upload;
  routed: RoutedExport;
}

export interface CollectedUploads {
  /** The files that would be stored, in the order they were added. */
  kept: PendingUpload[];
}

type Routed = Pick<RoutedExport, 'view' | 'scope' | 'routing'> & { side?: Side | null };

/**
 * A file's replacement key, measured against the file it would replace: the view, scope and
 * routing when both files have a known view, and otherwise the side, scope and routing, so a
 * custom hitters team file matches only another hitters team file. A rejected file has
 * none, so it never replaces another file and is never replaced.
 */
export function replacementKey(file: Routed, other: Routed): string | null {
  if (file.routing === 'rejected') {
    return null;
  }
  const kind = file.view !== null && other.view !== null ? file.view : (file.side ?? '');
  return `${kind}|${file.scope ?? ''}|${file.routing}`;
}

/**
 * Routes a set of pending uploads for the screens' file list, as importUpload would store
 * them: every distinct file stays, and an identical one (the same name and text) counts once.
 */
export function collectUploads(uploads: readonly Upload[]): CollectedUploads {
  const seen = new Set<string>();
  const kept: PendingUpload[] = [];
  for (const upload of uploads) {
    const identity = `${upload.name}\n${upload.text}`;
    if (!seen.has(identity)) {
      seen.add(identity);
      kept.push({ upload, routed: routeExport(upload.name, upload.text) });
    }
  }
  return { kept };
}

/**
 * What a routed file is, in the words the reasons below use: a known view by its name, any
 * other file as a custom view of its scope and side.
 */
export function describeFile(file: Routed): string {
  if (file.routing === 'rejected') {
    return 'a file the app can’t read';
  }
  if (file.routing === 'supplemental') {
    return `${file.view ?? 'a custom pitchers view'} run on the hitters`;
  }
  const view = file.view ?? `custom ${file.side ? `${file.side} ` : ''}view`;
  if (file.scope === 'league') {
    return `the league’s ${view}`;
  }
  return file.view ?? `a ${view}`;
}

/**
 * Whether a chosen file may replace a stored one in its snapshot: null when it may, otherwise
 * the reason. It must share the stored file's replacement key, and a file that dates itself
 * (a hitter stats view) must come from the snapshot's game.
 */
export function replacementProblem(
  stored: Routed,
  snapshotGame: number,
  candidate: RoutedExport,
): string | null {
  if (candidate.routing === 'rejected') {
    return (
      candidate.events.find((event) => event.level === 'error')?.message ??
      'The app can’t read this file.'
    );
  }
  if (replacementKey(candidate, stored) !== replacementKey(stored, candidate)) {
    return `This file is ${describeFile(candidate)}, not ${describeFile(stored)}.`;
  }
  const game = gameNumberOf([candidate]);
  if (game !== null && game !== snapshotGame) {
    return `This export is from game ${game}, not game ${snapshotGame}. Use Add data instead: it goes to the Game ${game} snapshot.`;
  }
  return null;
}
