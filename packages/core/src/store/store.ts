import { assembleSnapshot, type Snapshot } from '../importer/snapshot.ts';
import type { Side, ViewId } from '../importer/manifest.ts';
import { routeExport, type ImportEvent, type Routing, type Scope } from '../importer/route.ts';
import type { RatingScale } from '../ratings/scale.ts';

/**
 * The team store: Knowledge Base › Architecture › Module contracts, Team store. A team keeps
 * dated snapshots, each holding raw export files verbatim with their import log; everything
 * else is re-derived from the raw files. The storage itself (Supabase in the app) sits
 * behind SnapshotStore, so these rules run anywhere.
 */

export interface StoredSnapshot {
  id: string;
  teamId: string;
  label: string;
  gameNumber: number;
}

/** A raw export file and how the importer routed it, as view_files stores it. */
export interface NewViewFile {
  originalFilename: string;
  content: string;
  sha256: string;
  detectedView: ViewId | null;
  side: Side | null;
  scope: Scope | null;
  routing: Routing;
  importerVersion: string;
}

export interface StoredViewFile extends NewViewFile {
  id: string;
}

export interface SnapshotStore {
  listSnapshots(teamId: string): Promise<StoredSnapshot[]>;
  createSnapshot(teamId: string, label: string, gameNumber: number): Promise<StoredSnapshot>;
  listFiles(snapshotId: string): Promise<StoredViewFile[]>;
  /** Stores a file with its import events. */
  addFile(
    snapshotId: string,
    file: NewViewFile,
    events: readonly ImportEvent[],
  ): Promise<StoredViewFile>;
  removeFiles(ids: readonly string[]): Promise<void>;
}

/** One uploaded file: its name and its text. */
export interface Upload {
  name: string;
  text: string;
}

export interface UploadOptions {
  /** The league's display scale, from the team settings. */
  scale: RatingScale;
  /** SHA-256 of a file's text, as lowercase hex (Web Crypto in the browser). */
  hash: (text: string) => Promise<string>;
  /**
   * The snapshot to add to when the upload can't be dated, because it has no hitter stats
   * view. An upload that can be dated always goes to its own game's snapshot.
   */
  into?: string;
}

export interface UploadedFile {
  name: string;
  /** The known view the header matches, or null; with the scope and side the rows read as. */
  view: ViewId | null;
  scope: Scope | null;
  /**
   * Null for a rejected file, or a team file with rows on both sides. importUpload always
   * sets it; it is optional so results built before it existed still type-check.
   */
  side?: Side | null;
  routing: Routing;
  /**
   * Added, or already stored byte for byte. Uploading never removes a stored file, so the
   * importer no longer produces replaced; a re-export's values replace earlier ones cell by
   * cell when the snapshot is assembled.
   */
  outcome: 'added' | 'replaced' | 'unchanged';
  events: ImportEvent[];
}

export type UploadResult =
  | { ok: true; snapshot: StoredSnapshot; created: boolean; files: UploadedFile[] }
  | { ok: false; reason: 'no-game-number' | 'unknown-snapshot'; message: string };

/**
 * Stores an upload. Its game number (the most games any hitter has played) dates it: the
 * team's snapshot for that game receives it, or a new one is created, so a later game adds
 * history. Within a snapshot, a file already stored byte for byte is left alone and every
 * other file is added: uploading never removes a stored file (Knowledge Base › Joins and
 * snapshots). Rejected files are kept so the import log can show why.
 */
export async function importUpload(
  store: SnapshotStore,
  teamId: string,
  uploads: readonly Upload[],
  options: UploadOptions,
): Promise<UploadResult> {
  const routed = uploads.map((upload) => ({
    upload,
    result: routeExport(upload.name, upload.text),
  }));
  const { gameNumber, label } = assembleSnapshot(
    routed.map(({ result }) => result),
    { scale: options.scale },
  );

  const snapshots = await store.listSnapshots(teamId);
  let snapshot: StoredSnapshot | undefined;
  let created = false;
  if (gameNumber !== null && label !== null) {
    snapshot = snapshots.find((candidate) => candidate.gameNumber === gameNumber);
    if (!snapshot) {
      snapshot = await store.createSnapshot(teamId, label, gameNumber);
      created = true;
    }
  } else if (options.into !== undefined) {
    snapshot = snapshots.find((candidate) => candidate.id === options.into);
    if (!snapshot) {
      return {
        ok: false,
        reason: 'unknown-snapshot',
        message: "The snapshot to add to isn't this team's.",
      };
    }
  } else {
    return {
      ok: false,
      reason: 'no-game-number',
      message:
        "Add a file with the hitters' games played (G), such as batting_stats_1 or batting_stats_2: they date the snapshot.",
    };
  }

  const stored = await store.listFiles(snapshot.id);
  const files: UploadedFile[] = [];
  for (const { upload, result } of routed) {
    const sha256 = await options.hash(upload.text);
    const summary = {
      name: upload.name,
      view: result.view,
      scope: result.scope,
      side: result.side,
      routing: result.routing,
      events: result.events,
    };
    if (stored.some((file) => file.sha256 === sha256)) {
      files.push({ ...summary, outcome: 'unchanged' });
      continue;
    }
    const file = await store.addFile(
      snapshot.id,
      {
        originalFilename: upload.name,
        content: upload.text,
        sha256,
        detectedView: result.view,
        side: result.side,
        scope: result.scope,
        routing: result.routing,
        importerVersion: result.importerVersion,
      },
      result.events,
    );
    stored.push(file);
    files.push({ ...summary, outcome: 'added' });
  }
  return { ok: true, snapshot, created, files };
}

/**
 * Re-reads a snapshot's stored raw files with the current importer and assembles them, so
 * every derived value follows the current rules.
 */
export async function loadSnapshot(
  store: SnapshotStore,
  snapshotId: string,
  scale: RatingScale,
): Promise<Snapshot> {
  const files = await store.listFiles(snapshotId);
  const snapshot = assembleSnapshot(
    files.map((file) => routeExport(file.originalFilename, file.content)),
    { scale },
  );
  // Each log row keeps its stored file's id, so a screen can replace or remove that file.
  return {
    ...snapshot,
    files: snapshot.files.map((file, index) => {
      const id = files[index]?.id;
      return id === undefined ? file : { ...file, id };
    }),
  };
}
