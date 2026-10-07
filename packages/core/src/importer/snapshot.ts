import { RATING_COLUMNS } from '../ratings/columns.ts';
import { measureCoverage, type Coverage } from './coverage.ts';
import { scaleBounds, toTwentyEighty, type RatingScale } from '../ratings/scale.ts';
import { importLeague, mergeRow, mergingTable, rowsOf } from './league.ts';
import type { Side, ViewId } from './manifest.ts';
import {
  positionSide,
  type ExportRow,
  type ImportEvent,
  type Routing,
  type RoutedExport,
  type Scope,
} from './route.ts';
import {
  DEFAULT_IDENTITY_TOLERANCES,
  validateSnapshot,
  type IdentityTolerances,
  type SnapshotEvent,
} from './validate.ts';

/** One file of a snapshot and how the import treated it: a line of the import log. */
export interface ImportedFile {
  /** The stored file's id, when the snapshot was read from the store. */
  id?: string;
  name: string;
  view: ViewId | null;
  side: Side | null;
  scope: Scope | null;
  routing: Routing;
  /** Players the file listed; none for a rejected file. */
  players: number;
  events: ImportEvent[];
}

/** One snapshot of a team: its players, the league's, and what the import found. */
export interface Snapshot {
  /** "Game 42": the most games any hitter has played. Null when no file gives hitters' G. */
  label: string | null;
  gameNumber: number | null;
  scale: RatingScale;
  /** One row per player on each side, merged across the team files, ratings on 20–80. */
  hitters: ExportRow[];
  pitchers: ExportRow[];
  league: { hitters: ExportRow[]; pitchers: ExportRow[] };
  /** The badge, the matrices and what to upload next. */
  coverage: Coverage;
  /** The import log: every file, used or not, in upload order. */
  files: ImportedFile[];
  events: SnapshotEvent[];
}

export interface SnapshotSettings {
  /** The league's display scale for ratings, from the team settings. */
  scale: RatingScale;
  tolerances?: IdentityTolerances;
}

const nameOf = (row: ExportRow) => (typeof row.Name === 'string' ? row.Name : '');

/** The team's two tables, merged by name across the team files in the order given. */
function teamTables(files: readonly RoutedExport[]) {
  const events: SnapshotEvent[] = [];
  const tables = { hitters: mergingTable(), pitchers: mergingTable() };
  for (const file of files) {
    if (file.scope !== 'team' || file.routing === 'rejected') {
      continue;
    }
    for (const row of file.rows) {
      // A file with rows on both sides, such as the bio view, places each row by its POS.
      const side = file.side ?? positionSide(row.POS);
      if (side !== undefined) {
        mergeRow(tables[side], nameOf(row), row, file, 'team', events);
      }
    }
  }
  return {
    hitters: rowsOf(tables.hitters, 'hitters'),
    pitchers: rowsOf(tables.pitchers, 'pitchers'),
    events,
  };
}

/**
 * A snapshot's four tables, ratings still on the league's scale: Knowledge Base › Import
 * contract › Joins and snapshots. Every file fills them in the order given, which is upload
 * order: a player's row merges every file that lists him and keeps the place where he first
 * appeared, and a later differing value replaces an earlier one with a warning.
 */
export function mergeTables(files: readonly RoutedExport[]) {
  const team = teamTables(files);
  const league = importLeague(files);
  return {
    hitters: team.hitters,
    pitchers: team.pitchers,
    league: { hitters: league.hitters, pitchers: league.pitchers },
    events: [...team.events, ...league.events],
  };
}

/**
 * Assembles one snapshot from its routed files: the four tables merged cell by cell, then
 * validated, ratings moved to 20–80 and coverage measured. Rejected files are left out.
 */
export function assembleSnapshot(
  files: readonly RoutedExport[],
  settings: SnapshotSettings,
): Snapshot {
  const tables = mergeTables(files);
  const events = [
    ...tables.events,
    ...validateSnapshot(tables, files, {
      ratingScale: scaleBounds(settings.scale),
      tolerances: settings.tolerances ?? DEFAULT_IDENTITY_TOLERANCES,
    }),
  ];
  const stored = (rows: readonly ExportRow[]) =>
    rows.map((row) => toStoredRatings(row, settings.scale));
  const gameNumber = mostGames(tables.hitters);
  if (gameNumber === null) {
    events.push({
      level: 'warning',
      code: 'no-game-number',
      message: "No file gives the hitters' games played (G), so the snapshot has no game number.",
      view: null,
      scope: 'team',
    });
  }
  return {
    label: gameNumber === null ? null : `Game ${gameNumber}`,
    gameNumber,
    scale: settings.scale,
    hitters: stored(tables.hitters),
    pitchers: stored(tables.pitchers),
    league: tables.league,
    coverage: measureCoverage(files),
    files: files.map((file) => ({
      name: file.name,
      view: file.view,
      side: file.side,
      scope: file.scope,
      routing: file.routing,
      players: file.rows.length,
      events: file.events,
    })),
    events,
  };
}

/** The most games any team hitter has played: the game number that dates a snapshot. */
export function gameNumberOf(files: readonly RoutedExport[]): number | null {
  return mostGames(teamTables(files).hitters);
}

function mostGames(hitters: readonly ExportRow[]): number | null {
  const games = hitters.flatMap((row) => (typeof row.G === 'number' ? [row.G] : []));
  return games.length > 0 ? Math.max(...games) : null;
}

function toStoredRatings(row: ExportRow, scale: RatingScale): ExportRow {
  return Object.fromEntries(
    Object.entries(row).map(([column, value]) => [
      column,
      RATING_COLUMNS.has(column) && typeof value === 'number'
        ? toTwentyEighty(value, scale)
        : value,
    ]),
  );
}
