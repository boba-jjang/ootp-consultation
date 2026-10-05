import { measureCoverage } from './coverage.ts';
import type { ExportRow, RoutedExport } from './route.ts';

/**
 * What a set of exports says about the team, for the Create a Team flow to prefill and
 * show (docs/design-handoff.md › Team setup, and the "files read" board).
 */
export interface ExportSummary {
  /** From the team file names: "seattle_arrows_lineups_-_overview_…" names the Seattle Arrows. */
  teamName: string | null;
  /** The file-name prefix the team name came from. */
  filePrefix: string | null;
  /** The TM column of the team views, when they carry one and agree. */
  teamColumn: string | null;
  /** The LG column of the team views, when they carry one and agree. */
  leagueColumn: string | null;
  hitters: number;
  pitchers: number;
  /** The most games any hitter has played: the snapshot's game. */
  gameNumber: number | null;
  /** SctAcc from the default view, as the export spells it ("V.High"). */
  scoutingAccuracy: string | null;
  /** Team views recognized, the supplemental capture and league files apart. */
  viewsRecognized: number;
  /** Files that could not be used, with the importer's reason. */
  rejected: { name: string; reason: string }[];
}

const TEAM_FILE = '_lineups_-_overview_';

/** "seattle_arrows" → "Seattle Arrows". */
const titleCase = (prefix: string) =>
  prefix
    .split('_')
    .filter((word) => word !== '')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

/** The one value a text column takes across rows, or null when it varies or is absent. */
function onlyValue(rows: readonly ExportRow[], column: string): string | null {
  const values = new Set<string>();
  for (const row of rows) {
    const value = row[column];
    if (typeof value === 'string' && value !== '') {
      values.add(value);
    }
  }
  return values.size === 1 ? ([...values][0] ?? null) : null;
}

/** The most common value of a list, or null when it's empty. */
function mostCommon(values: readonly string[]): string | null {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

export function describeExports(files: readonly RoutedExport[]): ExportSummary {
  const team = files.filter((file) => file.scope === 'team' && file.routing === 'primary');
  const rows = team.flatMap((file) => file.rows);
  const coverage = measureCoverage(files);
  const filePrefix = mostCommon(
    files
      .map((file) => file.name.split('/').at(-1) ?? file.name)
      .filter((name) => name.includes(TEAM_FILE))
      .map((name) => name.slice(0, name.indexOf(TEAM_FILE))),
  );
  const games = team
    .filter((file) => file.side === 'hitters')
    .flatMap((file) => file.rows.map((row) => row.G))
    .filter((value): value is number => typeof value === 'number');
  const defaultView = team.find((file) => file.view === 'default');
  return {
    teamName: filePrefix === null ? null : titleCase(filePrefix),
    filePrefix,
    teamColumn: onlyValue(rows, 'TM'),
    leagueColumn: onlyValue(rows, 'LG'),
    hitters: coverage.hitters.players.length,
    pitchers: coverage.pitchers.players.length,
    gameNumber: games.length > 0 ? Math.max(...games) : null,
    scoutingAccuracy: defaultView ? onlyValue(defaultView.rows, 'SctAcc') : null,
    viewsRecognized: coverage.views.onFile.length,
    rejected: files.flatMap((file) =>
      file.routing === 'rejected'
        ? [
            {
              name: file.name,
              reason:
                file.events.find((event) => event.level === 'error')?.message ??
                'The file could not be used.',
            },
          ]
        : [],
    ),
  };
}
