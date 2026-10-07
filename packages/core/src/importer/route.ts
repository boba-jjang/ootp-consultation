import { IMPORTER_VERSION } from '../version.ts';
import { parseCsv } from './csv.ts';
import { detectView } from './detect.ts';
import { PITCHING_POTENTIALS, readColumns } from './dictionary.ts';
import { VIEW_MANIFESTS, type Side, type ViewId } from './manifest.ts';
import { parseCell, type CellValue } from './values.ts';

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
  /** The file name the export came in with, kept to show where data came from. */
  name: string;
  /** The known view whose header the file's matches exactly; null for any other file. */
  view: ViewId | null;
  version: number | null;
  scope: Scope | null;
  /** The side the rows list; null for a team file with rows on both sides, placed by POS. */
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
   * no TM column, is a league file when it has more rows than this. Source: Knowledge Base
   * › Side and scope, from the Seattle sample, where team views list 12 or 13 players and
   * league pitching files 212 to 446.
   */
  leagueRowThreshold: number;
}

export const DEFAULT_ROUTING_SETTINGS: RoutingSettings = { leagueRowThreshold: 60 };

/** OOTP's own views among the Game 42 league files, which coverage counts apart. */
export const LEAGUE_VIEWS: ReadonlySet<ViewId> = new Set([
  'batting_superstats_1',
  'batting_superstats_2',
  'pitching_superstats_1',
  'pitching_superstats_2',
]);

const HITTER_POSITIONS = new Set(['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH']);
const PITCHER_POSITIONS = new Set(['SP', 'RP', 'CL']);

/** The side a listed position belongs to; undefined for a blank or unknown one. */
export function positionSide(position: CellValue | undefined): Side | undefined {
  if (typeof position !== 'string') {
    return undefined;
  }
  if (HITTER_POSITIONS.has(position)) {
    return 'hitters';
  }
  return PITCHER_POSITIONS.has(position) ? 'pitchers' : undefined;
}

const OTHER_SIDE: Record<Side, Side> = { hitters: 'pitchers', pitchers: 'hitters' };

/** The pitching ratings view run on hitters supplies only the hitters' DEF Pot. */
const SUPPLEMENTAL_COLUMNS = ['Name', 'POS', 'DEF Pot'];

/** OOTP's export file names: "<team>_lineups_-_overview_<view>.csv" and the league's. */
const TEAM_FILE = '_lineups_-_overview_';
const LEAGUE_FILE = '_player_statistics_-_sortable_stats_';

const nameOf = (row: ExportRow) => (typeof row.Name === 'string' ? row.Name : '');

/**
 * Reads one CSV through the column dictionary and decides how the import treats it:
 * Knowledge Base › Import contract › Column dictionary and › Side and scope. Any header
 * works under any file name, as long as it has Name, POS and one more column the dictionary
 * knows. The file gets a view only when its header matches one of OOTP's exactly. Scope
 * comes from TM, else the file name, else the row count; side from the marker columns, else
 * the rows' POS. Every decision is logged as an import event. A rejected file keeps no rows.
 */
export function routeExport(
  fileName: string,
  text: string,
  settings: RoutingSettings = DEFAULT_ROUTING_SETTINGS,
): RoutedExport {
  const events: ImportEvent[] = [];
  const result: RoutedExport = {
    name: fileName,
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
  const info = (code: string, message: string, details?: Record<string, unknown>) =>
    events.push({ level: 'info', code, message, ...(details ? { details } : {}) });

  const [header = [], ...records] = parseCsv(text);
  const detection = detectView(header);
  if (!detection.ok && (detection.reason === 'empty' || detection.reason === 'duplicate-columns')) {
    const details = Object.fromEntries(
      Object.entries(detection).filter(([key]) => !['ok', 'reason', 'message'].includes(key)),
    );
    return reject(
      detection.reason,
      detection.message,
      Object.keys(details).length > 0 ? details : undefined,
    );
  }
  if (detection.ok) {
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
  }

  const columns = header.map((column) => column.trim());
  const missing = ['Name', 'POS'].filter((column) => !columns.includes(column));
  if (missing.length > 0) {
    return reject(
      'no-player-columns',
      `The file has no ${missing.join(' or ')} column; every file needs Name and POS.`,
      { missing },
    );
  }
  const reading = readColumns(columns);
  if (reading.notRead.length > 0) {
    info(
      'not-read',
      `Not read: ${reading.notRead.join(', ')}. The column dictionary has no reading for ${reading.notRead.length === 1 ? 'it' : 'them'}; the stored file keeps the cells.`,
      { columns: reading.notRead },
    );
  }
  if (!reading.names.some((name) => name !== null && name !== 'Name' && name !== 'POS')) {
    return reject('no-known-columns', 'The file has no column the app reads besides Name and POS.');
  }
  const { hitters: hitterMarkers, pitchers: pitcherMarkers } = reading.markers;
  if (hitterMarkers.length > 0 && pitcherMarkers.length > 0) {
    return reject(
      'both-sides',
      `The file mixes columns only hitters' files carry (${hitterMarkers.join(', ')}) with columns only pitchers' files carry (${pitcherMarkers.join(', ')}).`,
      { hitters: hitterMarkers, pitchers: pitcherMarkers },
    );
  }
  if (records.length === 0) {
    return reject('no-rows', 'The file has a header but no players.');
  }

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
      const name = reading.names[i];
      if (name === null || name === undefined) {
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
      row[name] = cell.value;
    }
    result.rows.push(row);
  }

  const scope = fileScope(fileName, result.rows, settings, info);
  result.scope = scope;

  const counts = { hitters: 0, pitchers: 0 };
  for (const row of result.rows) {
    const side = positionSide(row.POS);
    if (side) {
      counts[side] += 1;
    }
  }
  const marked: Side | null =
    hitterMarkers.length > 0 ? 'hitters' : pitcherMarkers.length > 0 ? 'pitchers' : null;

  if (marked === null) {
    // No marker: the rows' POS give the side.
    if (counts.hitters === counts.pitchers && (scope === 'league' || counts.hitters === 0)) {
      return reject(
        'side-unknown',
        "Neither the file's columns nor its rows' POS say whether it lists hitters or pitchers.",
        counts,
      );
    }
    if (scope === 'league' || counts.hitters === 0 || counts.pitchers === 0) {
      result.side = counts.hitters > counts.pitchers ? 'hitters' : 'pitchers';
    } else {
      // A team file on both sides, such as the bio view: each row goes by its own POS.
      const unplaced = result.rows.filter((row) => positionSide(row.POS) === undefined);
      if (unplaced.length > 0) {
        result.rows = result.rows.filter((row) => !unplaced.includes(row));
        info(
          'unplaced-rows',
          `Left out ${unplaced.map(nameOf).join(', ')}: the POS names neither a hitter's nor a pitcher's position.`,
          { names: unplaced.map(nameOf) },
        );
      }
    }
    result.routing = 'primary';
    return result;
  }

  result.side = marked;
  if (scope === 'team') {
    // The pitching ratings view run on the lineup supplies the hitters' DEF Pot.
    const capture =
      marked === 'pitchers' &&
      columns.some((column) => PITCHING_POTENTIALS.includes(column)) &&
      counts.hitters > counts.pitchers;
    const side: Side = capture ? 'hitters' : marked;
    const other = result.rows.filter((row) => positionSide(row.POS) === OTHER_SIDE[side]);
    if (other.length === result.rows.length) {
      return reject(
        'wrong-side',
        `The file's columns are ${side}' columns, but every row lists one of the ${OTHER_SIDE[side]}.`,
        { expected: side, found: OTHER_SIDE[side] },
      );
    }
    if (other.length > 0) {
      result.rows = result.rows.filter((row) => !other.includes(row));
      info(
        'other-side-rows',
        `Left out ${other.map(nameOf).join(', ')}: a team file of ${side} doesn't read the ${OTHER_SIDE[side]}' rows.`,
        { names: other.map(nameOf) },
      );
    }
    if (capture) {
      result.side = 'hitters';
      result.rows = result.rows.map((row) =>
        Object.fromEntries(SUPPLEMENTAL_COLUMNS.map((column) => [column, row[column] ?? null])),
      );
      result.routing = 'supplemental';
      info(
        'supplemental-capture',
        'The pitching ratings view lists hitters, so only their DEF Pot is kept.',
      );
      return result;
    }
  }

  result.routing = 'primary';
  return result;
}

/**
 * A file's scope: a TM column with more than one team makes a league file, and one team a
 * team file. Without TM, OOTP's file-name prefix decides; failing both, the row count.
 */
function fileScope(
  fileName: string,
  rows: readonly ExportRow[],
  settings: RoutingSettings,
  info: (code: string, message: string, details?: Record<string, unknown>) => void,
): Scope {
  const named: Scope | undefined = fileName.includes(LEAGUE_FILE)
    ? 'league'
    : fileName.includes(TEAM_FILE)
      ? 'team'
      : undefined;
  const teams = new Set(rows.flatMap((row) => (typeof row.TM === 'string' ? [row.TM] : []))).size;
  const scope: Scope =
    teams > 0
      ? teams > 1
        ? 'league'
        : 'team'
      : (named ?? (rows.length > settings.leagueRowThreshold ? 'league' : 'team'));
  if (named && named !== scope) {
    info(
      'scope-mismatch',
      `The file is named as a ${named} export, but its rows list ${teams} team${teams === 1 ? '' : 's'} in TM, so it reads as a ${scope} file.`,
      { named, teams },
    );
  }
  if (!named) {
    info(
      'scope-from-rows',
      `The file name doesn't say team or league; its rows read as a ${scope} file.`,
    );
  }
  return scope;
}
