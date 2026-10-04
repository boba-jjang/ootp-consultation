import type {
  ImportEvent,
  Routing,
  Scope,
  Side,
  SnapshotStore,
  StoredSnapshot,
  StoredViewFile,
  ViewId,
} from '@ootp/core';

import type { Json } from './database.types.ts';
import type { Client } from './supabase.ts';

/** SHA-256 of a file's text as lowercase hex, with Web Crypto. */
export async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

const FILE_COLUMNS =
  'id, original_filename, content, sha256, detected_view, side, scope, routing, importer_version';

/**
 * The team store on Supabase: snapshots, view_files and import_events, limited to the signed-in
 * owner by row-level security. Errors become exceptions with the action that failed.
 */
export function supabaseStore(client: Client): SnapshotStore {
  const fail = (action: string, message: string) => new Error(`Couldn't ${action}: ${message}`);

  return {
    async listSnapshots(teamId) {
      const { data, error } = await client
        .from('snapshots')
        .select('id, team_id, label, game_number')
        .eq('team_id', teamId)
        .order('game_number', { ascending: true });
      if (error) {
        throw fail('load the snapshots', error.message);
      }
      return data.map((row): StoredSnapshot => ({
        id: row.id,
        teamId: row.team_id,
        label: row.label,
        gameNumber: row.game_number,
      }));
    },

    async createSnapshot(teamId, label, gameNumber) {
      const { data, error } = await client
        .from('snapshots')
        .insert({ team_id: teamId, label, game_number: gameNumber })
        .select('id, team_id, label, game_number')
        .single();
      if (error) {
        throw fail('create the snapshot', error.message);
      }
      return { id: data.id, teamId: data.team_id, label: data.label, gameNumber: data.game_number };
    },

    async listFiles(snapshotId) {
      const { data, error } = await client
        .from('view_files')
        .select(FILE_COLUMNS)
        .eq('snapshot_id', snapshotId)
        .order('created_at', { ascending: true });
      if (error) {
        throw fail('load the files', error.message);
      }
      // The importer wrote these values, and the table's checks hold them to its vocabulary.
      return data.map((row): StoredViewFile => ({
        id: row.id,
        originalFilename: row.original_filename,
        content: row.content,
        sha256: row.sha256,
        detectedView: row.detected_view as ViewId | null,
        side: row.side as Side | null,
        scope: row.scope as Scope | null,
        routing: row.routing as Routing,
        importerVersion: row.importer_version,
      }));
    },

    async addFile(snapshotId, file, events: readonly ImportEvent[]) {
      const { data, error } = await client
        .from('view_files')
        .insert({
          snapshot_id: snapshotId,
          original_filename: file.originalFilename,
          content: file.content,
          sha256: file.sha256,
          detected_view: file.detectedView,
          side: file.side,
          scope: file.scope,
          routing: file.routing,
          importer_version: file.importerVersion,
        })
        .select('id')
        .single();
      if (error) {
        throw fail(`store ${file.originalFilename}`, error.message);
      }
      if (events.length > 0) {
        const logged = await client.from('import_events').insert(
          events.map((event) => ({
            view_file_id: data.id,
            level: event.level,
            code: event.code,
            message: event.message,
            details: (event.details ?? {}) as NonNullable<Json>,
          })),
        );
        if (logged.error) {
          throw fail(`log the import of ${file.originalFilename}`, logged.error.message);
        }
      }
      return { ...file, id: data.id };
    },

    async removeFiles(ids) {
      const { error } = await client.from('view_files').delete().in('id', ids);
      if (error) {
        throw fail('replace the earlier files', error.message);
      }
    },
  };
}
