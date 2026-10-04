import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

import { parseTeamSettings, type TeamSettings } from '../team.ts';
import { IMPORTER_VERSION } from '../version.ts';
import { importUpload, type SnapshotStore, type Upload, type UploadResult } from './store.ts';

/**
 * Export team: a zip of every raw file plus the team settings, and the restore that
 * re-imports it (docs/implementation-plan.md › Database and auth). The Free plan has no
 * automatic backups, so this is the backup.
 *
 * Layout: team.json, then snapshots/<game number>/<original file name> for each raw file.
 */

/** Bump when the zip layout or team.json changes shape. */
export const TEAM_EXPORT_FORMAT = 1;

export interface TeamExport {
  team: TeamSettings;
  snapshots: { label: string; gameNumber: number; files: Upload[] }[];
}

interface Manifest {
  format: number;
  importerVersion: string;
  team: unknown;
  snapshots: { label: string; gameNumber: number; files: string[] }[];
}

/** The zip of a team: its settings and every stored raw file, verbatim. */
export async function exportTeam(
  store: SnapshotStore,
  teamId: string,
  team: TeamSettings,
): Promise<Uint8Array> {
  const entries: Record<string, Uint8Array> = {};
  const manifest: Manifest = {
    format: TEAM_EXPORT_FORMAT,
    importerVersion: IMPORTER_VERSION,
    team,
    snapshots: [],
  };
  for (const snapshot of await store.listSnapshots(teamId)) {
    const paths: string[] = [];
    for (const file of await store.listFiles(snapshot.id)) {
      const base = `snapshots/${snapshot.gameNumber}/${file.originalFilename.split('/').at(-1) ?? 'file.csv'}`;
      // Two stored files can share a name; keep both.
      let path = base;
      for (let copy = 2; path in entries; copy += 1) {
        path = base.replace(/(\.[^.]*)?$/, ` (${copy})$1`);
      }
      entries[path] = strToU8(file.content);
      paths.push(path);
    }
    manifest.snapshots.push({
      label: snapshot.label,
      gameNumber: snapshot.gameNumber,
      files: paths,
    });
  }
  entries['team.json'] = strToU8(`${JSON.stringify(manifest, null, 2)}\n`);
  return zipSync(entries);
}

export type TeamExportResult = { ok: true; value: TeamExport } | { ok: false; message: string };

/** Reads an Export team zip, checking its layout and team settings. */
export function readTeamExport(zip: Uint8Array): TeamExportResult {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(zip);
  } catch {
    return { ok: false, message: "The file isn't a zip." };
  }
  const raw = entries['team.json'];
  if (!raw) {
    return { ok: false, message: "The zip has no team.json, so it isn't an Export team file." };
  }
  let manifest: Manifest;
  try {
    manifest = JSON.parse(strFromU8(raw)) as Manifest;
  } catch {
    return { ok: false, message: "team.json isn't valid JSON." };
  }
  if (manifest.format !== TEAM_EXPORT_FORMAT) {
    return {
      ok: false,
      message: `The export uses format ${String(manifest.format)}; this app reads format ${TEAM_EXPORT_FORMAT}.`,
    };
  }
  const team = parseTeamSettings(manifest.team);
  if (!team.ok) {
    return {
      ok: false,
      message: `team.json has invalid team settings: ${Object.keys(team.errors).join(', ')}.`,
    };
  }
  const snapshots: TeamExport['snapshots'] = [];
  for (const snapshot of Array.isArray(manifest.snapshots) ? manifest.snapshots : []) {
    const files: Upload[] = [];
    for (const path of snapshot.files) {
      const content = entries[path];
      if (!content) {
        return { ok: false, message: `team.json lists ${path}, but the zip doesn't have it.` };
      }
      files.push({ name: path.split('/').at(-1) ?? path, text: strFromU8(content) });
    }
    snapshots.push({ label: snapshot.label, gameNumber: snapshot.gameNumber, files });
  }
  return { ok: true, value: { team: team.value, snapshots } };
}

/**
 * Re-imports an Export team into a team, snapshot by snapshot, through the same rules as an
 * upload: restoring twice changes nothing. The team row itself is the app's to create.
 */
export async function restoreTeam(
  store: SnapshotStore,
  teamId: string,
  exported: TeamExport,
  options: { hash: (text: string) => Promise<string> },
): Promise<UploadResult[]> {
  const results: UploadResult[] = [];
  for (const snapshot of exported.snapshots) {
    const existing = (await store.listSnapshots(teamId)).find(
      (candidate) => candidate.gameNumber === snapshot.gameNumber,
    );
    const target =
      existing ?? (await store.createSnapshot(teamId, snapshot.label, snapshot.gameNumber));
    results.push(
      await importUpload(store, teamId, snapshot.files, {
        scale: exported.team.rating_scale,
        hash: options.hash,
        into: target.id,
      }),
    );
  }
  return results;
}
