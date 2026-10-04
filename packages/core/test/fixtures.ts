import { readFileSync } from 'node:fs';

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
