import { IMPORTER_VERSION } from '../version.ts';
import { parseCsv } from './csv.ts';
import { detectView } from './detect.ts';
import { VIEW_MANIFESTS, type Side, type ViewId } from './manifest.ts';
import { DROPPED_COLUMNS, canonicalColumn, parseCell, type CellValue } from './values.ts';

/** A team's own screen view, or the league's sortable stats. */
export type Scope = 'team' | 'league';

/** How the import treats a file, as stored in view_files.routing. */
export type Routing = 'primary' | 'supplemental' | 'rejected';

/** One import-log line, as stored in import_events. */
export interface ImportEvent {
  level: 'info' | 'warning' | 'error';
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

/** One player's values, keyed by canonical column name. */
export type ExportRow = Record<string, CellValue>;

export interface RoutedExport {
  view: ViewId | null;
  version: number | null;
  scope: Scope | null;
  /** The side the rows list, which can differ from the view's own side. */
  side: Side | null;
  routing: Routing;
  /** Empty for a rejected file. */
  rows: ExportRow[];
  events: ImportEvent[];
  /** The import rules this result came from, stored as view_files.importer_version. */
  importerVersion: string;
}

export interface RoutingSettings {
  /**
   * A file whose name carries neither the team nor the league prefix, and whose rows have
   * no TM column, is a league file when it has more rows than this. Source: the Seattle
   * sample, where team views list 12 or 13 players and league pitching files 446.
   */
  leagueRowThreshold: number;
}

export const DEFAULT_ROUTING_SETTINGS: RoutingSettings = { leagueRowThreshold: 60 };

/** The only views the league exports as sortable stats (Knowledge Base › Data sources). */
export const LEAGUE_VIEWS: ReadonlySet<ViewId> = new Set([
  'batting_superstats_1',
  'batting_superstats_2',
  'pitching_superstats_1',
  'pitching_superstats_2',
]);

const HITTER_POSITIONS = new Set(['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH']);
const PITCHER_POSITIONS = new Set(['SP', 'RP', 'CL']);

/** The pitching ratings view run on hitters supplies only the hitters' DEF Pot. */
const SUPPLEMENTAL_COLUMNS = ['Name', 'POS', 'DEF Pot'];

/** OOTP's export file names: "<team>_lineups_-_overview_<view>.csv" and the league's. */
const TEAM_FILE = '_lineups_-_overview_';
const LEAGUE_FILE = '_player_statistics_-_sortable_stats_';

/**
 * Reads one export and decides how the import treats it: its view and header version, team
 * or league scope, the side its rows list, and primary, supplemental or rejected routing.
 * Every decision is logged as an import event. A rejected file keeps no rows.
 */
export function routeExport(
  fileName: string,
  text: string,
  settings: RoutingSettings = DEFAULT_ROUTING_SETTINGS,
): RoutedExport {
  const events: ImportEvent[] = [];
  const result: RoutedExport = {
    view: null,
    version: null,
    scope: null,
    side: null,
    routing: 'rejected',
    rows: [],
    events,
    importerVersion: IMPORTER_VERSION,
  };
  const reject = (code: string, message: string, details?: Record<string, unknown>) => {
    events.push({ level: 'error', code, message, ...(details ? { details } : {}) });
    result.rows = [];
    return result;
  };

  const [header = [], ...records] = parseCsv(text);
  const detection = detectView(header);
  if (!detection.ok) {
    const details = Object.fromEntries(
      Object.entries(detection).filter(([key]) => !['ok', 'reason', 'message'].includes(key)),
    );
    return reject(
      detection.reason,
      detection.message,
      Object.keys(details).length > 0 ? details : undefined,
    );
  }
  const { view, version } = detection;
  Object.assign(result, { view, version });
  if (!detection.current) {
    events.push({
      level: 'warning',
      code: 'older-version',
      message: `An older ${view} export (v${version}): columns the newer version adds are missing.`,
      details: { version, current: VIEW_MANIFESTS[view].versions.length },
    });
  }
  if (records.length === 0) {
    return reject('no-rows', 'The file has a header but no players.');
  }

  const columns = header.map((column) => column.trim());
  for (const [index, record] of records.entries()) {
    if (record.length !== columns.length) {
      return reject(
        'malformed-row',
        `Row ${index + 1} has ${record.length} cells; the header has ${columns.length}.`,
        { row: index + 1, expected: columns.length, found: record.length },
      );
    }
    const row: ExportRow = {};
    for (const [i, column] of columns.entries()) {
      if (DROPPED_COLUMNS.has(column)) {
        continue;
      }
      const raw = record[i] ?? '';
      const cell = parseCell(column, raw);
      if (!cell.ok) {
        return reject('unreadable-cell', `Row ${index + 1}: ${cell.message}`, {
          row: index + 1,
          column,
          raw,
        });
      }
      row[canonicalColumn(view, column)] = cell.value;
    }
    result.rows.push(row);
  }

  const side = rowSide(result.rows) ?? VIEW_MANIFESTS[view].side;
  result.side = side;

  const scope = fileScope(fileName);
  const fromRows = rowScope(result.rows, settings);
  if (scope && fromRows.teams !== undefined && scope !== fromRows.scope) {
    return reject(
      'scope-mismatch',
      `The file is named as a ${scope} export, but its rows span ${fromRows.teams} teams.`,
      { named: scope, teams: fromRows.teams },
    );
  }
  result.scope = scope ?? fromRows.scope;
  if (!scope) {
    events.push({
      level: 'info',
      code: 'scope-from-rows',
      message: `The file name doesn't say team or league; its rows read as a ${fromRows.scope} file.`,
    });
  }
  if (result.scope === 'league' && !LEAGUE_VIEWS.has(view)) {
    return reject(
      'unsupported-league-view',
      `The league exports only superstats; ${view} isn't one.`,
    );
  }

  if (side !== VIEW_MANIFESTS[view].side) {
    if (view === 'cus_pitch_pot' && result.scope === 'team') {
      result.rows = result.rows.map((row) =>
        Object.fromEntries(SUPPLEMENTAL_COLUMNS.map((column) => [column, row[column] ?? null])),
      );
      result.routing = 'supplemental';
      events.push({
        level: 'info',
        code: 'supplemental-capture',
        message: 'The pitching ratings view lists hitters, so only their DEF Pot is kept.',
      });
      return result;
    }
    return reject(
      'wrong-side',
      `A ${view} export should list ${VIEW_MANIFESTS[view].side}, but its rows list ${side}.`,
      { expected: VIEW_MANIFESTS[view].side, found: side },
    );
  }

  result.routing = 'primary';
  return result;
}

/** The side most rows list, from their positions; undefined on a tie. */
function rowSide(rows: readonly ExportRow[]): Side | undefined {
  let hitters = 0;
  let pitchers = 0;
  for (const row of rows) {
    const position = row.POS;
    if (typeof position === 'string' && HITTER_POSITIONS.has(position)) {
      hitters += 1;
    } else if (typeof position === 'string' && PITCHER_POSITIONS.has(position)) {
      pitchers += 1;
    }
  }
  if (hitters === pitchers) {
    return undefined;
  }
  return hitters > pitchers ? 'hitters' : 'pitchers';
}

function fileScope(fileName: string): Scope | undefined {
  if (fileName.includes(LEAGUE_FILE)) {
    return 'league';
  }
  return fileName.includes(TEAM_FILE) ? 'team' : undefined;
}

/** Scope from the rows: more than one team in TM, or else the row count. */
function rowScope(
  rows: readonly ExportRow[],
  settings: RoutingSettings,
): { scope: Scope; teams?: number } {
  if (rows.some((row) => 'TM' in row)) {
    const teams = new Set(rows.map((row) => row.TM)).size;
    return { scope: teams > 1 ? 'league' : 'team', teams };
  }
  return { scope: rows.length > settings.leagueRowThreshold ? 'league' : 'team' };
}
