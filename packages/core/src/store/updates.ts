import { gameNumberOf } from '../importer/snapshot.ts';
import type { Side } from '../importer/manifest.ts';
import { routeExport, type RoutedExport } from '../importer/route.ts';
import type { Upload } from './store.ts';

/**
 * Updating a team's exports: Knowledge Base › Import contract › Joins and snapshots. A later
 * date adds a snapshot, and files from different dates are never merged into one snapshot.
 * importUpload never removes a stored file: a re-export's values replace earlier ones cell
 * by cell when the snapshot is assembled. These helpers serve the screens' file lists and
 * explicit Replace, which still treat a later export of one of OOTP's views as replacing
 * the earlier one.
 */

/** A file a set of uploads keeps, routed. */
export interface PendingUpload {
  upload: Upload;
  routed: RoutedExport;
}

export interface CollectedUploads {
  /** The files that would be stored, in the order they were added. */
  kept: PendingUpload[];
  /** Each earlier file that a later export of the same view replaced, and the file that did. */
  replaced: { upload: Upload; by: Upload }[];
}

type Routed = Pick<RoutedExport, 'view' | 'scope' | 'routing'> & { side?: Side | null };

/**
 * The replacement key: the same view, scope and routing. A rejected file, or one without a
 * known view, has none, so it never replaces another file and is never replaced.
 */
export function replacementKey(file: Routed): string | null {
  return file.routing === 'rejected' || file.view === null
    ? null
    : `${file.view}|${file.scope ?? ''}|${file.routing}`;
}

/**
 * Routes a set of pending uploads for the screens' file list: an identical file (the same
 * name and text) counts once, and a later file with the same replacement key replaces the
 * earlier one.
 */
export function collectUploads(uploads: readonly Upload[]): CollectedUploads {
  const seen = new Set<string>();
  const kept: PendingUpload[] = [];
  const replaced: CollectedUploads['replaced'] = [];
  for (const upload of uploads) {
    const identity = `${upload.name}\n${upload.text}`;
    if (seen.has(identity)) {
      continue;
    }
    seen.add(identity);
    const routed = routeExport(upload.name, upload.text);
    const key = replacementKey(routed);
    const earlier =
      key === null ? -1 : kept.findIndex((pending) => replacementKey(pending.routed) === key);
    const gone = earlier >= 0 ? kept.splice(earlier, 1)[0] : undefined;
    if (gone) {
      // A file replaced earlier now names the file that stayed.
      for (const entry of replaced) {
        if (entry.by === gone.upload) {
          entry.by = upload;
        }
      }
      replaced.push({ upload: gone.upload, by: upload });
    }
    kept.push({ upload, routed });
  }
  return { kept, replaced };
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
  if (replacementKey(candidate) !== replacementKey(stored)) {
    return `This file is ${describeFile(candidate)}, not ${describeFile(stored)}.`;
  }
  const game = gameNumberOf([candidate]);
  if (game !== null && game !== snapshotGame) {
    return `This export is from game ${game}, not game ${snapshotGame}. Use Add data instead: it goes to the Game ${game} snapshot.`;
  }
  return null;
}
