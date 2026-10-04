import { RATING_COLUMNS } from '../ratings/columns.ts';
import { measureCoverage, type Coverage } from './coverage.ts';
import { scaleBounds, toTwentyEighty, type RatingScale } from '../ratings/scale.ts';
import { importLeague } from './league.ts';
import { VIEW_MANIFESTS, type Side, type ViewId } from './manifest.ts';
import type { ExportRow, RoutedExport } from './route.ts';
import {
  DEFAULT_IDENTITY_TOLERANCES,
  validateSnapshot,
  type IdentityTolerances,
  type SnapshotEvent,
} from './validate.ts';

/** One snapshot of a team: its players, the league's, and what the import found. */
export interface Snapshot {
  /** "Game 42": the most games any hitter has played. Null without a hitter stats view. */
  label: string | null;
  gameNumber: number | null;
  scale: RatingScale;
  /** One row per player on each side, joined across the team views, ratings on 20–80. */
  hitters: ExportRow[];
  pitchers: ExportRow[];
  league: { hitters: ExportRow[]; pitchers: ExportRow[] };
  /** The badge, the matrices and what to upload next. */
  coverage: Coverage;
  events: SnapshotEvent[];
}

export interface SnapshotSettings {
  /** The league's display scale for ratings, from the team settings. */
  scale: RatingScale;
  tolerances?: IdentityTolerances;
}

const nameOf = (row: ExportRow) => (typeof row.Name === 'string' ? row.Name : '');

/**
 * Assembles one snapshot from its routed files: Knowledge Base › Import contract › Joins and
 * snapshots. Team views join on name within each side, the hitter capture adding DEF Pot;
 * ratings move to 20–80; the league files join into league tables; and the files are
 * validated against each other, and their coverage is measured. Rejected files are left
 * out.
 */
export function assembleSnapshot(
  files: readonly RoutedExport[],
  settings: SnapshotSettings,
): Snapshot {
  const events = validateSnapshot(files, {
    ratingScale: scaleBounds(settings.scale),
    tolerances: settings.tolerances ?? DEFAULT_IDENTITY_TOLERANCES,
  });
  const league = importLeague(files);
  events.push(...league.events);

  const stored = (side: Side) =>
    joinSide(files, side).map((row) => toStoredRatings(row, settings.scale));
  const hitters = stored('hitters');
  const pitchers = stored('pitchers');
  const games = hitters.flatMap((row) => (typeof row.G === 'number' ? [row.G] : []));
  const gameNumber = games.length > 0 ? Math.max(...games) : null;
  if (gameNumber === null) {
    events.push({
      level: 'warning',
      code: 'no-game-number',
      message: 'No hitter stats view, so the snapshot has no game number.',
      view: 'batting_stats_1',
      scope: 'team',
    });
  }
  return {
    label: gameNumber === null ? null : `Game ${gameNumber}`,
    gameNumber,
    scale: settings.scale,
    hitters,
    pitchers,
    league: { hitters: league.hitters, pitchers: league.pitchers },
    coverage: measureCoverage(files),
    events,
  };
}

/** One row per player of a side, joined by name in manifest order; the first value wins. */
function joinSide(files: readonly RoutedExport[], side: Side): ExportRow[] {
  const order = Object.keys(VIEW_MANIFESTS) as ViewId[];
  const sources = files
    .filter((file) => file.scope === 'team' && file.side === side && file.routing !== 'rejected')
    .sort((a, b) => {
      // Primary views first, in manifest order; the supplemental capture last.
      const rank = (file: RoutedExport) =>
        (file.routing === 'supplemental' ? order.length : 0) +
        order.indexOf(file.view ?? 'default');
      return rank(a) - rank(b);
    });
  const players = new Map<string, ExportRow>();
  for (const file of sources) {
    for (const row of file.rows) {
      const joined = players.get(nameOf(row)) ?? {};
      for (const [column, value] of Object.entries(row)) {
        if (!(column in joined)) {
          joined[column] = value;
        }
      }
      players.set(nameOf(row), joined);
    }
  }
  return [...players.values()];
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
