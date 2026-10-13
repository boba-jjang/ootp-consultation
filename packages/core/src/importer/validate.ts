import { sameValue, show } from './league.ts';
import type { Side, ViewId } from './manifest.ts';
import type { ExportRow, ImportEvent, RoutedExport, Scope, Split } from './route.ts';
import type { CellValue } from './values.ts';
import { RATING_COLUMNS } from '../ratings/columns.ts';

/**
 * Snapshot validation: Knowledge Base › Import contract › Invariants, checked on the
 * snapshot's merged tables, and on its files for names listed twice. Rejected files are
 * left out. Files may list different players and repeat one another: where they disagree,
 * merging has already logged the replaced value.
 */

export interface IdentityTolerances {
  /** RV against RV-FB + RV-BR + RV-OFF, in runs. Source: the Knowledge Base, ±0.15. */
  runValue: number;
  /** WH% against WH / SW. Source: one percent rounded to 0.1, so 0.0005. */
  rate: number;
  /** CTC% against 1 − WH%. Source: two percents rounded to 0.1, so 0.001. */
  complement: number;
  /** FF% + BR% + OFF% against 1. Source: three percents rounded to 0.1, so 0.0015. */
  pitchMix: number;
  /** CH against OSW × (1 − OC%). Source: CH is a whole count, so 0.5. */
  chaseWhiffs: number;
  /** A pitcher's BIP against BF − K − BB − HBP. Source: the Knowledge Base, 1. */
  ballsInPlay: number;
  /** GO% against GB ÷ (GB + FB). Source: the Knowledge Base, 0.006, since GO% has two decimals. */
  groundOuts: number;
}

export interface ValidationSettings {
  /** The league's display scale for ratings (team settings). The Seattle league uses 1–10. */
  ratingScale: { min: number; max: number };
  tolerances: IdentityTolerances;
}

export const DEFAULT_IDENTITY_TOLERANCES: IdentityTolerances = {
  runValue: 0.15,
  rate: 0.0005,
  complement: 0.001,
  pitchMix: 0.0015,
  chaseWhiffs: 0.5,
  ballsInPlay: 1,
  groundOuts: 0.006,
};

export const DEFAULT_VALIDATION_SETTINGS: ValidationSettings = {
  ratingScale: { min: 1, max: 10 },
  tolerances: DEFAULT_IDENTITY_TOLERANCES,
};

export interface IdentityFailure {
  identity: string;
  expected: number;
  found: number;
}

/** An import event about the snapshot: its tables, or one of its files. */
export interface SnapshotEvent extends ImportEvent {
  /** The file the event is about, where one file is its source. */
  file?: string;
  /** That file's known view; null for any other file, or for an event about merged rows. */
  view: ViewId | null;
  scope: Scope;
  /** The hand of the split tables the event is about; absent for the season's. */
  split?: Split;
}

/** A snapshot's four tables, merged from its files, ratings still on the league's scale. */
export interface SnapshotTables {
  hitters: readonly ExportRow[];
  pitchers: readonly ExportRow[];
  league: { hitters: readonly ExportRow[]; pitchers: readonly ExportRow[] };
}

/** Rounding slack for comparing floating-point sums. */
const EPSILON = 1e-9;

const num = (value: CellValue | undefined) => (typeof value === 'number' ? value : undefined);
const round = (value: number) => Math.round(value * 10_000) / 10_000;

/**
 * The identities that fail on a row, within the tolerances. Rows with G = 0, and hitter rows
 * with no plate appearances (PA 0 or blank; only hitters' files carry PA), carry no data and
 * are skipped; an identity whose columns the row lacks is skipped. A merged pitcher row
 * brings BIP and BF − K − BB − HBP together from different files.
 */
export function checkIdentities(
  row: ExportRow,
  tolerances: IdentityTolerances = DEFAULT_IDENTITY_TOLERANCES,
): IdentityFailure[] {
  if (row.G === 0 || row.PA === 0 || row.PA === null) {
    return [];
  }
  const failures: IdentityFailure[] = [];
  const check = (
    identity: string,
    expected: number | undefined,
    found: number | undefined,
    tolerance: number,
  ) => {
    if (
      expected !== undefined &&
      found !== undefined &&
      Math.abs(found - expected) > tolerance + EPSILON
    ) {
      failures.push({ identity, expected: round(expected), found });
    }
  };
  const value = (column: string) => num(row[column]);

  const [fb, br, offspeed] = [value('RV-FB'), value('RV-BR'), value('RV-OFF')];
  if (fb !== undefined && br !== undefined && offspeed !== undefined) {
    check('RV = RV-FB + RV-BR + RV-OFF', fb + br + offspeed, value('RV'), tolerances.runValue);
  }
  const [whiffs, swings, whiffRate] = [value('WH'), value('SW'), value('WH%')];
  if (whiffs !== undefined && swings !== undefined && swings > 0) {
    check('WH% = WH / SW', whiffs / swings, whiffRate, tolerances.rate);
  }
  if (whiffRate !== undefined) {
    check('CTC% = 100 − WH%', 1 - whiffRate, value('CTC%'), tolerances.complement);
  }
  const [chaseSwings, chaseContact] = [value('OSW'), value('OC%')];
  if (chaseSwings !== undefined && chaseContact !== undefined) {
    check(
      'CH = OSW × (1 − OC%)',
      chaseSwings * (1 - chaseContact),
      value('CH'),
      tolerances.chaseWhiffs,
    );
  }
  const [fastballs, breaking, offspeedMix] = [value('FF%'), value('BR%'), value('OFF%')];
  if (fastballs !== undefined && breaking !== undefined && offspeedMix !== undefined) {
    check('FF% + BR% + OFF% = 100', 1, fastballs + breaking + offspeedMix, tolerances.pitchMix);
  }
  const [bip, battersFaced, strikeouts, walks, hitBatters] = ['BIP', 'BF', 'K', 'BB', 'HP'].map(
    value,
  );
  if (
    battersFaced !== undefined &&
    strikeouts !== undefined &&
    walks !== undefined &&
    hitBatters !== undefined
  ) {
    check(
      'BIP = BF − K − BB − HBP',
      battersFaced - strikeouts - walks - hitBatters,
      bip,
      tolerances.ballsInPlay,
    );
  }
  const [groundBalls, flyBalls] = [value('GB'), value('FB')];
  if (groundBalls !== undefined && flyBalls !== undefined && groundBalls + flyBalls > 0) {
    check(
      'GO% = GB ÷ (GB + FB)',
      groundBalls / (groundBalls + flyBalls),
      value('GO%'),
      tolerances.groundOuts,
    );
  }
  return failures;
}

const nameOf = (row: ExportRow) => (typeof row.Name === 'string' ? row.Name : '');

const SIDES: readonly Side[] = ['hitters', 'pitchers'];

/**
 * Checks one snapshot's merged tables, and its team files for a name listed twice, and
 * returns what is wrong as import events. An empty list means the snapshot is sound.
 */
export function validateSnapshot(
  tables: SnapshotTables,
  files: readonly RoutedExport[],
  settings: ValidationSettings = DEFAULT_VALIDATION_SETTINGS,
): SnapshotEvent[] {
  const events: SnapshotEvent[] = [];
  const add = (
    scope: Scope,
    code: string,
    message: string,
    details: Record<string, unknown>,
    file?: RoutedExport,
  ) =>
    events.push({
      level: 'error',
      code,
      message,
      details,
      ...(file ? { file: file.name } : {}),
      view: file?.view ?? null,
      scope,
    });

  // Team rows join on name, so a name listed twice in one team file can't be placed.
  for (const file of files.filter((routed) => routed.scope === 'team')) {
    if (file.routing === 'rejected') {
      continue;
    }
    const names = file.rows.map(nameOf);
    for (const name of new Set(names.filter((name, i) => names.indexOf(name) !== i))) {
      add(
        'team',
        'duplicate-name',
        `${name} is listed more than once in ${file.name}.`,
        { name },
        file,
      );
    }
  }

  const { min, max } = settings.ratingScale;
  for (const [scope, rows] of [
    ['team', [...tables.hitters, ...tables.pitchers]],
    ['league', [...tables.league.hitters, ...tables.league.pitchers]],
  ] as const) {
    for (const row of rows) {
      for (const failure of checkIdentities(row, settings.tolerances)) {
        add(scope, 'identity', `${nameOf(row)}: ${failure.identity} doesn't hold.`, {
          name: nameOf(row),
          ...failure,
        });
      }
      for (const [column, value] of Object.entries(row)) {
        if (
          RATING_COLUMNS.has(column) &&
          typeof value === 'number' &&
          (value < min || value > max)
        ) {
          add(
            scope,
            'rating-out-of-scale',
            `${nameOf(row)}: ${column} ${value} is outside the ${min}–${max} scale.`,
            { name: nameOf(row), column, value },
          );
        }
      }
    }
  }

  // A league row for one of the team's players equals the team's row, POS aside: a league
  // row can list another position (Knowledge Base › Columns that need special handling).
  for (const side of SIDES) {
    const team = new Map(tables[side].map((row) => [nameOf(row), row]));
    for (const row of tables.league[side]) {
      const own = team.get(nameOf(row));
      if (!own || (typeof own.TM === 'string' && own.TM !== row.TM)) {
        continue;
      }
      for (const [column, value] of Object.entries(row)) {
        if (column !== 'POS' && Object.hasOwn(own, column) && !sameValue(own[column], value)) {
          add(
            'league',
            'league-mismatch',
            `${nameOf(row)}: ${column} is ${show(value)} in the league's rows and ${show(own[column])} in the team's.`,
            { name: nameOf(row), column, league: value, team: own[column] },
          );
        }
      }
    }
  }
  return events;
}

/**
 * The counts vs left plus vs right must give the season: Knowledge Base › Import contract ›
 * Split exports. A pitcher's IP is in outs. G and GS count games against one hand, and a
 * pitcher's W, L, SV and HLD aren't split.
 */
export const SPLIT_COUNTS: Record<Side, readonly string[]> = {
  hitters: ['PA', 'AB', 'H', '1B', '2B', '3B', 'HR', 'BB', 'IBB', 'HP', 'SF', 'K'],
  pitchers: ['IP', 'BF', 'HA', 'HR', 'BB', 'K', 'HP'],
};

/** The four tables a snapshot keeps for the season and for each split, by scope and side. */
const KINDS = [
  { scope: 'team', side: 'hitters', rows: (tables: SnapshotTables) => tables.hitters },
  { scope: 'team', side: 'pitchers', rows: (tables: SnapshotTables) => tables.pitchers },
  { scope: 'league', side: 'hitters', rows: (tables: SnapshotTables) => tables.league.hitters },
  { scope: 'league', side: 'pitchers', rows: (tables: SnapshotTables) => tables.league.pitchers },
] as const;

/**
 * Checks the split tables against the season's: Knowledge Base › Import contract › Split
 * exports. Each player with a row in either hand's table and a season row of the same kind
 * must have vs left plus vs right equal to the season in SPLIT_COUNTS, wherever the season
 * row and a split row carry the column; a missing row or cell counts 0. A split row pairs
 * with its season row by key (the name on the team, team plus name in the league), or else
 * by name alone when exactly one season row has the name, as when a player changed teams. A
 * player with split rows but no season row is noted once; a mismatch warns, naming the player
 * and the columns.
 */
export function checkSplits(
  season: SnapshotTables,
  splits: Readonly<Record<Split, SnapshotTables>>,
): SnapshotEvent[] {
  const events: SnapshotEvent[] = [];
  for (const { scope, side, rows } of KINDS) {
    const keyOf = (row: ExportRow) =>
      scope === 'team' ? nameOf(row) : `${typeof row.TM === 'string' ? row.TM : ''}|${nameOf(row)}`;
    const seasonRows = rows(season);
    const byKey = new Map(seasonRows.map((row) => [keyOf(row), row]));
    const byName = new Map<string, ExportRow[]>();
    for (const row of seasonRows) {
      byName.set(nameOf(row), [...(byName.get(nameOf(row)) ?? []), row]);
    }
    const pairOf = (row: ExportRow) => {
      const named = byName.get(nameOf(row)) ?? [];
      return byKey.get(keyOf(row)) ?? (named.length === 1 ? named[0] : undefined);
    };

    const paired = new Map<ExportRow, ExportRow[]>();
    const unpaired = new Set<string>();
    for (const row of [...rows(splits.L), ...rows(splits.R)]) {
      const own = pairOf(row);
      if (own) {
        paired.set(own, [...(paired.get(own) ?? []), row]);
      } else if (!unpaired.has(keyOf(row))) {
        unpaired.add(keyOf(row));
        events.push({
          level: 'info',
          code: 'split-unmatched',
          message: `${nameOf(row)} has a vs-left or vs-right row among the ${scope === 'team' ? 'team' : 'league'}'s ${side} but no season row, so the splits' check leaves that player out.`,
          details: { name: nameOf(row), side },
          view: null,
          scope,
        });
      }
    }

    for (const [own, splitRows] of paired) {
      const columns = SPLIT_COUNTS[side].filter((column) => {
        if (!Object.hasOwn(own, column) || !splitRows.some((row) => Object.hasOwn(row, column))) {
          return false;
        }
        const total = splitRows.reduce((sum, row) => sum + (num(row[column]) ?? 0), 0);
        return Math.abs(total - (num(own[column]) ?? 0)) > EPSILON;
      });
      if (columns.length > 0) {
        events.push({
          level: 'warning',
          code: 'split-mismatch',
          message: `${nameOf(own)}: vs left plus vs right differs from the season in ${columns.join(', ')}, so the splits may come from another game.`,
          details: { name: nameOf(own), side, columns },
          view: null,
          scope,
        });
      }
    }
  }
  return events;
}
