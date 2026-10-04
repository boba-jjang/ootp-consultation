import type { Side, ViewId } from './manifest.ts';
import type { ExportRow, RoutedExport } from './route.ts';
import type { SnapshotEvent } from './validate.ts';

/**
 * League tables from the league sortable files: Knowledge Base › Import contract › Joins and
 * snapshots. Each side keeps its own table, so a name on both sides has a record on each.
 */
export interface LeagueTables {
  /** One row per qualified hitter, joined across the league batting files. */
  hitters: ExportRow[];
  /** One row per pitcher with appearances, joined across the league pitching files. */
  pitchers: ExportRow[];
  events: SnapshotEvent[];
}

const LEAGUE_FILES: Record<Side, readonly ViewId[]> = {
  hitters: ['batting_superstats_1', 'batting_superstats_2'],
  pitchers: ['pitching_superstats_1', 'pitching_superstats_2'],
};

const nameOf = (row: ExportRow) => (typeof row.Name === 'string' ? row.Name : '');

/**
 * Batting files join on team plus name. Pitching files have no team column, so they join on
 * name; a name listed twice can't be joined and is left out.
 */
const keyOf = (side: Side, row: ExportRow) =>
  side === 'hitters' ? `${typeof row.TM === 'string' ? row.TM : ''}|${nameOf(row)}` : nameOf(row);

/**
 * Joins the snapshot's league files into one table per side. Pitchers with G = 0 carry no
 * data and are dropped. A file that wasn't provided only leaves its columns out.
 */
export function importLeague(files: readonly RoutedExport[]): LeagueTables {
  const events: SnapshotEvent[] = [];
  const tables: LeagueTables = { hitters: [], pitchers: [], events };

  for (const side of ['hitters', 'pitchers'] as const) {
    const sources = LEAGUE_FILES[side].flatMap((view) => {
      const routed = files.find(
        (candidate) =>
          candidate.scope === 'league' &&
          candidate.view === view &&
          candidate.routing === 'primary',
      );
      return routed ? [{ view, rows: routed.rows }] : [];
    });

    // Names listed twice in any file can't be joined.
    const ambiguous = new Set<string>();
    for (const { view, rows } of sources) {
      const keys = rows.map((row) => keyOf(side, row));
      for (const [i, key] of keys.entries()) {
        if (keys.indexOf(key) !== i && !ambiguous.has(key)) {
          ambiguous.add(key);
          const name = nameOf(rows[i] ?? {});
          events.push({
            level: 'warning',
            code: 'duplicate-name',
            message: `${name} is listed more than once, so the league files can't be joined for that name.`,
            details: { name },
            view,
            scope: 'league',
          });
        }
      }
    }

    const joined = new Map<string, ExportRow>();
    for (const { view, rows } of sources) {
      for (const row of rows) {
        const key = keyOf(side, row);
        if (ambiguous.has(key)) {
          continue;
        }
        const merged = joined.get(key) ?? {};
        for (const [column, value] of Object.entries(row)) {
          if (column in merged && merged[column] !== value) {
            events.push({
              level: 'warning',
              code: 'league-conflict',
              message: `${nameOf(row)}: ${column} differs between the league files.`,
              details: { name: nameOf(row), column, kept: merged[column], found: value },
              view,
              scope: 'league',
            });
            continue;
          }
          merged[column] = value;
        }
        joined.set(key, merged);
      }
    }

    // A player missing from a file that was provided.
    for (const { view, rows } of sources) {
      const present = new Set(rows.map((row) => keyOf(side, row)));
      for (const [key, row] of joined) {
        if (!present.has(key)) {
          events.push({
            level: 'warning',
            code: 'unmatched-league-row',
            message: `${nameOf(row)} is missing from the league ${view} file.`,
            details:
              side === 'hitters' ? { name: nameOf(row), team: row.TM } : { name: nameOf(row) },
            view,
            scope: 'league',
          });
        }
      }
    }

    const rows = [...joined.values()];
    if (side === 'pitchers') {
      const kept = rows.filter((row) => row.G !== 0);
      if (kept.length < rows.length) {
        events.push({
          level: 'info',
          code: 'dropped-no-appearances',
          message: `${rows.length - kept.length} league pitchers with no appearances carry no data and were dropped.`,
          details: { count: rows.length - kept.length },
          view: 'pitching_superstats_1',
          scope: 'league',
        });
      }
      tables.pitchers = kept;
    } else {
      tables.hitters = rows;
    }
  }
  return tables;
}
