import { readFileSync, readdirSync } from 'node:fs';

import { routeExport, type ExportRow, type RoutedExport, type Snapshot } from '../src/index.ts';

/** The repository's fixtures/ directory. */
export const FIXTURES = new URL('../../../fixtures/', import.meta.url);

/** Path of a Seattle team screen view, such as 'pitching_stats_1'. */
export const teamView = (view: string) =>
  `seattle-g42/seattle_arrows_lineups_-_overview_${view}.csv`;

/** Path of a league sortable-stats file, such as 'pitching_superstats_1'. */
export const leagueView = (view: string) =>
  `seattle-g42/rsl_statistics_player_statistics_-_sortable_stats_${view}.csv`;

export type FixtureRow = Record<string, string>;

/** A fixture file's text, byte for byte. */
export const readFixtureText = (path: string) => readFileSync(new URL(path, FIXTURES), 'utf8');

/** The CSV files directly in a fixture folder, such as 'seattle-g53/', sorted by name. */
export const fixtureFiles = (folder: string): string[] =>
  readdirSync(new URL(folder, FIXTURES), { encoding: 'utf8' })
    .filter((file) => file.endsWith('.csv'))
    .sort()
    .map((file) => `${folder}${file}`);

/** A fixture routed under its own file name, as an upload would be. */
export const routeFixture = (path: string): RoutedExport =>
  routeExport(path.split('/').at(-1) ?? path, readFixtureText(path));

const text = (value: unknown) => (typeof value === 'string' ? value : '');

/** A row's team and name, "Seattle|Han-lee Choi", or "|Hajime Ito" without TM. */
export const playerKey = (row: ExportRow) => `${text(row.TM)}|${text(row.Name)}`;

/** A table's rows in team-and-name order, to compare tables whatever order files came in. */
export const byPlayer = (rows: readonly ExportRow[]): ExportRow[] =>
  [...rows].sort((a, b) => playerKey(a).localeCompare(playerKey(b)));

/**
 * Reads a fixture CSV into rows keyed by header. The exports quote nothing and no value
 * holds a comma, so splitting on commas is exact; a quote would make this throw.
 */
export function readFixture(path: string): FixtureRow[] {
  const text = readFixtureText(path);
  if (text.includes('"')) {
    throw new Error(`${path} quotes a value; use a real CSV parser`);
  }
  const [header = '', ...lines] = text.split(/\r?\n/).filter((line) => line !== '');
  const columns = header.split(',');
  return lines.map((line) => {
    const cells = line.split(',');
    return Object.fromEntries(columns.map((column, i) => [column, cells[i] ?? '']));
  });
}

/** The raw cell for one player, found by name. */
export function rawCell(path: string, name: string, column: string): string {
  const row = readFixture(path).find((candidate) => candidate.Name === name);
  if (row?.[column] === undefined) {
    throw new Error(`${path} has no ${column} for ${name}`);
  }
  return row[column];
}

/** Rewrites one player's cell in a CSV export, keeping its CRLF line endings. */
export function editCell(text: string, name: string, column: string, value: string): string {
  const lines = text.split('\r\n');
  const header = (lines[0] ?? '').split(',');
  const nameAt = header.indexOf('Name');
  const at = header.indexOf(column);
  return lines
    .map((line, i) => {
      const cells = line.split(',');
      if (i === 0 || cells[nameAt] !== name) {
        return line;
      }
      cells[at] = value;
      return cells.join(',');
    })
    .join('\r\n');
}

/** A snapshot without its stored file ids, which differ from store to store. */
export function withoutFileIds(snapshot: Snapshot): Snapshot {
  return {
    ...snapshot,
    files: snapshot.files.map((file) => {
      const copy = { ...file };
      delete copy.id;
      return copy;
    }),
  };
}
