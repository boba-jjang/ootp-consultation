import { inColumnOrder, isFieldingHeader } from './dictionary.ts';
import type { Side } from './manifest.ts';
import { positionSide, type ExportRow, type RoutedExport, type Scope } from './route.ts';
import type { SnapshotEvent } from './validate.ts';
import type { CellValue } from './values.ts';

/**
 * League tables from the league files: Knowledge Base › Import contract › Joins and
 * snapshots. Each side keeps its own table, so a name on both sides has a record on each.
 * Every league file of a side fills its table: a filtered export (starters, relievers or
 * qualified players only) is one part of it, and a row repeated in two files merges.
 */
export interface LeagueTables {
  /** One row per hitter, merged across the league batting files on team plus name. */
  hitters: ExportRow[];
  /**
   * One row per pitcher with appearances, merged across the league pitching files on team plus
   * name when they carry TM, and by name when none does.
   */
  pitchers: ExportRow[];
  events: SnapshotEvent[];
}

/** Whether a file is a fielding file: its rows carry TC, ZR or EFF, or a fielding component with DEF Pot. */
const isFieldingFile = (file: RoutedExport) =>
  file.rows.length > 0 && isFieldingHeader(Object.keys(file.rows[0] ?? {}));

const nameOf = (row: ExportRow) => (typeof row.Name === 'string' ? row.Name : '');

/** Whether two parsed cells agree. Parsing already made Right and R, or -0.0 and 0, equal. */
export function sameValue(a: CellValue | undefined, b: CellValue | undefined): boolean {
  return (
    a === b ||
    (typeof a === 'object' &&
      a !== null &&
      typeof b === 'object' &&
      b !== null &&
      JSON.stringify(a) === JSON.stringify(b))
  );
}

/** A cell value as text, for messages. */
export const show = (value: CellValue | undefined) =>
  typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value);

/** A table being merged: one row per key in first-seen order, and the file of each cell. */
export interface MergingTable {
  rows: Map<string, ExportRow>;
  sources: Map<string, Map<string, string>>;
}

export const mergingTable = (): MergingTable => ({ rows: new Map(), sources: new Map() });

/**
 * Merges one file's row into a table cell by cell, files in the order given: Knowledge Base
 * › Import contract › Invariants. Equal values merge silently. A blank never replaces a
 * value: it fills only a column the row doesn't carry yet, and a later value fills a blank
 * silently. A later differing value replaces an earlier one, and the warning names the
 * player, the column, both values and both files.
 */
export function mergeRow(
  table: MergingTable,
  key: string,
  row: ExportRow,
  file: RoutedExport,
  scope: Scope,
  events: SnapshotEvent[],
): void {
  const merged = table.rows.get(key) ?? {};
  const sources = table.sources.get(key) ?? new Map<string, string>();
  for (const [column, value] of Object.entries(row)) {
    const earlier = merged[column];
    const carried = Object.hasOwn(merged, column);
    if (carried && (value === null || sameValue(earlier, value))) {
      continue;
    }
    if (carried && earlier !== null) {
      const earlierFile = sources.get(column) ?? '';
      events.push({
        level: 'warning',
        code: 'value-replaced',
        message: `${nameOf(row)}: ${column} is ${show(value)} in ${file.name} and was ${show(earlier)} in ${earlierFile}; the later file's value is kept.`,
        details: {
          name: nameOf(row),
          column,
          earlier,
          later: value,
          earlierFile,
          laterFile: file.name,
        },
        file: file.name,
        view: file.view,
        scope,
      });
    }
    merged[column] = value;
    sources.set(column, file.name);
  }
  table.rows.set(key, merged);
  table.sources.set(key, sources);
}

/** A merged table's rows, each with its columns in the side's table order. */
export const rowsOf = (table: MergingTable, side: Side): ExportRow[] =>
  [...table.rows.values()].map((row) => inColumnOrder(row, side));

/**
 * The team's two tables, merged by name across the team files in the order given: a
 * player's row merges every file that lists him and keeps the place where he first
 * appeared. Rejected files are left out; the hitter capture adds its DEF Pot.
 */
export function importTeam(files: readonly RoutedExport[]) {
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
 * Merges the snapshot's league files into one table per side, files in the order given.
 * Batting rows key on team plus name; pitching rows too when any row of a league pitching
 * file carries TM, and on name when none does, whatever TM the fielding files carry. A row without TM takes the team of the one league row of
 * its side with that name and a TM, or is flagged and left out; fielding files don't count
 * there. A fielding file lists both sides, so its rows go by POS. A key listed twice within
 * one file can't be joined and is left out. Pitchers with G = 0 carry no data and are dropped.
 */
export function importLeague(files: readonly RoutedExport[]): LeagueTables {
  const events: SnapshotEvent[] = [];
  const tables: LeagueTables = { hitters: [], pitchers: [], events };
  const league = files.filter((file) => file.scope === 'league' && file.routing !== 'rejected');
  /** A file's rows on one side: all of them, or a fielding file's by POS. */
  const rowsOn = (file: RoutedExport, side: Side) =>
    file.rows.filter((row) => (file.side ?? positionSide(row.POS)) === side);

  // The teams each name has among each side's league rows that carry TM, fielding files aside.
  const teams: Record<Side, Map<string, Set<string>>> = { hitters: new Map(), pitchers: new Map() };
  for (const side of ['hitters', 'pitchers'] as const) {
    for (const file of league.filter(
      (candidate) => candidate.side === side && !isFieldingFile(candidate),
    )) {
      for (const row of file.rows) {
        if (typeof row.TM === 'string') {
          const named = teams[side].get(nameOf(row)) ?? new Set<string>();
          teams[side].set(nameOf(row), named.add(row.TM));
        }
      }
    }
  }
  // Pitchers key on team plus name once a league pitching file carries TM, as since Game 71;
  // a fielding file's TM doesn't count (the owner, 12 October 2026).
  const pitchersByTeam = teams.pitchers.size > 0;

  for (const side of ['hitters', 'pitchers'] as const) {
    const sources = league
      .filter((file) => file.side === side || file.side === null)
      .map((file) => ({
        file,
        rows: rowsOn(file, side).flatMap((row) => {
          const name = nameOf(row);
          if (side === 'pitchers' && !pitchersByTeam) {
            return [{ key: name, row }];
          }
          if (typeof row.TM === 'string') {
            return [{ key: `${row.TM}|${name}`, row }];
          }
          const found = [...(teams[side].get(name) ?? [])].sort();
          const [team] = found;
          if (found.length !== 1 || team === undefined) {
            events.push({
              level: 'warning',
              code: 'ambiguous-team',
              message: `${name} has no TM in ${file.name}, and the league ${side === 'hitters' ? 'batting' : 'pitching'} files list ${found.length === 0 ? 'no team' : `${String(found.length)} teams`} for that name, so the row is left out.`,
              details: { name, teams: found },
              file: file.name,
              view: file.view,
              scope: 'league',
            });
            return [];
          }
          return [{ key: `${team}|${name}`, row: { ...row, TM: team } }];
        }),
      }));

    // A key listed twice within one file can't be joined.
    const ambiguous = new Set<string>();
    for (const { file, rows } of sources) {
      const keys = rows.map(({ key }) => key);
      for (const [i, { key, row }] of rows.entries()) {
        if (keys.indexOf(key) !== i && !ambiguous.has(key)) {
          ambiguous.add(key);
          events.push({
            level: 'warning',
            code: 'duplicate-name',
            message: `${nameOf(row)} is listed more than once in ${file.name}, so the league files can't be joined for that name.`,
            details: { name: nameOf(row) },
            file: file.name,
            view: file.view,
            scope: 'league',
          });
        }
      }
    }

    const table = mergingTable();
    for (const { file, rows } of sources) {
      for (const { key, row } of rows) {
        if (!ambiguous.has(key)) {
          mergeRow(table, key, row, file, 'league', events);
        }
      }
    }

    const rows = rowsOf(table, side);
    if (side === 'pitchers') {
      const kept = rows.filter((row) => row.G !== 0);
      if (kept.length < rows.length) {
        events.push({
          level: 'info',
          code: 'dropped-no-appearances',
          message: `${rows.length - kept.length} league pitchers with no appearances carry no data and were dropped.`,
          details: { count: rows.length - kept.length },
          view: null,
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
