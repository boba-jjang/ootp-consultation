import { RATING_COLUMNS } from '../ratings/columns.ts';
import { measureCoverage, type Coverage } from './coverage.ts';
import { scaleBounds, toTwentyEighty, type RatingScale } from '../ratings/scale.ts';
import { importLeague, importTeam } from './league.ts';
import type { Side, ViewId } from './manifest.ts';
import {
  carriesPlateAppearances,
  seasonFiles,
  type ExportRow,
  type ImportEvent,
  type Routing,
  type RoutedExport,
  type Scope,
  type Split,
} from './route.ts';
import {
  DEFAULT_IDENTITY_TOLERANCES,
  checkSplits,
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
  /** vs left or vs right for a split export; null for a season file. */
  split: Split | null;
  routing: Routing;
  /** Players the file listed; none for a rejected file. */
  players: number;
  events: ImportEvent[];
}

/**
 * One hand's split tables: Knowledge Base › Import contract › Split exports. Built like the
 * season tables, from that hand's split files that carry PA or BF.
 */
export interface SplitTables {
  /** Team rows, ratings on 20–80 like the season's. */
  hitters: ExportRow[];
  pitchers: ExportRow[];
  league: { hitters: ExportRow[]; pitchers: ExportRow[] };
}

/** One snapshot of a team: its players, the league's, and what the import found. */
export interface Snapshot {
  /**
   * "Game 42": the most games any hitter has played in the season files. Null when no season
   * file gives hitters' G.
   */
  label: string | null;
  gameNumber: number | null;
  scale: RatingScale;
  /**
   * One row per player on each side, merged across the season team files, ratings on 20–80.
   * Split files never fill these tables.
   */
  hitters: ExportRow[];
  pitchers: ExportRow[];
  league: { hitters: ExportRow[]; pitchers: ExportRow[] };
  /** The vs-left (L) and vs-right (R) tables from the split files; null without a split file. */
  splits: Record<Split, SplitTables> | null;
  /** The badge, the matrices and what to upload next, from the season files. */
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

/** The four tables of whichever files are given, merged in the order given. */
function tablesOf(files: readonly RoutedExport[]) {
  const team = importTeam(files);
  const league = importLeague(files);
  return {
    hitters: team.hitters,
    pitchers: team.pitchers,
    league: { hitters: league.hitters, pitchers: league.pitchers },
    events: [...team.events, ...league.events],
  };
}

/**
 * A snapshot's four season tables, ratings still on the league's scale: Knowledge Base ›
 * Import contract › Joins and snapshots. Every season file fills them in the order given,
 * which is upload order: a player's row merges every file that lists him and keeps the place
 * where he first appeared, a later differing value replaces an earlier one with a warning,
 * and a blank never replaces a value. Split files never merge into them.
 */
export function mergeTables(files: readonly RoutedExport[]) {
  return tablesOf(seasonFiles(files));
}

/**
 * The vs-left and vs-right tables, ratings still on the league's scale: › Split exports. Each
 * hand's split files that carry PA or BF fill its four tables, merged as the season's are;
 * the superstats splits fill none. Null when no file is a split. The merging's events carry
 * their hand.
 */
function mergeSplitTables(files: readonly RoutedExport[]) {
  if (!files.some((file) => file.split !== null)) {
    return null;
  }
  const events: SnapshotEvent[] = [];
  const hand = (split: Split): SplitTables => {
    const { events: merged, ...tables } = tablesOf(
      files.filter((file) => file.split === split && carriesPlateAppearances(file)),
    );
    events.push(...merged.map((event) => ({ ...event, split })));
    return tables;
  };
  return { tables: { L: hand('L'), R: hand('R') }, events };
}

/**
 * Assembles one snapshot from its routed files: the four season tables merged cell by cell,
 * then validated, ratings moved to 20–80 and coverage measured, all from the season files.
 * The split files fill the split tables, checked against the season. Rejected files are left
 * out.
 */
export function assembleSnapshot(
  files: readonly RoutedExport[],
  settings: SnapshotSettings,
): Snapshot {
  const season = seasonFiles(files);
  const tables = mergeTables(season);
  const events = [
    ...tables.events,
    ...validateSnapshot(tables, season, {
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
  const splits = mergeSplitTables(files);
  if (splits) {
    events.push(...splits.events, ...checkSplits(tables, splits.tables));
  }
  const storedSplit = (split: SplitTables): SplitTables => ({
    hitters: stored(split.hitters),
    pitchers: stored(split.pitchers),
    league: split.league,
  });
  return {
    label: gameNumber === null ? null : `Game ${gameNumber}`,
    gameNumber,
    scale: settings.scale,
    hitters: stored(tables.hitters),
    pitchers: stored(tables.pitchers),
    league: tables.league,
    splits: splits && { L: storedSplit(splits.tables.L), R: storedSplit(splits.tables.R) },
    coverage: measureCoverage(season),
    files: files.map((file) => ({
      name: file.name,
      view: file.view,
      side: file.side,
      scope: file.scope,
      split: file.split,
      routing: file.routing,
      players: file.rows.length,
      events: file.events,
    })),
    events,
  };
}

/**
 * The most games any team hitter has played in the season files: the game number that dates
 * a snapshot. A split file's G counts games against one hand, so it never dates one.
 */
export function gameNumberOf(files: readonly RoutedExport[]): number | null {
  return mostGames(importTeam(seasonFiles(files)).hitters);
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
