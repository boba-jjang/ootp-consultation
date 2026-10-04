import { createHash, randomUUID } from 'node:crypto';

import type {
  ImportEvent,
  NewViewFile,
  SnapshotStore,
  StoredSnapshot,
  StoredViewFile,
} from '../src/index.ts';

/** SHA-256 of a file's text, as the browser computes it with Web Crypto. */
export const sha256 = (text: string) =>
  Promise.resolve(createHash('sha256').update(text, 'utf8').digest('hex'));

/** A SnapshotStore kept in memory, standing in for Supabase in tests. */
export function memoryStore() {
  const snapshots: StoredSnapshot[] = [];
  const files = new Map<string, StoredViewFile>();
  /** The snapshot each file belongs to, by file id. */
  const owners = new Map<string, string>();
  const events = new Map<string, readonly ImportEvent[]>();

  const store: SnapshotStore = {
    listSnapshots: (teamId) =>
      Promise.resolve(snapshots.filter((snapshot) => snapshot.teamId === teamId)),
    createSnapshot: (teamId, label, gameNumber) => {
      const snapshot = { id: randomUUID(), teamId, label, gameNumber };
      snapshots.push(snapshot);
      return Promise.resolve(snapshot);
    },
    listFiles: (snapshotId) =>
      Promise.resolve([...files.values()].filter((file) => owners.get(file.id) === snapshotId)),
    addFile: (snapshotId, file: NewViewFile, fileEvents) => {
      const duplicate = [...files.values()].some(
        (stored) => owners.get(stored.id) === snapshotId && stored.sha256 === file.sha256,
      );
      if (duplicate) {
        // Mirrors the unique (snapshot_id, sha256) constraint.
        return Promise.reject(new Error('duplicate file in snapshot'));
      }
      const stored = { ...file, id: randomUUID() };
      files.set(stored.id, stored);
      owners.set(stored.id, snapshotId);
      events.set(stored.id, fileEvents);
      return Promise.resolve(stored);
    },
    removeFiles: (ids) => {
      for (const id of ids) {
        files.delete(id);
        owners.delete(id);
        events.delete(id);
      }
      return Promise.resolve();
    },
  };
  return { store, snapshots, files, events };
}
